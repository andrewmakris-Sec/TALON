#!/usr/bin/env python3
"""
TALON local agent — a tiny localhost-only HTTP server that holds your
SentinelOne / VirusTotal API keys and proxies a few read-only calls for the
TALON dashboard (talon-hud.jsx), which cannot call these vendor APIs directly
from the browser (no CORS on the vendor side, and API keys shouldn't ship to
a browser tab anyway).

Endpoints (see README.md "Local Agent" section):
  GET /health                 -> {"status":"ok","services":{"sentinelone":bool,"virustotal":bool}}
  GET /vulns                  -> {"rows":[{"Endpoint","Application","Severity","Status","CVE"}, ...]}
  GET /ioc?value=<hash|ip|fqdn> -> VirusTotal verdict for a hash/IP/domain

Setup:
  Either export the three variables below in your shell each session, or copy
  .env.example to .env (same folder as this script) and fill in real values —
  .env is git-ignored, so credentials never get committed. .env takes lower
  priority than real exported env vars, so `export FOO=bar` always wins.

    SENTINELONE_URL="https://<your-console>.sentinelone.net"
    SENTINELONE_TOKEN="<your API token>"
    VIRUSTOTAL_API_KEY="<your key>"   # optional — enables IOC Quick-Check

  pip install requests
  python3 sentinelone_local_agent.py

Notes on the SentinelOne integration:
  This targets the "Application Risk" module's Installed Applications endpoint
  (GET /web/api/v2.1/installed-applications), which is the vulnerability
  surface most SentinelOne tenants have enabled and which maps cleanly onto
  TALON's Endpoint x Application x Severity model. If your tenant instead
  runs the newer Singularity Vulnerability Management module, its endpoint
  path differs — check your own console's API docs under
  Help -> API Hub (Swagger) at <SENTINELONE_URL>/api-doc/overview, and adjust
  S1_APPLICATIONS_PATH / the field names in _extract_row() below to match.
  Field names below are matched defensively (several candidate names tried
  per field) for exactly this reason.
"""

import ipaddress
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import requests


