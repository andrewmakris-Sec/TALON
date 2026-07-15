#!/usr/bin/env bash
#
# install_agent_service.sh — macOS-only. Registers sentinelone_local_agent.py
# as a launchd user service so it starts automatically on login (and restarts
# itself if it ever crashes), instead of needing a terminal window open.
#
# What this does:
#   1. Prompts you once for SENTINELONE_URL / SENTINELONE_TOKEN / VIRUSTOTAL_API_KEY
#      (reusing whatever's already in .env as defaults, if that file exists).
#   2. Writes a launchd plist to ~/Library/LaunchAgents/, using Python's
#      plistlib to build it — safe against quotes/$/&/etc. in your token,
#      unlike hand-rolled XML string concatenation.
#   3. chmod 600's the plist, since it holds your API credentials in plain
#      text (same trust boundary as your shell profile or .env — readable
#      only by your own account, never committed to git, never sent anywhere).
#   4. Loads it immediately with launchctl, so the agent starts right now
#      AND on every future login.
#
# Usage:
#   ./install_agent_service.sh              install / update the service
#   ./install_agent_service.sh --uninstall   stop it and remove the plist
#
# Logs:
#   ~/Library/Logs/talon-agent/agent.out.log
#   ~/Library/Logs/talon-agent/agent.err.log
#
# Check status:
#   launchctl list | grep com.mechanicalorchard.talon.agent
#
# Restart after changing credentials — just re-run this script; it overwrites
# the existing plist and reloads it.

set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script uses launchd, which is macOS-only. On Linux, just run:" >&2
  echo "  python3 sentinelone_local_agent.py" >&2
  echo "and use your own OS's service manager (systemd, etc.) if you want auto-start." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_PATH="$SCRIPT_DIR/sentinelone_local_agent.py"
ENV_FILE="$SCRIPT_DIR/.env"
LABEL="com.mechanicalorchard.talon.agent"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/talon-agent"

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

# Prefer a project-local virtualenv's python3 if one exists (matches the
# common `python3 -m venv venv` fix for macOS's "externally-managed-environment"
# pip error) — launchd runs with a minimal environment and won't see a venv
# you only `source activate`d in your shell, so we resolve the real binary path.
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

# reuse existing .env values as defaults, so re-running this script to change
# one credential doesn't force you to retype all three
default_url="" default_token="" default_vt=""
if [[ -f "$ENV_FILE" ]]; then
  default_url="$(sed -n 's/^SENTINELONE_URL=//p' "$ENV_FILE" | head -1)"
  default_token="$(sed -n 's/^SENTINELONE_TOKEN=//p' "$ENV_FILE" | head -1)"
  default_vt="$(sed -n 's/^VIRUSTOTAL_API_KEY=//p' "$ENV_FILE" | head -1)"
fi

prompt_default() {
  local label="$1" default="$2" input
  if [[ -n "$default" ]]; then
    read -r -p "$label [press enter to keep current]: " input
    echo "${input:-$default}"
  else
    read -r -p "$label: " input
    echo "$input"
  fi
}

echo
echo "TALON local agent — launchd auto-start setup"
echo "(input is not echoed for the token; nothing here is written to shell history)"
echo
S1_URL="$(prompt_default "SentinelOne console URL (e.g. https://usea1-pondurance.sentinelone.net)" "$default_url")"
if [[ -n "$default_token" ]]; then
  read -r -s -p "SentinelOne API token [press enter to keep current]: " input_token; echo
  S1_TOKEN="${input_token:-$default_token}"
else
  read -r -s -p "SentinelOne API token: " S1_TOKEN; echo
fi
VT_KEY="$(prompt_default "VirusTotal API key (optional, enter to skip)" "$default_vt")"

if [[ -z "$S1_URL" || -z "$S1_TOKEN" ]]; then
  echo "Error: SentinelOne URL and token are both required." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_PATH")"

# Build the plist with plistlib (not string concatenation) so special
# characters in the token/URL are XML-escaped correctly no matter what they are.
S1_URL="$S1_URL" S1_TOKEN="$S1_TOKEN" VT_KEY="$VT_KEY" \
PYTHON_BIN="$PYTHON_BIN" AGENT_PATH="$AGENT_PATH" LABEL="$LABEL" \
LOG_DIR="$LOG_DIR" PLIST_PATH="$PLIST_PATH" \
"$PYTHON_BIN" <<'PYEOF'
import os
import plistlib

env = {
    "SENTINELONE_URL": os.environ["S1_URL"],
    "SENTINELONE_TOKEN": os.environ["S1_TOKEN"],
}
if os.environ.get("VT_KEY"):
    env["VIRUSTOTAL_API_KEY"] = os.environ["VT_KEY"]

plist = {
    "Label": os.environ["LABEL"],
    "ProgramArguments": [os.environ["PYTHON_BIN"], os.environ["AGENT_PATH"]],
    "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False},  # restart on crash, not on a clean exit
    "EnvironmentVariables": env,
    "StandardOutPath": os.path.join(os.environ["LOG_DIR"], "agent.out.log"),
    "StandardErrorPath": os.path.join(os.environ["LOG_DIR"], "agent.err.log"),
}
with open(os.environ["PLIST_PATH"], "wb") as f:
    plistlib.dump(plist, f)
PYEOF

chmod 600 "$PLIST_PATH"
echo "Wrote $PLIST_PATH (permissions restricted to your user only)"

# reload cleanly whether or not it was already running
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
    echo "  Uninstall: ./install_agent_service.sh --uninstall"
    exit 0
  fi
done

echo "✗ Could not confirm the agent came up. Check the logs:" >&2
echo "  tail -n 40 $LOG_DIR/agent.err.log" >&2
exit 1
