# BUILD PROMPT — RevPilot (paste-free: point a Fable session at this file)

**How to use:** start a fresh Claude Code session on repo `itaig5/Itai`, branch
`claude/skill-scout-review-6u0hmc`, model **Fable**, then send one line:
> "Read `rms-marketing-agent/BUILD_PROMPT.md` and build the whole system. Confirm the plan in 4–6 bullets first."

---

## STEP 0 — orient (do this first)
A SessionStart hook (`.claude/hooks/session-start.sh`) auto-installs npm/pip deps on session start,
so tests are ready immediately. Confirm you're on the right branch and the tested core is green:
```
git branch --show-current        # expect: claude/skill-scout-review-6u0hmc
# if not:  git fetch origin && git checkout claude/skill-scout-review-6u0hmc
cd rms-marketing-agent
cat 00_README.md                 # index of docs 00–12 (12 = latest direction; it wins on conflicts)
cd mvp && npm test               # expect 22 passing — build ON this code, don't restart
```
Read docs **00, 01, 04, 07, 08, 09, 11, 12** and skim the rest. Build on `mvp/` (it already has the
signal math, the promotion guardrail, the rules engine, and the 3-tool contract, all tested).

---

## THE BUILD

Build "RevPilot" — a hybrid Revenue Management System (RMS) with an automated MARKETING ASSISTANT
for short-term-rental and small-hotel operators. Ship a COMPLETE, RUNNABLE app with a polished
FRONT-END the owner can open in a browser, use on seed data, and restyle.

### What it does (layered)
① A lean "mini-RMS brain" computes revenue + visibility signals per listing/date-window (occupancy,
   pace vs same-time-last-year, pickup, comp gap, ADR/RevPAN, orphan gaps, visibility/rank signals).
② A MARKETING ACTION LAYER turns each finding into a cross-channel OTA action. Its DEFAULT lever is
   to ADD a native OTA promotion (last-minute / basic / early-booker / weekly-LOS), NOT to cut the
   base nightly rate — native promotions earn the strikethrough badge + a search-rank boost; a flat
   rate cut doesn't. Depth = pace-deficit ladder (>20% behind -> 20%, 10–20% -> 15%, 5–10% -> 10%);
   enforce Vrbo's 5% minimum.
③ Channel connectors execute across platforms via a channel manager.
A continuous SELF-LEARNING loop improves the engine from its own outcomes. Target users are
"manual-first" operators with no RMS today — we are their first RMS.

### The key value — "add automatically" = one place, one click, every channel
Operators today log into Booking.com, Airbnb, and Expedia SEPARATELY to add the same promo three
times. In RevPilot the system recommends a promotion, the operator APPROVES IT ONCE in the
dashboard, and RevPilot PUSHES IT TO ALL RELEVANT PLATFORMS SIMULTANEOUSLY. Make that
"approve once -> execute everywhere" flow the centerpiece of the UI. (Optional advanced setting:
operator-set auto-execution bounds for low-risk promos. Also auto-turn-OFF a promo once pace recovers.)

### Front-end (first-class — the owner wants to see and design this)
Polished Next.js (App Router) + TypeScript + Tailwind + shadcn/ui dashboard, running on realistic
SEED DATA via `npm run dev`, understandable to a non-technical operator and easy to restyle (design
tokens in one place). Screens:
- Home: portfolio KPIs (occupancy, pace vs STLY, RevPAN) with clean charts.
- Promotion Radar: what promos are active on which channel across all listings, one grid.
- Recommendations feed: each card shows the plain-English "why" (grounded in metrics), the proposed
  promotion + depth + channels, a big "Approve & push to all channels" button (triggers multi-platform
  execution), plus dry-run preview and reject.
- Visibility panel: per-platform rank/impressions/conversion + program status, with "dropped -> here's the fix".
- Settings: autonomy level + operator-set auto-execution bounds; guardrail cap; channel connections.
- Audit & Outcomes: immutable log of every action + measured result + the learning engine's performance.
Clean, consistent, accessible, light/dark, tasteful placeholder branding.

