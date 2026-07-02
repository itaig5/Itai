# Engineering Playbook — Agent, Tools, Guardrails & Promotion/Price Methods

**Status:** v1 (verified) · **Date:** 2026-07-01
**Basis:** verified research (Anthropic platform docs + MCP spec fetched in full; NIST/EU AI Act/OWASP; academic + GitHub primary sources). Companion to `07` (the catalog); this is the "when you build, read this" reference.

---

## PART A — Agent architecture & tool design (verified)

### A1. Architecture: workflow-first, not autonomous
Anthropic's *Building Effective Agents* is decisive: prefer **workflows** (predefined code paths) over autonomous agents; add autonomy only when the path can't be hard-coded. For a pricing/promo product that must be **explainable + safe**, the verified recommended shape is **plan-and-execute + a verifier + a human gate**:

```
getSignals()  →  [Plan/Analyst]  →  [Recommend-proposer]  →  [Verifier/evaluator]  →  HUMAN APPROVAL  →  execute
 (tool: all       explicit,          emits Recommendation     independent check:        gate (interrupt        (gated,
  math, read-only) auditable plan     JSON (forced tool)       grounded? in policy?)     / can_use_tool)        idempotent)
                                      + self-consistency vote
```
- **Plan-and-execute** beats pure ReAct here: cheaper (strong model not re-invoked every step), and the plan is a reviewable artifact. Use ReAct-style reasoning only for the open-ended judgment step (it gives the visible thought→action trace = explainability).
- **Verifier** = Anthropic's evaluator-optimizer / a separate screening model (verified: a separate model screening outputs beats one model self-guarding).
- **Avoid multi-agent swarms:** Anthropic's multi-agent system used **~15× the tokens**; a single agent matched multi-agent on ~64% of tasks. Promo decisions are interdependent (occ/price/comp interact), not parallelizable — start single-agent + verifier.

### A2. The three-tool contract (verified against Anthropic tool-use + MCP spec)
Read / propose / **gated-write** split — the single most important safety structure.

| Tool | MCP annotations | Rules |
|---|---|---|
| `promo_getSignals` | `readOnlyHint: true`, `openWorldHint: true` | Does **all math**; safe to call speculatively; accepts filters + concise mode; returns **human-readable labeled signals** (not raw IDs); errors via `isError:true` so the model can self-correct. |
| `promo_recommend` | `readOnlyHint: true` | Pure analysis, **no side effects**; `enum` for `promotionType`/`channel`; returns a rationale + a **short-lived `recommendationId`** (the staging token). |
| `promo_execute` | `readOnlyHint:false, destructiveHint:true, idempotentHint:true` | The **only** write tool. Requires `recommendationId` + `idempotencyKey` (required params); `dryRun` default for preview; `strict:true`; description **forbids** preview/estimate use; two-step so signals→live can't happen in one model turn. |

Verified specifics that matter:
- **Descriptions are the #1 driver of correct tool use** — aim for 3–4+ sentences stating what it does, when to call, when NOT to. Use `input_examples` for the complex `execute` payload.
- **`tool_choice:{"type":"any"}` + `strict:true`** guarantees a schema-valid call — but **forced tool use is incompatible with extended thinking** (only `auto`/`none`), so if you want the model to *think* first, use `auto` + prompting, not forced.
- **Idempotency** via caller-supplied key: a duplicate `execute` within the window returns the cached result instead of double-issuing the promo.
- **Consolidate read tools, but keep `execute` its own gated tool** — never fold a destructive action into a multi-action tool.
- **Keep the toolset small** (3 tools is well within safe bounds; tool defs can silently eat 50k–130k tokens at scale).
- MCP annotations are **hints, not security** — enforce gating server-side regardless.

### A3. Anthropic-native approval gate
- **Claude Agent SDK** (Sept 2025) gives a layered permission model + **`can_use_tool` callback** and **`PreToolUse` hooks** — intercept `promo_execute`, enforce discount floors/blackouts/parity **in code**, and route to a human with a denial reason (audit trail). This is the Anthropic equivalent of **LangGraph `interrupt()`** (approve / **edit** / reject / respond; put side effects *after* the interrupt — resume re-runs the node).

