# Reframed Architecture — RMS Brain → Marketing Assistant

**Status:** v2 (supersedes the architecture framing in `01`/`02` where they differ) · **Date:** 2026-07-01

> **The reframe (from Itai's input):** the marketing assistant is not a sibling of the RMS — it is the **action layer on top of an RMS brain.** Every promotion recommendation is an *outcome* of RMS findings (pace, pickup, occupancy vs. target, revenue vs. budget, comp position). So the product is layered, and we build a focused **mini-RMS as the engine** that feeds the marketing assistant.

## Locked decisions (this session)

| # | Decision | Consequence |
|---|---|---|
| 1 | **RMS is the engine, not a sellable product** | Keep it "good enough"; don't compete with PriceLabs on price optimization. The moat is the marketing translation + cross-channel execution. |
| 2 | **Target customers are manual-first (no RMS today)** | You are their *first* RMS. "Connect to an external RMS" is a **later optional wedge**, not core. Simplifies v1 a lot. |
| 3 | **Rules/pace-based v1; ML groundwork in parallel** | Ship explainable rules now; **capture granular timestamped data from day one** so a forecasting module can slot in behind the same interface later. |
| 4 | **Solo + AI build capacity** | Radically lean: managed services, buy-don't-build (market data), AI-assisted coding, minimal ops, no premature infra. |

## The layered architecture

```
┌────────────────────────────────────────────────────────────────┐
│  DATA IN  — from the channel manager (Guesty/Hostaway) + market   │
│  reservations (with booking timestamps) · calendar (avail/price/  │
│  min-stay) · listing meta · market comps (AirDNA/public)          │
└───────────────────────────────┬────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│  ① RMS BRAIN  (mini-RMS — the engine)                            │
│  computes SIGNALS → emits FINDINGS/opportunities                 │
│  occ% OTB · pace/pickup · vs target/budget · ADR · RevPAN ·      │
│  lead-time · comp gap · demand pressure                          │
│  ── exposed behind an InsightsProvider interface ──              │
└───────────────────────────────┬────────────────────────────────┘
                                 ▼  findings
┌────────────────────────────────────────────────────────────────┐
│  ② MARKETING ASSISTANT  (the differentiator)                     │
│  maps findings → marketing MOVES (which promo, channel, depth)   │
│  rules engine + explainability + human-in-the-loop approval      │
└───────────────────────────────┬────────────────────────────────┘
                                 ▼  approved actions
┌────────────────────────────────────────────────────────────────┐
│  ③ CHANNEL CONNECTORS  (from the API-lever research)             │
│  GuestyAdapter (promotions API!) · Hostaway (rates) · guided     │
└────────────────────────────────────────────────────────────────┘
```

## ① The mini-RMS engine (scope for v1)

**Philosophy:** compute the *specific* signals the marketing brain needs — not a best-in-class price optimizer. All of these are derivable from data the **Guesty/Hostaway APIs already expose** (reservations + calendar), so there's no new dependency.

**Signals (rules-based, explainable):**
| Signal | How | Needs |
|---|---|---|
| Occupancy % on-the-books (OTB) | booked nights ÷ available nights, per date/window | calendar + reservations |
| Pace / pickup | new bookings acquired per as-of date; OTB vs. same-time-last-year (STLY) | **daily snapshots over time** |
| Pace vs. target | OTB vs. the operator's occupancy/revenue budget | operator sets targets |
| ADR / RevPAN | realized rate; revenue per available night | reservations + calendar |
| Lead-time / booking window | distribution of days-to-arrival | reservation timestamps |
| Comp gap | your rate vs. market comp-set median | market data (buy) |
| Demand pressure | days-to-arrival × remaining availability × pace | derived |

**Findings (what the engine emits):** structured opportunities, e.g.
> `{ listing: X, window: nights 12–22, occ_otb: 35%, target: 60%, pace: 'behind STLY', comp_gap: '+15% vs market', signal: 'soft demand / overpriced', confidence: 0.72 }`

## ② The marketing rules engine (findings → moves)

The bridge. Each finding maps to candidate marketing moves, ranked, then sent for approval. Examples:

| RMS finding | Marketing move (candidate) | Channel / tier |
|---|---|---|
| Occ far below target + soft pace + comp gap positive (you're pricey) | 10–15% **Last-Minute deal** on the soft window | Booking.com/Guesty API 🟢 |
| Strong pace, occ ahead of target, long lead time | **Remove** discounts / raise floor; enroll nothing | rates API 🟢 |
| Chronic low visibility + healthy margin | Recommend **Genius / Visibility Booster** (can't API) | guided-execute 🟡 |
| Long-gap orphan nights between bookings | **Length-of-stay** discount / min-stay tweak | rates API 🟢 |
| New listing, no history | **New-listing promotion** + aggressive intro pricing | per-channel |

Start with ~10–15 transparent rules. Every recommendation shows its "why" (the finding) — that's both a trust feature and the legal guardrail (advisory, explainable, public-data-based).

## The `InsightsProvider` interface (own now, external later)

Same adapter pattern as the channel layer — so the marketing assistant doesn't care where insights come from:

```ts
interface InsightsProvider {
  id: string                                  // "internal-rms" | "pricelabs" | ...
  getSignals(listingId, range): Promise<Signals>       // occ, pace, adr, revpan, leadtime, compGap
  getFindings(listingId, range): Promise<Finding[]>     // ranked opportunities
  capabilities: { hasForecast: boolean; hasPace: boolean; hasTargets: boolean }
}
```
- **v1:** `InternalRmsProvider` (your mini-RMS).
- **Later (optional wedge):** `PriceLabsProvider` etc. — **but only if they expose usable signals via API.** ⚠️ Open question — most RMS likely push a *price*, not their forecast/pace. **This is a top Gemini research task** (see `05`). Because your ICP is manual-first (decision #2), this stays low-priority until validated.

## The ML groundwork (decision #3 "parallel B") — do this without building models

You are **not** building forecasting now. You **are**:
1. **Snapshotting OTB daily** — store `(listing, stay_date, as_of_date, booked_nights, price)` every day. This accumulates the **pace curves** any forecasting model needs. Miss this now and you can't train later.
2. Structuring `RmsEngine` so a `ForecastModule` can slot behind `getSignals()`/`getFindings()` without touching the marketing layer.
3. Keeping a clean event/audit log (recommendation → action → outcome) — this becomes labeled training data for "which recommendation actually lifted revenue."

## Lean solo+AI build stack (decision #4)

- **Backend + DB:** Supabase (Postgres + auth + row-level security) — minimal ops. Or plain Postgres on a managed host.
- **Jobs:** a lightweight scheduler for the daily snapshot + rate-limited channel writes (Supabase cron / a small queue). Don't over-engineer.
- **App:** Next.js (one language, AI-friendly, fast dashboards).
- **AI/agent:** Claude behind an internal MCP host; the RMS engine + connectors are MCP tools.
- **Market data:** **buy, don't build** — AirDNA / Key Data for comp/market signals.
- **Build style:** AI-assisted (Claude Code for the app + adapters; Gemini for research/learning). Ship the concierge MVP with **no code** first.

## Data model sketch

```
listings(id, cm_id, name, market, ...)
reservations(id, listing_id, checkin, checkout, booked_at, nights, revenue, channel, ...)
calendar_snapshots(listing_id, stay_date, as_of_date, available, price, min_stay)   -- daily OTB history
targets(listing_id, month, occ_target, revenue_budget)
market_comps(listing_id, date, comp_median_rate, source)
findings(id, listing_id, window, signal, metrics_json, confidence, created_at)
recommendations(id, finding_id, move_type, channel, params_json, status)            -- proposed/approved/executed
actions(id, recommendation_id, adapter, request_json, result_json, executed_at)     -- audit trail
```

## What changes in the other docs
- **`01_PRD`**: vision becomes explicitly two-layer (RMS brain + marketing assistant); "connect external RMS" demoted to future optionality.
- **`02_technical_mvp_plan`**: architecture diagram gains the RMS-brain layer + `InsightsProvider`; build sequence gets a "Phase 1.5: mini-RMS signals" before promo execution.
- **`03_api_lever_matrix`**: unchanged (channel APIs are the same); add a note that *RMS-insight* APIs of competitors are an open question for research.