### Visibility tracking (verified in doc 11: mostly EXTRANET-ONLY)
Funnel data (impressions, rank, CTR, conversion) is NOT available via a clean OTA API, and
auto-scraping the logged-in extranet is a ToS/account-ban risk (don't). Build a VisibilityProvider
with adapters: BookingMarketInsights (gated API: demand/pace, not the funnel), PublicRank (compliant
PUBLIC-search position proxy), OperatorInput (human-in-the-loop: operator uploads/enters extranet
metrics or CSV), Reviews/quality (via Guesty API). Visibility is another signal into the brain. On a
visibility DROP: ① auto-add the native promotion that regains rank (within bounds); ② recommend +
GUIDE enrolling in the OTA visibility program (deep link + checklist — no API); ③ flag content/quality
fixes. Then measure recovery.

### AI foundation / self-learning (core pillar — build ML-first)
Loop: signals -> recommendation -> (approved) action -> OUTCOME (booking lift / visibility change /
revenue) -> logged as labeled data -> models & policy update. Build: a data foundation (daily OTB
snapshots from day 1 + feature store + immutable OUTCOME LOG); ONLINE LEARNING now via a CONTEXTUAL
BANDIT selecting promo type + depth per context (no cold-start — MABWiser/Vowpal Wabbit); forecasting
that cold-starts on a foundation model (Nixtla TimeGPT zero-shot) -> StatsForecast/MLForecast as
history accrues; a model registry + eval harness (backtest, champion/challenger, "confidently wrong"
metric). The LLM orchestrates and EXPLAINS — it NEVER computes numbers or trains models; ML lives in
a Python/FastAPI microservice the TS backend calls.

### Hard guardrails (non-negotiable)
- Double-discount / clip-floor guard BEFORE every write (already implemented + tested in
  `mvp/src/guardrail`): OTA promos stack (Booking.com multiplicatively; Airbnb by priority) — never
  exceed a configurable cap (~35%) or fall below a break-even clip floor.
- Execute only after human approval (or operator-set bounds). LEGAL (RealPage settlement + CA
  AB325/SB763): PUBLIC/market data only; never pool confidential competitor data across operators;
  triggers use the property's OWN data only; no hidden auto-accept; immutable audit trail.
- Guesty caps token requests at 5/24h -> cache the token (Redis in prod). See `mvp/src/adapters/tokenCache.ts`.

### Integration
Build on GUESTY first — the only channel manager whose public API exposes OTA promotion management
(PromotionController: GET /v1/rm-promotions/promotions; PUT assign/unassign). Fully code the
GuestyAdapter behind an env flag; ship a SampleDataSource + mock adapter so the WHOLE app runs on
seed data without credentials. Hostaway second (rates/calendar only). Go through Guesty — direct OTA
APIs are gated/closed to a startup.

### Stack
TypeScript throughout. Next.js (App Router) + Tailwind + shadcn/ui front-end; Node/TS backend;
Postgres (Supabase); Mastra (@mastra/core) for the human-in-the-loop workflow (suspend/resume); a
Python/FastAPI ML microservice (bandit + forecasting) over HTTP. Node 22.6+. Keep `mvp/` tests green
(`node --test`).

### Build order (everything runs on SEED DATA; live OTA gated behind env)
1. Keep/extend the tested core. 2. VisibilityProvider + adapters (+ sample source). 3. GuestyAdapter
(real calls behind env flag) + SampleDataSource + mock adapter. 4. Python ML microservice (online
bandit + forecasting; outcome-log/feature-store schema; champion/challenger eval). 5. Mastra HITL
workflow wrapping the 3 tools: signals (incl. visibility) -> recommend (rules + bandit) -> verifier
(schema + guardrail + legal) -> approve -> push-to-all-channels (dry-run->live) -> outcome log.
6. The Next.js front-end (all screens) on seed data. 7. Daily snapshot job + nightly learning job;
seed realistic data (listings pacing behind/ahead, some stacked discounts, one visibility drop).
8. Tests green; README with `npm run dev` / `npm test`. Commit and push to this branch.

### Definition of done
`npm run dev` opens a dashboard showing the FULL loop on seed data: signals (incl. visibility) -> a
recommendation with its "why" -> Approve & push to all channels -> guarded execution -> outcome
logged -> the bandit visibly updating. GuestyAdapter + VisibilityProvider + ML service are
code-complete and credential-ready via env vars. `npm test` green.

Confirm the plan in 4–6 bullets, then build the whole thing. Only ask if a decision truly blocks you.