### A4. Reusable references (verified live)
- **`anthropics/claude-cookbooks`** (renamed; 46.2k★) — `tool_use/customer_service_agent.ipynb` is the closest reusable pattern (domain tools + Claude orchestrating multi-step calls); `evals/` for decision-quality testing.
- Anthropic essays: *Building Effective Agents*, *Writing effective tools for AI agents*, *Advanced tool use*, *Reduce hallucinations*, *Increase output consistency*.
- Eval-driven tool refinement is high-leverage: build ~10 realistic OTA scenarios and iterate the three tool descriptions against measured selection/param accuracy.

---

## PART B — Guardrail & safety stack (verified)

The advisory-only design isn't just prudent — it maps to **OWASP LLM06 "Excessive Agency"** (the key risk) and **EU AI Act Art. 14** (human oversight; enforceable Aug 2026). Recommended stack:

1. **Structural advisory boundary** — no autonomous execution tool; the agent only proposes. Bounds Excessive Agency.
2. **Grounding + refusal** (Anthropic *Reduce hallucinations*, verbatim): explicitly **allow "I don't know"**, restrict to provided data ("use ONLY the numbers in `<metrics>`"), require **per-claim citations**, and **retract unsupported claims**. A code validator rejects any rationale number not traceable to a signal.
3. **Independent output validator** — a second model screens for fabricated figures / missing grounding before a human sees it (separate-screener beats self-guard).
4. **Confidence with skepticism** — verbalized confidence is **poorly calibrated / overconfident** (2024–26 literature). Use qualitative bands + corroborating signals (data recency, sample size, best-of-N agreement); disagreement across N samples → force human review. Track a **"confidently wrong"** metric (NIST framing).
5. **Approval gates by magnitude** — small changes low-friction; material discounts/price moves require **synchronous** human approval (OpenAI "refund threshold" / Anthropic "$100 flag" patterns).
6. **Immutable structured audit trail** — JSON schema IS the audit record: recommendation, **reason codes**, citations, confidence, model version, timestamp, approver + decision. Financial retention often ~7 yrs.
7. **Domain rails + antitrust flag** — topic/scope rails (NeMo Guardrails), input filters for prompt injection/PII (OpenAI), and a **flag on competitor-referencing recommendations** (algorithmic-collusion risk; ties to the *Gibson/RealPage* line in `01`).

Frameworks: **Guardrails AI** (composable validators + re-ask/fix loops), **NVIDIA NeMo Guardrails** (Colang topic rails), Anthropic Constitutional Classifiers.

---

## PART C — Promotion-decision & price-optimization methods (verified)

### C1. Pace deficit → discount depth (the marketing-action core)
Two-layer decision (the verified real-world pattern, Chen et al. 2023, *J. Operations Management*, deployed at ~2,000 hotels):
- **Outer:** choose discount **depth** as a function of pace deficit — a discrete ladder `{10%, 20%, 30%}`.
- **Inner:** map depth → concrete channel/rate-plan actions (an LP in the paper; **rules** for you).
- Chen's field result: **+11.8% RevPAR, +5.2% occ, +5.9% ADR** — but it needed RL + a simulator + 2,000 hotels. **You implement the outer layer as pace-vs-target threshold rules → fixed depth ladder** (what PriceLabs/Wheelhouse expose as rules). SOTA reference for later: **DISCO** (ASOS, ECML-PKDD 2024) — Thompson-sampling bandit **wrapped in an integer program** for budget/cost control.

### C2. Double-discounting guard (build this FIRST — deterministic)
The costliest, easiest-to-prevent failure. Verified OTA stacking rules to encode:
- **Booking.com:** deals don't auto-combine unless "**rate stacking**" is on; when they can't combine, **only the highest single discount applies**. **Genius** is a pricing product that **combines with others regardless**. Targeted rates (Mobile, Country) can't combine with each other but **stack on** Basic/Last-Minute/Early-Booker. Genius + mobile + early-booker + visibility can compound to **30%+ below intended**.
- **Airbnb:** won't stack **same-type** discounts; different types can stack **except New-Listing 20%**. Order: length-of-stay → then early-bird **OR** last-minute (never both); when two compete, **only the larger applies**. Custom promos compute on the rule-set price and can stack with LOS.
→ Build a **"max effective discount" simulator** that computes the compounded public price *before* pushing, with a hard cap. Cheap, deterministic, prevents the worst margin leak.

