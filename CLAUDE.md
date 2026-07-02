# CLAUDE.md — working memory for this repo

## How to work with AI models here (apply every session)

These are Itai's standing preferences for working with any model (Fable, Opus, Sonnet, etc.).
Follow them unless a specific instruction overrides.

### Context & prompting
1. **Give the *Why*, not just the *What*.** State the goal, the intent, and the constraints. With the
   real objective, the model connects the dots and surfaces critical things that weren't asked for.
2. **Invest in infrastructure, not word-count.** Put durable context in files, memory, and tools —
   not long chat prompts. A short, sharp prompt on a well-set-up repo beats a 4-page brief. If a
   prompt is ballooning to pages, that's a sign the *system* is missing something — fix the system.
3. **One source of truth.** Decisions live in files (docs / this memory), and get referenced — don't
   re-litigate settled decisions in chat. Update the file, not the conversation.

### Boundaries & safety
4. **Say what NOT to do, explicitly.** Give clear fences: what not to touch, edit, delete, push, or
   send. Fast/creative models drift — bound them ("don't edit, delete, deploy, or send anything
   until I approve").
5. **Gate outward or irreversible actions.** Anything that pushes, sends, deletes, deploys, spends,
   or hits a live/external system → confirm first. Reversible building can run autonomously.
6. **Extend, don't restart.** Build on existing work; keep passing tests green; never silently
   rewrite or duplicate what already exists. Check the current state before creating.

### Execution style
7. **Match task size to the model.** Give capable models big, well-scoped tasks — don't over-
   fragment. Large, complex, end-to-end work is where the strong models pull ahead.
8. **Decide, then let it run.** For execution, give a decision + boundaries and let it work. Ask for
   options/tradeoffs only when you're genuinely choosing — not mid-build.
9. **Don't force reasoning narration.** For execution tasks, skip "explain your reasoning." Ask for
   concrete **artifacts** instead: a file/change manifest, a diff, test output, or a screenshot of
   the running app.

### Verification & loop
10. **Make it prove it — don't trust "done."** Require evidence: passing tests, real run output, a
    screenshot, a working URL. Faithful reporting beats confident claims; if something failed, say so.
11. **Small, checkpointed loops on big work.** Build → show an artifact → adjust. Beats one giant
    unseen run.
12. **Define "done" concretely.** State the output format and the definition-of-done up front so
    there's a clear finish line.

### Environment
13. **Give it the access it needs.** Tools/MCP, the right repo + branch, credentials via env vars,
    and a network policy that allows what the task requires. Capability beats clever wording.
14. **Keep context clean.** Start a fresh session for a new task; don't drag stale context. Persist
    what matters to files/memory, not the transcript.

---

## Repo context
- Main active project: **`rms-marketing-agent/`** — a hybrid RMS + marketing-assistant for short-term
  rentals & small hotels. Start at `rms-marketing-agent/00_README.md` (index of docs 00–12) and
  `rms-marketing-agent/BUILD_PROMPT.md` (the build spec). Tested starter code in `rms-marketing-agent/mvp/`.
- A SessionStart hook (`.claude/hooks/session-start.sh`) auto-installs deps.
- (The repo also contains an older, unrelated Italy-trip site at the root — ignore it for RMS work.)
