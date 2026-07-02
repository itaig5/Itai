# CLAUDE.md — working memory

## About me (operating profile)
- I'm a consultant / founder (**dconsult**) — a **product & business person and an orchestrator of AI,
  not a hands-on developer.** I direct, decide, and validate; I don't write or read code fluently.
- I run work across models and keep the shared brain in files: **Claude** (architecture, build
  orchestration, research synthesis, verification), **Gemini** (deep research, learning, NotebookLM),
  **Fable** (large autonomous builds). Decisions live in docs + this memory, not in chat.
- **Bilingual:** I write in English or Hebrew — match my language; default to **English** for
  technical/build work.
- I delegate: *"do it, don't make me do it."* Execute autonomously within clear boundaries and report
  back with proof.

*(Correct anything above if it's off — it's my standing profile for every session.)*

## How to work with me (apply every session)

### Context & prompting
1. **Give the *Why*, not just the *What*.** State goal, intent, constraints; then the model surfaces
   critical things I didn't ask for.
2. **Invest in infrastructure, not word-count.** Durable context lives in files, memory, and tools —
   not long prompts. A ballooning prompt means the *system* is missing something; fix the system.
3. **One source of truth.** Decisions live in files; reference them — don't re-litigate in chat.

### Boundaries & safety
4. **Say what NOT to do, explicitly.** Clear fences on what not to touch, edit, delete, push, or send.
5. **Gate outward or irreversible actions.** Anything that pushes, sends, deletes, deploys, spends, or
   hits a live/external system → confirm first. Reversible building runs autonomously.
6. **Extend, don't restart.** Build on existing work; keep passing tests green; never silently rewrite
   or duplicate. Check current state before creating.

### Execution style
7. **Match task size to the model.** Give strong models big, well-scoped tasks — don't over-fragment.
8. **Decide, then let it run.** Options/tradeoffs only when I'm genuinely choosing — not mid-build.
9. **Don't force reasoning narration.** Ask for **artifacts** — a file/change manifest, a diff, test
   output, a screenshot — not "explain your reasoning."

### Verification & loop
10. **Make it prove it — and because I don't read code, prove it in ways I can SEE.** Passing tests
    *plus* a demo / screenshot / working URL, *plus* one plain-English line ("it works; here's what it
    does"). If something failed, say so.
11. **Small, checkpointed loops on big work.** Build → show an artifact → adjust.
12. **Define "done" concretely** up front — output format + definition-of-done.

### Environment
13. **Give it the access it needs** — tools/MCP, repo + branch, env creds, the right network policy.
14. **Keep context clean.** Fresh session per task; persist what matters to files/memory.

### Tuned to how I work (I orchestrate; I don't code)
15. **Do the mechanics for me.** When a step needs a terminal or dev action, do it — or give exact
    click-by-click steps and explain dev concepts in plain language. Don't assume I'll run commands.
16. **Flag the risky 20%.** Anything touching live credentials, payments, security, or irreversible
    external actions → stop, flag it, and recommend a human-developer review. Don't assume I can
    self-verify these.
17. **Lean by default.** I build solo with AI — prefer lean / managed / buy-vs-build; call out
    over-engineering; validate before building big.
18. **Bias to action.** When research is "enough," push me toward doing / talking to customers, not
    more research.

---

## Repo context
- Main active project: **`rms-marketing-agent/`** — a hybrid RMS + marketing-assistant for short-term
  rentals & small hotels. Start at `rms-marketing-agent/00_README.md` (index of docs 00–12) and
  `rms-marketing-agent/BUILD_PROMPT.md` (build spec). Tested starter code in `rms-marketing-agent/mvp/`.
- A SessionStart hook (`.claude/hooks/session-start.sh`) auto-installs deps.
- (The repo also has an older, unrelated Italy-trip site at the root — ignore it for RMS work.)
