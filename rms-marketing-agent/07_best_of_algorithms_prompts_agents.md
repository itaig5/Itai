# Best-of: Algorithms, Prompts, Skills, Agents & Tools

**Status:** v2 (verified) · **Date:** 2026-07-01
**Basis:** parallel research agents, verified against primary sources (GitHub API, PyPI JSON, official docs) + Gemini Task 2 + analyst synthesis. 🟡 = confirm before relying (marketing claims / gated pages).

> Filter: "what actually helps a solo + AI builder ship rules-first, then ML, on Claude, Guesty-first." Not an academic survey.

---

## PART 1 — Algorithms

### 1a. Rule/heuristic pricing — your v1 (build in this order)
Verified build-order by data cost (the first four run off the operator's **own calendar** only):

1. **Occupancy-vs-target triggers** — occupancy band → % adjustment lookup. Highest ROI-per-effort. *(PriceLabs calls this "Occupancy Based Adjustment.")*
2. **Orphan-gap filling** — discount 1–2 night gaps between bookings + drop min-stay to gap length. *(PriceLabs default: 20% orphan discount; up to 5 gap ranges; when an orphan is also last-minute, it applies the **larger** of the two discounts.)*
3. **Booking-window / last-minute** — cascading discount curve by days-to-arrival.
4. **Length-of-stay** — premium on 1-night, tiered discounts for longer. *(PriceLabs caps LOS at 7 nights, applied to the final price.)*
5. **True booking pace/pickup vs STLY** — needs your own daily snapshots + a year of history, but it's **zero-cost internal data** (build snapshots now). *(Gemini cross-check: do this BEFORE buying comp-set data — STLY is free, comp-set is paid OpEx.)*
6. **Comp-set anchoring** — position vs. neighborhood median. **Buy this last** (Wheelhouse / AirROI) — recurring cost.

**The marketing-action policy (your differentiator):** `finding → {promo type, channel, depth}` with double-discount + orphan-promo guards. Rules now; contextual bandit later.

### 1b. Demand forecasting — v2 (behind the same `InsightsProvider`)
| Method | Role | Library (verified) |
|---|---|---|
| **Additive/multiplicative pickup** | **Use FIRST** — simple arithmetic on the booking curve; industry baseline | build on your snapshots |
| ETS / AutoARIMA | Cheap statistical baseline | **Nixtla `statsforecast`** (Apache-2.0; 20–500× faster than pmdarima/Prophet; has **Croston/ADIDA/TSB** for sparse booking data) |
| Global ML (LightGBM) | Best bang-for-buck; pools listings + price/event features | **Nixtla `mlforecast`** (Apache-2.0) |
| Prophet | Per-property seasonality baseline | `prophet` (MIT, 20.3k★, back to active maintenance) |
| Try-many-models | Experimentation/backtesting layer | **Darts** (9.4k★) or **sktime** (9.8k★, just hit v1.0) |
| Deep / zero-shot | Phase 2 only (data-hungry) | `neuralforecast`, `gluonts`; **TimeGPT** for cold-start (commercial API) |

**Top picks:** **StatsForecast** (core engine, intermittent-demand + scale) + **MLForecast** (production ML). Prophet/statsmodels as interpretable baselines.
**Do now for later:** capture **sold-out/closed-date flags** in your schema — you need them for **unconstrained-demand estimation (EM/Projection-Detruncation)** later, and can't reconstruct censoring after the fact.

### 1c. Price optimization & elasticity
- **Optimization solvers** (all permissive, free default solver): **OR-Tools** (discrete allocation/overbooking — CP-SAT), **CVXPY** (convex price optimization), **Pyomo**/**PuLP** (MILP), SciPy (prototyping). You likely won't need these until v2+.
- **Elasticity (causal, defensible):** **linearmodels** (IV/panel baseline — start here) → **EconML** or **DoubleML** (DoubleML has an official price-elasticity tutorial) → **DoWhy** for refutation tests. **pyBLP** for cross-price elasticity if you model competing products. ⚠️ `pyepal`/`or_pricing` are false leads — ignore.

### 1d. Advanced (RL / bandits) — the honest verdict
- **Full RL (DQN): not worth it for you.** The strongest real result (+11.8% RevPAR, China Lodging Group) needed ~2,000 hotels + a research team, and every credible model trains on a **demand simulator** you don't have. Cold-start is fatal at solo scale.
- **Contextual bandits: the one defensible "advanced" method** — for learning **promo depth** from outcomes. Libs: **MABWiser** (Fidelity, sklearn-style) or **Vowpal Wabbit**. Caveat: sparse bookings → keep to 3–5 price arms, pool across similar units, expect months before it beats a good heuristic.
- **Game-theoretic / competitive RL: AVOID.** Independent Q-learners provably learn tacit **collusion** (Calvano et al., *AER* 2020) — a real legal hazard. React to competitors with simple rules, not learned equilibria.
- **The proven production pattern (Airbnb, KDD 2018):** a **GBM booking-probability model + a regression with a customized loss** — not RL. Emulate this for v2 pricing, add a small bandit for the final nudge.

---

## PART 2 — Prompts & Agent Design (Claude)

**Governing principle (verified against Anthropic's *Building Effective Agents*):** prefer **workflows** (predefined code paths) over autonomous **agents**; the model **orchestrates and explains — it never computes the numbers.** All metrics come from deterministic tools.

**Recommended shape — a prompt-chaining workflow with an approval gate:**
```
getSignals()  →  [Analyst]  →  [Executor-proposer]  →  [Verifier/judge]  →  HITL approval  →  executePromotion(dry-run→live)
 (tool: all math   interprets    emits Recommendation    checks: numbers        interrupt()        gated, idempotent
  deterministic)    metrics       JSON (forced tool)      grounded? in policy?
                                  + self-consistency vote  confidence sane?
```

**Prompt patterns that matter:**
- **Structured output** via forced `tool_choice` (define an output "tool" whose schema *is* the recommendation) — deterministic + auditable.
- **Grounding / no-fabrication:** "Use ONLY the numbers in `<metrics>`; if missing, return NO_ACTION." A code validator rejects any rationale number not traceable to a signal.
- **Structured reasoning** (fixed analysis fields) over free CoT; let the model think, then emit JSON.
- **Self-consistency voting:** sample N; if the action disagrees, downgrade confidence → human.
- **LLM-as-judge:** a separate evaluator scores each rec against a rubric (grounded? within max-discount/floor/blackout? justified by pace/occ/comp?) before it's shown.
- **Allow "I don't know"** (NO_ACTION) — the #1 hallucination guardrail.

**Tool design (Anthropic *Writing effective tools*):** read/propose/write split — `getSignals` (read-only, does all math) · `recommendPromotion` (pure, no side effects, `requires_human_approval` always true) · `executePromotion` (gated by a live approval token, `dry_run` default, idempotency key). Return human-readable context, not raw IDs.

**Guardrails:** advisory by default; policy limits (max discount, rate floors, blackout, parity) enforced **in code**, not prompts; full audit chain (signals+freshness → reasoning → rec → judge score → approver+token → exact payload/result).

**Reference canon (all verified):** Anthropic — *Building Effective Agents*, *Writing effective tools for AI agents*, *Code execution with MCP*, *Reduce hallucinations*; the **Anthropic Cookbook** (github.com/anthropics/anthropic-cookbook); papers: ReAct (2210.03629), Reflexion (2303.11366), Self-Consistency (2203.11171). *(No reputable open-source "hotel promo agent" repo exists — build from these + your signals.)*

---

## PART 3 — Skills, Agents, MCP, SDKs, OSS, Datasets

### Agent frameworks
- **Python: LangGraph** (36k★, MIT) — best fit: native stateful graphs, **`interrupt()` human-in-the-loop** (perfect for approve-before-push), and cron/durable execution via LangGraph Server. Heaviest to learn, but the only one where you don't bolt on scheduling + durability. *Alternatives: OpenAI Agents SDK (leanest, but you supply scheduling/state), CrewAI (role-based, no native scheduler).*
- **TypeScript: Mastra** (25.7k★, v1.0) — batteries-included (agents + workflows + RAG + evals + native MCP). Built on **Vercel AI SDK** (the foundation layer). Best TS primary.
- **Decision:** if you go one-language TS (app+agent) → **Mastra**. If you want the strongest HITL/scheduling primitives → **LangGraph** (Python) with a TS app calling it. Both are MCP clients.

### MCP (the integration standard — now Linux Foundation-governed, industry-wide)
✅ **Corrected by Gemini cross-check (`09`):** more official servers exist than first thought.
- **Official, vendor-authored:** **Apaleo** (alpha, ~230–237 endpoints, OAuth2) · **Guesty MCP** (official *beta*, read-only — `@guestyorg/sdk mcp` / `mcp.guesty.com`; docs open-api-docs.guesty.com/docs/guesty-mcp-server-beta) · **Hospitable** (official, *production* — `mcp.hospitable.com`; read + tasks + guest messaging).
- **Community (more tools, incl. write — audit first):** `DLJRealty/guesty-mcp-server` (MIT; ~38 read tools free, Pro adds ~16 write incl. `update_pricing`) · `bluehawk27/pricelabs-mcp-server` (11 read+write incl. `set_overrides`) · **`akashnambiar-dot/pl-rm-skills`** ("Revenue Management Skill Tree", 14 skills/23 tools, 3-layer) = **the best design reference** (mock-data).
- **Commercial market-data:** **AirROI MCP** (~22 tools, pre-computed occ/ADR/RevPAR, 60-mo history, 365-day forward) — a strong **public-data bolt-on** (also helps the legal "public data only" posture).
- **Beyond** claims an MCP but no public artifact; **Agentic Hospitality TravelOS** = enterprise distribution/booking (not RMS).
- **You'll still build your own internal MCP host** exposing `getSignals`/`recommendPromotion`/`executePromotion` + adapters; the above are references + read/data bolt-ons.

### Claude / agent skills
- No official hospitality skill. **`alirezarezvani/claude-skills`** (MIT) is the best reusable + authoring template — its **variance-analysis, rolling-forecaster, commercial-forecaster** skills adapt to RMS budgeting; SKILL.md conventions are a clean scaffold.
- **xlsx** skill (Anthropic, source-available) — reference for **auditable rate/forecast/owner-report spreadsheets** (reimplement, don't vendor — it's proprietary-licensed).
- ⚠️ `hospitalityos/hotel-ai-skills` = proprietary stub (3★, no source) — **a competitor signal**, not reusable. SKILL.md is an open standard (agentskills.io) since Dec 2025 — author your own private `revenue-management` skill.

### Open-source RMS building blocks (no drop-in RMS exists — assemble)
- **`ikatsov/tensor-house`** (1.45k★, Apache-2.0) — best pricing-algorithm reference notebooks (Thompson sampling, DQN, demand curves).
- **`arikanatakan/revmng`** (+ `revmng-mcp`) (MIT) — purpose-built classical RM library, **hotel-aware** (EMSR, overbooking, LOS, bid-prices); ⚠️ brand-new/1★ — audit before depending.
- **`khalil-research/PyEPO`** (676★, MIT) — predict-then-optimize framework (most academically credible).
- **`airsim/rmol`** (C++, LGPL) / **`flix-tech/RevPy`** (dormant) — EMSR/bid-price references only.
- **`tule2236/Airbnb-Dynamic-Pricing-Optimization`** (238★) — most-starred community STR pricing template (clustering comps + kNN demand + optimization; note: it's a demand optimizer, not a rule engine).
- **QloApps** (13.9k★, OSL-3.0) — open-source hotel PMS/booking-engine (the operational layer, no RMS) — integration-shape reference.

### PMS / channel-manager SDKs (verified)
- **Official SDKs:** **Cloudbeds** (`cloudbeds-pms`/`cloudbeds-api-python`, Python, MIT, active) · **Expedia** (JVM/`rapid-java-sdk`; Node/Python archived) · ✅ **Guesty** (official **Node.js** `@guestyorg/sdk` — powers its official MCP; *corrected by Gemini*). Note: the old `@fern-api/guesty` npm is a stale beta — use `@guestyorg/sdk` instead.
- **Hostaway, PriceLabs, Beyond = REST/OAuth directly** (build a thin typed client).
- **Airbnb** = closed; reach it only via a partner-connected channel manager.

### Public datasets (for building/testing forecasting)
- **Antonio et al. "Hotel Booking Demand"** (Kaggle) — best single dataset: `lead_time`, `adr`, `reservation_status_date` → reconstruct booking curves + cancellations.
- **Inside Airbnb `calendar.csv`** (CC0) — real forward daily price/availability across many listings; multiple snapshots = real time series.
- **Expedia ICDM 2013** (Kaggle) — the best public source for **competitor-price / demand-at-price** signals.
- **Tcomp / M4 / M5** — forecasting benchmarks (M5 = daily hierarchical demand, closest analog).
- **Eurostat / UNWTO** (free) — macro demand indices as exogenous regressors.
- Note: your **own daily snapshots** will be the real training data.

---

## PART 4 — Recommended concrete stack (the shortlist to actually use)

| Layer | Pick | Why |
|---|---|---|
| **Rules engine (v1)** | hand-built, 6 heuristics in build-order | own calendar + Wheelhouse comps; explainable |
| **Comp/market data** | **Wheelhouse RM API** | buy pace/comp/attribution (see `06`) |
| **Agent** | **Claude** + prompt-chaining workflow + HITL | workflow > autonomous; grounded; audit-logged |
| **Agent framework** | **LangGraph** (Py) or **Mastra** (TS) | `interrupt()` approval + scheduling |
| **Integration** | **MCP host** + REST clients (Guesty via `DLJRealty` community MCP or direct REST) | standard seam; Guesty-first |
| **Forecasting (v2)** | **Nixtla StatsForecast + MLForecast** | intermittent-demand + global ML, verified fast |
| **Promo-depth learning (v2+)** | contextual bandit (**MABWiser**) | learn depth from outcomes; not full RL |
| **Elasticity (v2+)** | linearmodels → DoubleML/EconML | causal, defensible |
| **Data foundation** | daily OTB snapshots + sold-out flags from day 1 | enables pace + unconstraining + ML later |

## Key facts (verified, with sources)
- Nixtla StatsForecast: Croston/ADIDA/TSB intermittent models; 20–500× faster than pmdarima/Prophet — https://github.com/Nixtla/statsforecast
- Airbnb pricing = GBM booking-probability + custom-loss regression (Ye et al., KDD 2018) — https://dl.acm.org/doi/10.1145/3219819.3219830
- Algorithmic collusion from independent Q-learners — https://www.aeaweb.org/articles?id=10.1257/aer.20190623
- Anthropic *Building Effective Agents* (workflows > agents) — https://www.anthropic.com/engineering/building-effective-agents
- Anthropic *Writing effective tools for AI agents* — https://www.anthropic.com/engineering/writing-tools-for-agents
- Apaleo = only vendor-official hotel MCP (alpha); Guesty/PriceLabs MCPs are community (audit before use) — hospitality MCP ecosystem is early
- LangGraph HITL `interrupt()` — https://docs.langchain.com/oss/python/langgraph/interrupts
- Official SDKs: Cloudbeds (Python), Expedia (JVM); most others REST-only
- Best OSS building blocks: tensor-house, revmng, PyEPO; no drop-in OSS RMS exists

## Open questions
- Python (best ML libs) vs TypeScript (one language) — likely **TS app + Python forecasting microservice** at v2.
- LangGraph vs Mastra — decide when you start the agent layer.
- Audit `arikanatakan/revmng` before using it as the RM-math engine.
- Verify Guesty MCP server scope (read-only today) vs. what you need for execution.
