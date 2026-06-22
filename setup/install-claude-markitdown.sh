#!/bin/bash
set -euo pipefail
# Installs the markitdown attachment->Markdown workflow GLOBALLY for Claude
# Code, so it applies to every project and every future session on this
# machine (macOS or Linux). Run once:  bash setup/install-claude-markitdown.sh
# Idempotent: safe to run repeatedly.

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
mkdir -p "$HOOKS_DIR"

# --- 1. Portable installer hook (works on macOS + Linux) ----------------
cat > "$HOOKS_DIR/markitdown-session-start.sh" << 'HOOK'
#!/bin/bash
set -euo pipefail
# Ensure the markitdown CLI is available. Async-friendly + idempotent.
echo '{"async": true, "asyncTimeout": 300000}'
command -v markitdown >/dev/null 2>&1 && exit 0
# Prefer pipx (clean global CLI, ideal on macOS); fall back to pip variants.
if command -v pipx >/dev/null 2>&1; then
  pipx install 'markitdown[all]' >/dev/null 2>&1 || true
fi
command -v markitdown >/dev/null 2>&1 && exit 0
python3 -m pip install --quiet 'markitdown[all]' >/dev/null 2>&1 \
  || python3 -m pip install --quiet --user 'markitdown[all]' >/dev/null 2>&1 \
  || python3 -m pip install --quiet --break-system-packages 'markitdown[all]' >/dev/null 2>&1 \
  || true
# Known glitch: _cffi_backend can be missing after the [all] install.
python3 -c "import _cffi_backend" >/dev/null 2>&1 \
  || python3 -m pip install --quiet --break-system-packages --force-reinstall cffi >/dev/null 2>&1 \
  || true
exit 0
HOOK
chmod +x "$HOOKS_DIR/markitdown-session-start.sh"

# --- 2. Portable conversion helper --------------------------------------
cat > "$HOOKS_DIR/to-markdown.sh" << 'HELPER'
#!/bin/bash
set -euo pipefail
# Convert an attachment to Markdown. Usage: to-markdown.sh <file> [out.md]
# Self-installs markitdown if missing (covers async race on session start).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v markitdown >/dev/null 2>&1; then
  bash "$DIR/markitdown-session-start.sh" >/dev/null 2>&1 || true
fi
IN="${1:-}"
[ -z "$IN" ] && { echo "usage: to-markdown.sh <file> [out.md]" >&2; exit 1; }
OUT="${2:-}"
if [ -n "$OUT" ]; then markitdown "$IN" > "$OUT" 2>/dev/null; echo "Wrote $OUT";
else markitdown "$IN" 2>/dev/null; fi
HELPER
chmod +x "$HOOKS_DIR/to-markdown.sh"

# --- 3. Register the hook in global settings.json (merge with python3) ---
python3 - "$CLAUDE_DIR/settings.json" "$HOOKS_DIR/markitdown-session-start.sh" << 'PY'
import json, os, sys
path, hook_cmd = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        with open(path) as f: data = json.load(f)
    except Exception: data = {}
hooks = data.setdefault("hooks", {})
ss = hooks.setdefault("SessionStart", [])
cmds = [h.get("command","") for grp in ss for h in grp.get("hooks", [])]
if not any("markitdown-session-start.sh" in c for c in cmds):
    ss.append({"hooks": [{"type": "command", "command": hook_cmd}]})
with open(path, "w") as f: json.dump(data, f, indent=2)
print("Updated", path)
PY

# --- 4. Global memory rule so Claude converts uploads every time ---------
GLOBAL_MD="$CLAUDE_DIR/CLAUDE.md"
MARKER="<!-- markitdown-attachment-rule -->"
if ! { [ -f "$GLOBAL_MD" ] && grep -qF "$MARKER" "$GLOBAL_MD"; }; then
cat >> "$GLOBAL_MD" << RULE

$MARKER
## Converting uploaded attachments (token saving)
When the user uploads/references a non-plain-text document (PDF, .docx,
.pptx, .xlsx, HTML, EPUB, images, etc.), convert it to Markdown first with
\`~/.claude/hooks/to-markdown.sh <file> /tmp/out.md\` and read the .md instead
of the raw file. Skip already-cheap text: .csv, .json, .xml, .md, .txt, code.
RULE
echo "Updated $GLOBAL_MD"
fi

echo "Done. markitdown workflow installed globally for Claude Code."
