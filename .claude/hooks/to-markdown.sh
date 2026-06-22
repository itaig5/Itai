#!/bin/bash
set -euo pipefail

# Convert an uploaded attachment to Markdown using Microsoft markitdown.
# Usage: to-markdown.sh <input-file> [output.md]
#   - With output path: writes the .md file.
#   - Without: prints Markdown to stdout.
# Self-bootstraps markitdown if it isn't installed yet.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! { command -v markitdown >/dev/null 2>&1 && python3 -c "import markitdown" >/dev/null 2>&1; }; then
  CLAUDE_CODE_REMOTE=true bash "$DIR/session-start.sh"
fi

IN="${1:-}"
if [ -z "$IN" ]; then
  echo "usage: to-markdown.sh <input-file> [output.md]" >&2
  exit 1
fi

OUT="${2:-}"
if [ -n "$OUT" ]; then
  markitdown "$IN" > "$OUT" 2>/dev/null
  echo "Wrote $OUT"
else
  markitdown "$IN" 2>/dev/null
fi
