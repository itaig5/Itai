#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
# Ensures Microsoft markitdown is installed so uploaded attachments
# (PDF, Word, Excel, PowerPoint, HTML, images, etc.) can be converted
# to Markdown before the assistant reads them — saving input tokens.

# Only needed in the remote (web) container, which is rebuilt each session.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Idempotent: skip if markitdown already imports cleanly.
if command -v markitdown >/dev/null 2>&1 && python3 -c "import markitdown" >/dev/null 2>&1; then
  exit 0
fi

pip3 install --quiet 'markitdown[all]' >/dev/null 2>&1 || true

# Known glitch: the [all] install can leave _cffi_backend missing.
python3 -c "import _cffi_backend" >/dev/null 2>&1 || \
  pip3 install --quiet --force-reinstall cffi >/dev/null 2>&1 || true
