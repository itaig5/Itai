# CLAUDE.md — project memory for this repo

## How I work (personal rules)
My model-agnostic operating profile + working rules live in **`MY_RULES.md`** (repo root) — read it
and follow it. (Those rules are portable across projects/models; this file holds only repo-specific
context.)

## Repo context
- Main active project: **`rms-marketing-agent/`** — a hybrid RMS + marketing-assistant for short-term
  rentals & small hotels. Start at `rms-marketing-agent/00_README.md` (index of docs 00–12) and
  `rms-marketing-agent/BUILD_PROMPT.md` (the build spec). Tested starter code in `rms-marketing-agent/mvp/`.
- A SessionStart hook (`.claude/hooks/session-start.sh`) auto-installs deps on session start.
- (The repo also contains an older, unrelated Italy-trip site at the root — ignore it for RMS work.)
