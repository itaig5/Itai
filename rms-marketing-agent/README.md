# RevPilot — a revenue brain that runs the right deals on every channel

Hybrid **RMS + automated marketing assistant** for short-term-rental and small-hotel operators.
The mini-RMS brain computes revenue + visibility signals; the marketing layer turns findings into
**native OTA promotions** (badge + search-rank boost — not base-rate cuts); the operator **approves
once** and RevPilot **pushes to every connected channel simultaneously**; outcomes are measured and
a contextual bandit **learns from its own results**. Everything runs on realistic seed data with
zero credentials; every live integration is env-gated.

> Docs `00–12` in this folder hold the research and direction (12 wins on conflicts).
> `BUILD_PROMPT.md` is the build spec this implements.

## Run it

```bash
# Node 22.6+ (repo root: rms-marketing-agent/)
npm install
npm run dev          # -> http://localhost:3000  (dashboard on seed data)
npm test             # core engine tests (node --test)
npm run typecheck    # mvp + app

# optional — the Python ML microservice (bandit + forecasting; the app falls back in-process without it)
pip install -r ml-service/requirements.txt
npm run ml:dev       # -> http://localhost:8787
cd ml-service && python3 -m pytest tests/ -q

# jobs (the dashboard's "Advance 1 day" runs the same pipeline in fast-forward)
npm run job:snapshot # daily OTB snapshot + demand sim + outcome measurement + auto-turn-off
npm run job:learn    # nightly learning: measure due outcomes, update bandit, backtest champion/challenger
```

**Demo tour (the full loop, ~2 minutes):** open **Recommendations** → each card shows the
plain-English *why*, the per-channel **stacked-discount guard preview**, and the verifier checks →
hit **Approve & push to N channels** (Sunset Villa shows Booking.com being *blocked* at >35%
compounded while other channels execute) → **Promotion Radar** shows what's live where → click
**Advance 1 day** a few times → **Audit & Outcomes** shows the measured booking lift, the reward,
and the bandit's posteriors moving → promos **auto-turn-off** when pace recovers (see Radar →
"Recently ended"). **Visibility** shows the rank-drop story with the fix path, and takes your
extranet numbers (CSV/manual — funnels have no API; nothing is ever scraped).

## Layout

| Path | What it is |
|---|---|
| `mvp/` | `@revpilot/core` — the tested domain: signal math, rules + bandit policy, double-discount guardrail, verifier, cross-channel orchestrator, visibility provider (4 adapters), outcome log + TS fallback bandit, seed-world generator + day simulator, Mastra HITL workflow, Guesty/Hostaway/mock adapters, jobs. `npm test` = 86 tests. |
| `app/` | Next.js (App Router) dashboard: Home, Recommendations, Promotion Radar, Visibility, Clients (add + connect property-manager accounts: demo portfolio with zero creds, or Guesty/Hostaway with the client's own API credentials), Audit & Outcomes, Settings. Design tokens live in ONE place: `app/src/app/globals.css` (light + dark). API route handlers call the core directly. |
| `ml-service/` | Python/FastAPI microservice: contextual bandit (Thompson; MABWiser LinUCB optional), forecasting (pickup baseline → StatsForecast; TimeGPT cold-start behind `NIXTLA_API_KEY`), model registry + champion/challenger backtests + confidently-wrong metric. The TS side mirrors the bandit math and takes over when the service is down. |
| `mvp/src/db/schema.sql` | The Postgres (Supabase) shape for production; the demo persists the same state as JSON (`app/.data/`). |

## Env flags (see `.env.example`)

No env = full demo on seed data. `GUESTY_ENABLED` + credentials flips execution to the real Guesty
PromotionController (the only CM API that manages OTA promotions; token cached — Guesty caps token
requests at 5/24h). `HOSTAWAY_*` enables the rates/calendar-only second CM. `BOOKING_INSIGHTS_*`
enables the gated Market Insights API. `ML_SERVICE_URL` points the app at the Python service.

## Non-negotiables built in

- **Guardrail before every write**: Booking.com stacks multiplicatively (Genius × mobile × deal),
  Airbnb by priority; pushes beyond the cap (~35%) or below the break-even clip floor are blocked
  per channel. Vrbo promos are floored at 5% (below that: price cut, no badge).
- **Advisory by design**: human approval per action, or auto-execution strictly inside
  operator-set bounds (no hidden auto-accept); triggers use the property's OWN data + public
  comps only; immutable append-only audit trail. (Gibson/RealPage line, CA AB325/SB763.)
- **The LLM never computes numbers** — all math lives in deterministic tools; the verifier's
  grounding check rejects any rationale number that doesn't trace to a computed signal.