def _load_dotenv():
    """Load KEY=VALUE pairs from a .env file next to this script, without
    overriding anything already set in the real environment (a real `export`
    always wins over .env). No third-party dependency — the format is simple
    enough to hand-parse, and this keeps the "pip install requests" promise
    in the README accurate.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_dotenv()

HOST = "127.0.0.1"
PORT = 8787

SENTINELONE_URL = os.environ.get("SENTINELONE_URL", "").rstrip("/")
SENTINELONE_TOKEN = os.environ.get("SENTINELONE_TOKEN", "")
VIRUSTOTAL_API_KEY = os.environ.get("VIRUSTOTAL_API_KEY", "")

S1_APPLICATIONS_PATH = "/web/api/v2.1/installed-applications"
S1_RISK_LEVELS = ["critical", "high", "medium", "low"]  # excludes "none" (non-vulnerable) apps
S1_VALID_SEVERITIES = {"Critical", "High", "Medium", "Low"}
S1_PAGE_LIMIT = 1000
S1_MAX_ROWS = 20000  # safety cap so a huge tenant can't hang the request forever

VT_BASE_URL = os.environ.get("VT_BASE_URL", "https://www.virustotal.com/api/v3")

REQUEST_TIMEOUT = 20  # seconds, per upstream HTTP call

HASH_RE = re.compile(r"^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$")


class AgentError(Exception):
    """Raised for any condition that should surface as {"error": "..."} to the dashboard."""


def s1_configured():
    return bool(SENTINELONE_URL and SENTINELONE_TOKEN)


def vt_configured():
    return bool(VIRUSTOTAL_API_KEY)


def _extract(row, candidates):
    """Return the first present, non-empty value among several candidate field names."""
    for name in candidates:
        if name in row and row[name] not in (None, ""):
            return row[name]
    return None


def _extract_row(row):
    """Normalize one SentinelOne installed-applications item to TALON's expected shape.

    Field names are tried defensively (multiple candidates) since the exact
    response schema depends on your SentinelOne API version / module. If your
    rows come back with an empty Endpoint/Application/Severity, check the raw
    response (e.g. via curl) and add the real field names here.
    """
    endpoint = _extract(row, ["agentComputerName", "computerName", "agentName", "endpointName", "hostName", "hostname"])
    application = _extract(row, ["applicationName", "name", "appName", "softwareName"])
    version = _extract(row, ["applicationVersion", "version"])
    severity = _extract(row, ["riskLevel", "risk", "severity"])
    cve = _extract(row, ["cveIds", "cveId", "cves", "cve"])
    if isinstance(cve, list):
        cve = ", ".join(str(c.get("id", c) if isinstance(c, dict) else c) for c in cve)
    return {
        "Endpoint": endpoint or "",
        "Application": f"{application} {version}".strip() if version else (application or ""),
        "Severity": (severity or "").title(),
        "Status": "Active",
        "CVE": cve or "",
    }


def fetch_s1_vulns():
    if not s1_configured():
        raise AgentError("SENTINELONE_URL and SENTINELONE_TOKEN are not set — export them and restart the agent.")

    headers = {"Authorization": f"ApiToken {SENTINELONE_TOKEN}", "Content-Type": "application/json"}
    rows = []
    cursor = None
    while True:
        params = {"riskLevels": S1_RISK_LEVELS, "limit": S1_PAGE_LIMIT}
        if cursor:
            params["cursor"] = cursor
        try:
            resp = requests.get(f"{SENTINELONE_URL}{S1_APPLICATIONS_PATH}", headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as ex:
            raise AgentError(f"could not reach SentinelOne at {SENTINELONE_URL} — {ex}")
        if resp.status_code == 401 or resp.status_code == 403:
            raise AgentError(f"SentinelOne rejected the request ({resp.status_code}) — check SENTINELONE_TOKEN scope/expiry.")
        if not resp.ok:
            raise AgentError(f"SentinelOne API returned {resp.status_code}: {resp.text[:300]}")
        try:
            body = resp.json()
        except ValueError:
            raise AgentError("SentinelOne returned a non-JSON response — check SENTINELONE_URL.")

        items = body.get("data", [])
        if not isinstance(items, list):
            raise AgentError(f"unexpected SentinelOne response shape (no 'data' array): {str(body)[:300]}")
        # server-side riskLevels filtering is best-effort (exact query param format
        # can vary); always re-check client-side so a "none"-risk app never slips
        # through even if the server ignored/mis-parsed the filter.
        for r in items:
            row = _extract_row(r)
            if row["Severity"] in S1_VALID_SEVERITIES:
                rows.append(row)

        pagination = body.get("pagination") or {}
        cursor = pagination.get("nextCursor")
        if not cursor or len(items) == 0 or len(rows) >= S1_MAX_ROWS:
            break
    return rows


def detect_ioc_type(value):
    if HASH_RE.match(value):
        return "hash"
    try:
        ipaddress.ip_address(value)
        return "ip"
    except ValueError:
        return "domain"


def vt_lookup(value):
    if not vt_configured():
        raise AgentError("VIRUSTOTAL_API_KEY is not set — export it and restart the agent.")
    ioc_type = detect_ioc_type(value)
    path = {"hash": f"files/{value}", "ip": f"ip_addresses/{value}", "domain": f"domains/{value}"}[ioc_type]
    try:
        resp = requests.get(f"{VT_BASE_URL}/{path}", headers={"x-apikey": VIRUSTOTAL_API_KEY}, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as ex:
        raise AgentError(f"could not reach VirusTotal — {ex}")
    if resp.status_code == 404:
        return {"type": ioc_type, "value": value, "found": False}
    if resp.status_code == 401:
        raise AgentError("VirusTotal rejected the request (401) — check VIRUSTOTAL_API_KEY.")
    if not resp.ok:
        raise AgentError(f"VirusTotal API returned {resp.status_code}: {resp.text[:300]}")
    try:
        stats = resp.json()["data"]["attributes"]["last_analysis_stats"]
    except (ValueError, KeyError):
        raise AgentError("unexpected VirusTotal response shape.")
    malicious = stats.get("malicious", 0)
    suspicious = stats.get("suspicious", 0)
    harmless = stats.get("harmless", 0)
    undetected = stats.get("undetected", 0)
    return {
        "type": ioc_type,
        "value": value,
        "found": True,
        "malicious": malicious,
        "suspicious": suspicious,
        "harmless": harmless,
        "undetected": undetected,
        "total": malicious + suspicious + harmless + undetected,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep stdout quiet; errors still surface to the dashboard via JSON

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/health":
            self._send_json(200, {"status": "ok", "services": {"sentinelone": s1_configured(), "virustotal": vt_configured()}})
            return

        if parsed.path == "/vulns":
            try:
                rows = fetch_s1_vulns()
                self._send_json(200, {"rows": rows})
            except AgentError as ex:
                self._send_json(200, {"error": str(ex)})
            return

        if parsed.path == "/ioc":
            value = (qs.get("value") or [""])[0].strip()
            if not value:
                self._send_json(200, {"error": "missing ?value= parameter"})
                return
            try:
                self._send_json(200, vt_lookup(value))
            except AgentError as ex:
                self._send_json(200, {"error": str(ex)})
            return

        self._send_json(404, {"error": "unknown endpoint"})


def main():
    if not s1_configured():
        print("WARNING: SENTINELONE_URL / SENTINELONE_TOKEN not set — SYNC S1 FROM LOCAL AGENT will report an error until they're exported.")
    if not vt_configured():
        print("WARNING: VIRUSTOTAL_API_KEY not set — IOC Quick-Check will report an error until it's exported.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"TALON local agent listening on http://{HOST}:{PORT} (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
