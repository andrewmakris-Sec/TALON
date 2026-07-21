#!/usr/bin/env bash
#
# install_vt_agent_service.sh — macOS-only. Registers virustotal_local_agent.py
# as a launchd user service so it starts automatically on login (and restarts
# itself if it ever crashes), instead of needing a terminal window open.
#
# What this does:
#   1. Prompts you once for VIRUSTOTAL_API_KEY (reusing whatever's already in
#      .env as a default, if that file exists).
#   2. Verifies the key actually works against the real VirusTotal API before
#      doing anything else — a bad/placeholder key is rejected here instead of
#      silently getting installed into a live service.
#   3. Writes a launchd plist to ~/Library/LaunchAgents/, using Python's
#      plistlib (safe against quotes/$/&/etc. in the key).
#   4. chmod 600's the plist, since it holds your API key in plain text (same
#      trust boundary as .env — readable only by your account, never
#      committed to git, never sent anywhere).
#   5. Loads it immediately with launchctl, so the agent starts right now AND
#      on every future login.
#
# Usage:
#   ./install_vt_agent_service.sh              install / update the service
#   ./install_vt_agent_service.sh --uninstall   stop it and remove the plist
#
# Logs:
#   ~/Library/Logs/talon-vt-agent/agent.out.log
#   ~/Library/Logs/talon-vt-agent/agent.err.log
#
# Check status:
#   launchctl list | grep com.mechanicalorchard.talon.vtagent

set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script uses launchd, which is macOS-only. On Linux, just run:" >&2
  echo "  python3 virustotal_local_agent.py" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_PATH="$SCRIPT_DIR/virustotal_local_agent.py"
ENV_FILE="$SCRIPT_DIR/.env"
LABEL="com.mechanicalorchard.talon.vtagent"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/talon-vt-agent"

if [[ ! -f "$AGENT_PATH" ]]; then
  echo "Error: $AGENT_PATH not found. Run this script from inside the TALON repo." >&2
  exit 1
fi

uninstall() {
  echo "Stopping and removing $LABEL..."
  launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "Done. (.env and logs were left in place — delete $ENV_FILE and $LOG_DIR yourself if you want those gone too.)"
  exit 0
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
fi

if [[ -x "$SCRIPT_DIR/venv/bin/python3" ]]; then
  PYTHON_BIN="$SCRIPT_DIR/venv/bin/python3"
else
  PYTHON_BIN="$(command -v python3 || true)"
fi
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Error: no python3 found on PATH." >&2
  exit 1
fi
if ! "$PYTHON_BIN" -c "import requests" 2>/dev/null; then
  echo "Error: $PYTHON_BIN can't import 'requests'." >&2
  echo "Install it for that interpreter first, e.g.:" >&2
  echo "  $PYTHON_BIN -m pip install requests" >&2
  exit 1
fi
echo "Using interpreter: $PYTHON_BIN"

default_key=""
if [[ -f "$ENV_FILE" ]]; then
  default_key="$(sed -n 's/^VIRUSTOTAL_API_KEY=//p' "$ENV_FILE" | head -1)"
fi

echo
echo "TALON VirusTotal agent — launchd auto-start setup"
echo "(input is not echoed; nothing here is written to shell history)"
echo
if [[ -n "$default_key" ]]; then
  read -r -s -p "VirusTotal API key [press enter to keep current]: " input_key; echo
  VT_KEY="${input_key:-$default_key}"
else
  read -r -s -p "VirusTotal API key: " VT_KEY; echo
fi

if [[ -z "$VT_KEY" ]]; then
  echo "Error: a VirusTotal API key is required." >&2
  exit 1
fi
if [[ "$VT_KEY" == *"<"* || "$VT_KEY" == *"your"*"key"* ]]; then
  echo "Error: that looks like a placeholder, not a real API key." >&2
  exit 1
fi

echo "Verifying the key against the real VirusTotal API before installing the service..."
if ! VT_KEY="$VT_KEY" "$PYTHON_BIN" <<'PYEOF'
import os, sys
import requests
key = os.environ["VT_KEY"]
try:
    r = requests.get("https://www.virustotal.com/api/v3/domains/google.com",
                      headers={"x-apikey": key}, timeout=10)
except requests.RequestException as ex:
    print(f"Could not reach VirusTotal — {ex}", file=sys.stderr)
    sys.exit(1)
if r.status_code == 401:
    print("VirusTotal rejected the key (401) — check VIRUSTOTAL_API_KEY.", file=sys.stderr)
    sys.exit(1)
if not r.ok:
    print(f"VirusTotal returned {r.status_code}: {r.text[:200]}", file=sys.stderr)
    sys.exit(1)
print("VirusTotal key verified OK")
PYEOF
then
  echo "Error: not installing the service with an unverified key. Fix the above and re-run." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_PATH")"

VT_KEY="$VT_KEY" PYTHON_BIN="$PYTHON_BIN" AGENT_PATH="$AGENT_PATH" LABEL="$LABEL" \
LOG_DIR="$LOG_DIR" PLIST_PATH="$PLIST_PATH" \
"$PYTHON_BIN" <<'PYEOF'
import os
import plistlib

plist = {
    "Label": os.environ["LABEL"],
    "ProgramArguments": [os.environ["PYTHON_BIN"], os.environ["AGENT_PATH"]],
    "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False},
    "EnvironmentVariables": {"VIRUSTOTAL_API_KEY": os.environ["VT_KEY"]},
    "StandardOutPath": os.path.join(os.environ["LOG_DIR"], "agent.out.log"),
    "StandardErrorPath": os.path.join(os.environ["LOG_DIR"], "agent.err.log"),
}
with open(os.environ["PLIST_PATH"], "wb") as f:
    plistlib.dump(plist, f)
PYEOF

chmod 600 "$PLIST_PATH"
echo "Wrote $PLIST_PATH (permissions restricted to your user only)"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
if ! launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null; then
  launchctl load -w "$PLIST_PATH"
fi

echo "Waiting for the agent to come up..."
for i in 1 2 3 4 5; do
  sleep 1
  if curl -s -o /dev/null -w '' --max-time 2 http://localhost:8787/health 2>/dev/null; then
    echo
    echo "✓ Agent is running and will now start automatically on every login."
    echo "  Health check: $(curl -s http://localhost:8787/health)"
    echo "  Logs: $LOG_DIR/agent.out.log and agent.err.log"
    echo "  Status: launchctl list | grep $LABEL"
    echo "  Uninstall: ./install_vt_agent_service.sh --uninstall"
    exit 0
  fi
done

echo "✗ Could not confirm the agent came up. Check the logs:" >&2
echo "  tail -n 40 $LOG_DIR/agent.err.log" >&2
exit 1
