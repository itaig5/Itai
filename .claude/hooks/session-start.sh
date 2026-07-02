#!/bin/bash
# SessionStart hook — install project dependencies so tests, linters, and the build
# work in Claude Code on the web. Idempotent, non-interactive, best-effort.
# Covers rms-marketing-agent/mvp today and auto-covers the Next.js front-end +
# Python ML service once they're added (any package.json / requirements.txt).
set -uo pipefail

# Only run the heavy installs in the remote (web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "[session-start] not a remote session — skipping dependency install."
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT"
echo "[session-start] installing dependencies under $ROOT ..."

# --- Node / npm projects ---
while IFS= read -r pkg; do
  dir="$(dirname "$pkg")"
  echo "[session-start] npm install in $dir"
  ( cd "$dir" && npm install --no-audit --no-fund ) \
    || echo "[session-start] WARN: npm install failed in $dir (continuing)"
done < <(find . -name package.json -not -path '*/node_modules/*' -not -path '*/.git/*')

# --- Python projects (ML microservice, etc.) ---
while IFS= read -r req; do
  dir="$(dirname "$req")"
  echo "[session-start] pip install in $dir"
  ( cd "$dir" && python3 -m pip install -q -r requirements.txt ) \
    || echo "[session-start] WARN: pip install failed in $dir (continuing)"
done < <(find . -name requirements.txt -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/.git/*')

echo "[session-start] dependency install complete."
