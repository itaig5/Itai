# Research Log — Gemini findings & decisions

Running record of external research (Gemini Deep Research) and the decisions it drove.

---

## 2026-07-01 · Gemini Task 2 — Do external RMS expose insights via API?

**Source:** Gemini Deep Research (Google Doc in the shared Drive folder). Multi-source, cited.

### Verdict
| RMS | Pace/occupancy | Comp/market | Attribution ("why") | Access model | Verdict |
|---|---|---|---|---|---|
| **Wheelhouse** | ✅ `neighborhood_occupancy` | ✅ `neighborhood_pricing` (25/50/75 pct), `market_report/time_series` | ✅ `price_recommendations?attribution=true` (seasonality, local_demand, occupancy_pacing, scarcity…) | **Self-serve API key**; 20 req/min in test | **Excellent** |
| **Beyond** | ✅ Partners API + **production MCP server (beta)** | ✅ `/compsets` (beta), market queries | ⚠️ Partial (recs, not daily factor breakdown) | PAT (`bpat_…`) or OAuth2 | **Viable** |
| **PriceLabs** | ❌ | ❌ (locked to dashboards) | ❌ black box | Self-serve ($1/listing/mo) | **Marginal** (rates only) |
| **Duetto** | (enterprise only) | (internal reports) | ❌ | B2B contract, 800€+/mo | **Unviable** |

### What it changes
1. **"Connect to external RMS" is now VIABLE — for Wheelhouse (excellent) and Beyond (via MCP).** My earlier assumption ("most RMS only push a price") holds for PriceLabs/Duetto but is **wrong for Wheelhouse/Beyond**, which expose pace, comp, and attribution.
2. **New buy-vs-build decision (fits solo+AI):** use the **Wheelhouse RM API as the bought source for comp-set / neighborhood pricing / neighborhood occupancy-pace** signals — the exact things a single customer's own data can't give you — instead of building comp-tracking or paying AirDNA. Keep your **own pace/OTB engine** (computed from Guesty reservation data) as the core you control. Hybrid: **own OTB pace + bought neighborhood signals.**
3. **`InsightsProvider` gets two real external implementations:** `WheelhouseProvider` (primary external), `BeyondProvider` (via MCP). `PriceLabsProvider` = rates-only fallback. This is the optional wedge for customers who already run one.

### Independent confirmations of our prior findings
- ✅ **Guesty is the only channel manager exposing OTA promotions via API** — and Gemini gave the exact endpoints:
  - `GET /v1/rm-promotions/promotions` (`promotioncontroller_getlist`) — scan active/eligible/expired promotions.
  - `PUT /v1/rm-promotions/promotions/{id}` (assign / **unassign** listings) — toggle a listing into/out of a promotion.
  - **Clarifies our 🟡 open question:** the API model is **assign/unassign listings to existing promotions**, not necessarily "create a promotion from scratch." That's enough for the core activate/deactivate workflow. (Still verify whether *create* is API or UI.)
- ✅ Legal guardrails reconfirmed (advisory only; public/market data; no confidential pooling).

### New material worth acting on
- **Sharper value props (add to PRD):**
  1. **Native promo > flat price drop** — a native promotion gets the **strikethrough "was/is" badge + a search-rank boost**; simply lowering the nightly rate does not. This is the strongest single argument for the product.
  2. **Double-discounting protection** — a flat RMS price cut *stacks on top* of an active OTA promo (e.g. 20% + 20% ≈ 36% off), eroding margin. The assistant tracks active promos and prevents this.
  3. **Orphaned-promotion auto-deactivation** — operators forget to switch promos off when demand recovers; the assistant auto-unassigns once pace hits target.
- **New competitor to track: Guesty PriceOptimizer (GPO)** — auto-suggests/triggers LOS promotions, **but locked to Guesty's ecosystem and can't ingest external signals.** Our edge: **platform-agnostic, cross-channel, and can ingest an external RMS.**
- **Validated mini-RMS methodology** — Gemini supplied a concrete pace/pickup implementation (dual-table schema: `reservations` + `daily_calendar_snapshots`; STLY day-of-week alignment; pickup over Δt windows; worked example) that matches and enriches `04`. Pitfalls flagged: normalize calendar blocks, day-of-week (not date) STLY alignment, holiday shift, sync latency.

### Still open
- Whether Guesty promotion **create** (vs assign/unassign) is API or UI-only.
- Exact Wheelhouse RM API pricing/limits at production scale.
- Beyond MCP server scopes (what an agent can read/write).
