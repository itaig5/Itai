#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
# Ensures Microsoft markitdown is installed so uploaded attachments
# (PDF, Word, Excel, PowerPoint, HTML, images, etc.) can be converted
# to Markdown before the assistant reads them — saving input tokens.

# Async: return immediately and install in the background so the session
# starts without waiting. The to-markdown.sh helper self-installs on demand,
# covering the brief window before this finishes.
echo '{"async": true, "asyncTimeout": 300000}'

# Idempotent: skip if markitdown already imports cleanly.
if command -v markitdown >/dev/null 2>&1 && python3 -c "import markitdown" >/dev/null 2>&1; then
  exit 0
fi

pip3 install --quiet 'markitdown[all]' >/dev/null 2>&1 || true

# Known glitch: the [all] install can leave _cffi_backend missing.
python3 -c "import _cffi_backend" >/dev/null 2>&1 || \
  pip3 install --quiet --force-reinstall cffi >/dev/null 2>&1 || true
