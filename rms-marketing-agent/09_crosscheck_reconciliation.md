# Cross-Check Reconciliation — Claude ↔ Gemini

**Date:** 2026-07-01 · **Basis:** 3 Gemini Deep Research cross-checks (in the Drive folder) verifying Claude's findings in `07`/`08`.

**Headline:** Gemini **confirmed the great majority** of the conclusions and added useful depth. It **refuted/refined** a handful — the most important being the MCP/SDK landscape and the rule build-order. All corrections are folded into the docs; new material worth acting on is logged below.

---

## A. Algorithms cross-check → mostly CONFIRM, one build-order fix

| Claim | Gemini | Action |
|---|---|---|
| Rules-first build order | **REFINE** — compute **pace vs STLY *before* buying comp-set data** (STLY is zero-cost internal; comp-set is paid OpEx) | ✅ Fixed in `07`: order is now …LOS → **pace vs STLY** → comp-set |
| Double-discount guard first | **CONFIRM** — gave the exact stacking math (Booking.com multiplicative across Genius×Targeting×Portfolio; Airbnb priority hierarchy) + a `PromotionGuardrail` Python class | Keep; blueprint saved below |
| Bayesian P·Pr(book\|P) core | **CONFIRM** — sparse single-listing data → frequentist logistic fails to converge; PyMC + informative priors is correct | Keep |
| Causal elasticity (DML) | **CONFIRM** — endogeneity is real; DML/DoubleML PLR log-log is the fix | Keep |
| Pickup → Nixtla forecasting | **CONFIRM** — additive/multiplicative pickup first, then StatsForecast → MLForecast | Keep |
| Skip bespoke RL | **CONFIRM** — cold-start + collusion risk; contextual bandits (LinUCB) later | Keep |

**New items Gemini surfaced (act on):**
1. **Vrbo needs a ≥5% discount to trigger the strikethrough/merchandising badge** — enforce a **minimum promo depth of 5%** on Vrbo, else you get the price cut with none of the visibility. (Ties directly to the "native promo > flat cut" thesis.)
2. **Booking.com native promos (e.g. Mobile Rate, Getaway) can override the PMS's MinLOS** — a mobile rate can let guests book shorter than intended; the guard must account for channel-side overrides.
3. **Hostaway has NO coupon/promotion POST API** (confirmed again) — on Hostaway you must use **listing-level base-rate updates or pre-configured dashboard discount slots**, not promo objects.

---

## B. Agents/prompts cross-check → full CONFIRM + sharper legal + ops

Every architectural claim **CONFIRMED**: workflow-first (not autonomous), model never computes numbers, 3-tool contract, guardrail stack, LangGraph/Mastra, avoid multi-agent (Gemini added the "swarm token tax," Data-Processing-Inequality info loss, and inter-agent sycophancy as extra reasons). Gemini also supplied **working LangGraph (Python) and Mastra (TypeScript) HITL blueprints** (saved below).

**New/sharper items (act on):**
1. **RealPage settlement (Nov 25 2025) — specific mandates** that harden our legal design: (a) no non-public competitor inputs at runtime; (b) **occupancy/pace triggers must use the subject property's OWN data only** — never a competitor's non-public metrics; (c) **no "auto-accept" defaults**; (d) no delivering *aligned/identical* recommendations to competitors in the same micro-market (directional market-trend moves are OK).
2. **Guesty token limit: 5 token requests / 24h** → you MUST run a **persistent token cache (Redis) with lease-renewal**, or you'll lock out in production. Sync latency Guesty↔OTA ≈ a few min–10 min → build it into the verification loop.
3. **"Clip Floor"** — the verifier should block any payload whose compounded channel discounts fall below a break-even floor (a concrete form of the double-discount guard, enforced server-side).

---

## C. Skills/MCP/tools cross-check → CONFIRM skills, REFUTE parts of the MCP/SDK map

