#!/usr/bin/env python3
"""
TALON local agent — a tiny localhost-only HTTP server that holds your
VirusTotal API key and proxies IOC lookups for the TALON dashboard
(talon-hud.jsx), which cannot call VirusTotal directly from the browser
(no CORS on VirusTotal's side, and an API key shouldn't ship to a browser
tab anyway).

Endpoints (see README.md):
  GET /health                   -> {"status":"ok","services":{"virustotal":bool}}
  GET /ioc?value=<hash|ip|fqdn>  -> VirusTotal verdict for a hash/IP/domain

Setup:
  Either export VIRUSTOTAL_API_KEY in your shell each session, or copy
  .env.example to .env (same folder as this script) and fill in a real
  value — .env is git-ignored, so the key never gets committed. .env
  takes lower priority than a real exported env var.

    export VIRUSTOTAL_API_KEY="<your key>"

  pip install requests
  python3 virustotal_local_agent.py
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
    overriding anything already set in the real environment."""
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
REQUEST_TIMEOUT = 20

VIRUSTOTAL_API_KEY = os.environ.get("VIRUSTOTAL_API_KEY", "")
VT_BASE_URL = os.environ.get("VT_BASE_URL", "https://www.virustotal.com/api/v3")

HASH_RE = re.compile(r"^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$")


class AgentError(Exception):
    """Raised for any condition that should surface as {"error": "..."} to the dashboard."""


def vt_configured():
    return bool(VIRUSTOTAL_API_KEY)


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
        raise AgentError("VIRUSTOTAL_API_KEY is not set — export it (or fill in .env) and restart the agent.")
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
            self._send_json(200, {"status": "ok", "services": {"virustotal": vt_configured()}})
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
    if not vt_configured():
        print("WARNING: VIRUSTOTAL_API_KEY not set — IOC Quick-Check will report an error until it's exported.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"TALON local agent (VirusTotal) listening on http://{HOST}:{PORT} (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
