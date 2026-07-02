# Direction v2 — Auto-Add Promotions, Visibility Handling, AI Foundation

**Date:** 2026-07-02 · Extends `04`/`07`/`08` with three requirements from Itai. Where this conflicts with earlier docs, **this wins**.

## 1. The marketing lever = ADD native promotions, not cut base rates
The primary action of the marketing engine is to **enroll/add a native OTA promotion** (last-minute, basic, early-booker, campaign) — because native promotions earn the **strikethrough badge + search-rank boost**, which a flat base-rate cut does not. Lowering the nightly rate is a *last resort*, not the default.

**What "automatic" means (the core time-saver):** the operator **approves once** in the dashboard, and the system **pushes the promotion to ALL relevant platforms at once** — instead of the operator logging into Booking.com, Airbnb, and Expedia separately to add the same promo three times. One place, one click, every channel. That is the headline value.

**Autonomy levels:**
- Default = **approve-then-push-everywhere** (human approves each recommendation; system executes across all channels simultaneously).
- Optional advanced = **auto-execution within bounds the operator sets once** (e.g. "auto-run up to 15% last-minute on nights pacing >15% behind; max 2 active promos/listing"). Compliant only because the bounds are operator-set (RealPage settlement — no hidden auto-accept).
- **Auto-turn-OFF:** unassign a promotion automatically once pace recovers to target.
- The deterministic guardrail (double-discount / clip-floor) always runs before any write, in every mode.

## 2. Visibility tracking + smart handling (see `11` for the API reality)
Visibility is **another signal into the RMS brain**. Funnel data is mostly extranet-only, so assemble it per-platform:
- **VisibilityProvider** with adapters: Booking Market Insights API (demand/pace, gated), compliant **public-search rank proxy**, **operator-input** (human-in-the-loop extranet metrics / CSV upload), reviews/quality via CM API. **Never** auto-scrape logged-in extranets (ToS).
- **On a visibility drop, the marketing part acts:** ① auto-add the right native promotion to regain rank (within bounds); ② recommend + guide enrolling in the visibility program (Visibility Booster / Accelerator / Genius — guided, no API); ③ flag quality/content fixes. Then **measure recovery** and feed it back to learning.

## 3. AI foundation / ML / self-learning (core pillar, not an afterthought)
Build the system **ML-first / self-learning-first as a design principle**, even though rules bootstrap v1 while data accrues. The "brain" gets smarter from its own outcomes.

**The self-learning loop (active from day 1):**
`signals → recommendation → (approved) action → OUTCOME (booking lift, visibility change, revenue) → logged as labeled data → models/policy update`

**Components:**
- **Data foundation:** daily OTB snapshots + a **feature store** + an **outcome log** (every recommendation, action, and its measured result). Capture from day 1 — the moat is proprietary outcome data.
- **Online learning from day 1 (no cold-start):** a **contextual bandit** selects *promo type + depth* per context (occupancy, pace, comp gap, lead time, visibility) and learns continuously from outcomes. Bandits work with modest data — this is the "self-learning brain" that improves immediately. (MABWiser / Vowpal Wabbit.)
- **Forecasting:** cold-start with a **foundation model** (Nixtla TimeGPT zero-shot) → graduate to StatsForecast/MLForecast as history accrues (docs 07). Forecasts feed pace/demand signals.
- **Elasticity / uplift:** as data grows, add causal elasticity (EconML/DoubleML) and uplift (which listings/nights actually respond) to target promotions.
- **Model registry + eval harness:** version models; backtest against held-out outcomes; a "confidently wrong" metric; champion/challenger before any model influences live recommendations.
- **The LLM stays the orchestrator/explainer** — it never computes numbers or trains models; the ML components are deterministic tools it calls. Guardrails and human-set bounds gate everything.

**Honest note:** model *quality* scales with accumulated outcome data. The design makes the system learn from day 1 (bandit + foundation forecasting) and improve continuously — but expect the trained models to meaningfully beat the rules only after real usage. That's why the concierge/early phase (doc 10) also seeds the outcome log.

## Architecture delta (vs `04`)
```
DATA (Guesty + public market data + visibility sources)
  -> ① RMS BRAIN: signals (occupancy/pace/pickup/comp) + VISIBILITY signals + forecasts (TimeGPT->Nixtla)
  -> ② MARKETING ACTION LAYER: choose PROMO TYPE + DEPTH via contextual bandit (learns online),
        default lever = ADD native promotion (badge+rank), depth from policy; guardrail check
  -> HUMAN APPROVAL or operator-set auto-execution bounds
  -> ③ CHANNEL CONNECTORS: Guesty PromotionController (assign/unassign); guided for program enrollment
  -> OUTCOME LOG -> LEARNING ENGINE (bandit update, model retrain) -> back into ①/②
```