**Two of my claims were refuted — corrected in `07`:**
1. ❌ "Apaleo is the *only* official hotel MCP." **Refuted.** Also official: **Guesty MCP server (official beta, read-only** — `@guestyorg/sdk mcp` / `mcp.guesty.com`; docs: open-api-docs.guesty.com/docs/guesty-mcp-server-beta) and **Hospitable MCP (official, production** — `mcp.hospitable.com`). The **DLJRealty** Guesty MCP is the *community* one (more tools incl. write). AirROI = commercial market-data MCP (~22 tools).
2. ❌ "Only Cloudbeds (Python) & Expedia (JVM) have official SDKs." **Refined.** **Guesty also ships an official Node.js SDK** (`@guestyorg/sdk`, which powers its official MCP). Hostaway remains REST-only; Airbnb closed.

**Confirmed:** no official hospitality Claude skill; **alirezarezvani/claude-skills** (MIT, ~345 skills) is the best template; **pl-rm-skills** 3-layer "skill tree" is the design reference; no drop-in OSS RMS (revmng / PyEPO / tensor-house are the building blocks).

**New/important — state-level pricing law (beyond Gibson/RealPage):**
- **California AB 325 + SB 763 (Cartwright Act, effective Jan 2026):** statutory liability for using/distributing a **"common pricing algorithm"** used by ≥2 competitors that incorporates **shared competitor information**; lowered pleading standard; fines up to **$6M or 2× gain + treble damages**. → Using **public market data only** (e.g. AirROI) and **never pooling subscriber data** is what keeps you outside the "common algorithm" definition. This is now a hard compliance requirement, not just prudent.
- **New York Algorithmic Pricing Disclosure Act (effective Nov 2025):** requires "clear and conspicuous" disclosure when dynamic pricing uses personal/consumer-profile data ($1,000/violation). (You price on property/market signals, not consumer profiles — stay that way.)
- FTC precedent: Instacart/"Eversight" $60M settlement over profile-based price discrimination.

---

## Consolidated corrections applied to the docs
- `07`: rule build-order (pace vs STLY before comp-set); MCP section (Guesty official beta MCP + Hospitable official MCP + AirROI; DLJRealty = community); SDK note (Guesty official Node SDK added).
- `01`: risk table — added state pricing-law exposure (CA AB325/SB763, NY disclosure) to the antitrust row.
- This log (`09`) holds the full detail + the reusable blueprints below.

## Reusable blueprints Gemini produced (verbatim, worth keeping)
- **`PromotionGuardrail`** Python class — computes worst-case multiplicative compounded discount per channel (Booking.com: Genius×Mobile×Portfolio; Airbnb: rule-set×priority×non-refundable) and blocks if it exceeds a `max_effective_discount` (~0.35). *(In cross-check A doc.)*
- **PyMC** Bayesian booking-probability model + posterior-averaged `optimize_price` (expected-revenue max). *(Cross-check A.)*
- **DoubleML PLR** log-log elasticity recipe (Y-model, D-model, cross-fitting, residual-on-residual). *(Cross-check A.)*
- **Nixtla dual-phase** `DemandForecastingEngine` (StatsForecast → MLForecast). *(Cross-check A.)*
- **LangGraph** 5-node HITL state machine (fetch_signals → recommend → verifier → interrupt approval → execute) and **Mastra** `suspend()/resume()` equivalent. *(Cross-check B.)*
- **Guesty Redis token-cache** flow (TTL ~23.5h; refresh within 15 min of expiry). *(Cross-check A/B.)*
→ These live in the three Gemini cross-check docs in the Drive folder; pull them when scaffolding the repo.

## Net verdict
Claude and Gemini **agree on the whole architecture and strategy.** The deltas are refinements (build-order, Vrbo 5%, Booking MinLOS override), a factual correction (official Guesty/Hospitable MCPs + Guesty Node SDK), and important compliance additions (RealPage mandates + CA/NY state laws). **No conclusion was overturned — this is a green light to start building**, with the corrections above baked in.