### C3. Price optimization (the RMS-brain pricing math)
Recommended core for a lean operator (verified):
- **Expected-revenue maximization: `maximize P · Pr(book | P)`** via a **booking-probability model** (logistic, or **Bayesian PyMC** which handles small samples + hierarchical pooling across listings). **This is the recommended primary optimizer** — per-listing, interpretable, needs only book/no-book history.
- **Elasticity (when data grows):** start with **segmented log-log regression** (`ln Q = β0 + β1 ln P`; β1 = elasticity) — but beware **endogeneity** (you raise prices *because* demand is high → biased). Graduate to **causal ML: EconML `LinearDML`/`CausalForestDML`** or **DoubleML** (continuous-treatment DML; DoubleML has a price-elasticity tutorial).
- **WTP for cold-start (no history):** quick **Van Westendorp** or **Gabor-Granger** survey to bound price; switch to **revealed WTP** from your own data once bookings accumulate.
- **Markdown for unsold nights:** a **days-to-arrival step-down ladder** (14/7/3/1 days) keyed to the lead-time booking curve; upgrade to the LP/tensor-house multi-interval optimizer only when jointly optimizing many rooms/dates.
- **Classical RM (only if you sell distinct sequential rate fences):** **EMSRb** (Belobaba) for how many nights to protect for late high-rate demand — verified more robust than EMSRa for varied clientele. Impl: **PyRM** (flix-tech).

### C4. Constrained discount optimization (middle tier above rules)
A small **CVXPY or PuLP** integer/LP model: **maximize revenue s.t. margin floor + max depth per category + promo budget + no-consecutive-promo**. Explainable, safe, and a natural upgrade from pure rules before any ML. Reference: `ikatsov/tensor-house` `price-optimization-multiple-time-intervals` (LP/MIP).

### C5. Uplift (defer)
"Who actually needs the discount to book" (targeting persuadables) via **EconML / causalml / scikit-uplift** — powerful but needs treatment/control data you won't have at low volume. Defer.

---

## Build order (synthesized, capacity-aware)
1. **Double-discount guard / max-effective-discount simulator** (C2) — deterministic, prevents the worst failure.
2. **Pace-vs-target → depth-ladder rules** (C1) + the 6 heuristics from `07` (occupancy triggers, orphan-gap first).
3. **The 3-tool agent + guardrail stack + human approval** (A, B) — advisory, grounded, audited.
4. **Bayesian `P·Pr(book|P)` optimizer** (C3) as the pricing engine; **Wheelhouse** for comp/pace data (`06`).
5. **Constrained CVXPY optimizer** (C4) when rules aren't enough.
6. **Forecasting (Nixtla), elasticity (EconML/DoubleML), bandits (MABWiser)** (`07`) — as data accrues. Uplift last.

## Top library picks (verified, permissive licenses)
- Agent: **Claude Agent SDK** (hooks/approval) or **LangGraph** (`interrupt()`); TS: **Mastra**.
- Pricing core: **PyMC** (Bayesian P·Pr(book|P)); elasticity: **EconML** / **DoubleML**; classical RM: **PyRM**.
- Optimization: **CVXPY** / **PuLP** / **OR-Tools**. Forecasting: **Nixtla StatsForecast/MLForecast**. Bandits: **MABWiser**.
- Reference notebooks: **`ikatsov/tensor-house`**. Guardrails: **Guardrails AI** / **NeMo Guardrails**.

## Open questions
- Confirm Guesty `promo_execute` maps to `PUT /v1/rm-promotions/promotions/{id}` (assign/unassign) — is *create* API or UI? (see `06`)
- Latency/cost budget for best-of-N self-consistency — reserve for high-value promos only?
- Approval model: single approver vs role-based (analyst proposes, revenue manager approves)?
