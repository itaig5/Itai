# Revenue Management System + "Marketing Agent" — Product Strategy & PRD

**Status:** Draft v1 · **Date:** 2026-06-30
**Owner:** Itai (dconsult)
**Source basis:** Deep-research run (26 sources, 21 adversarially-verified claims) + focused API-lever research.

> Verification legend: ✅ = claim passed 3-voter adversarial verification in the research run. Unmarked = analyst judgment / domain knowledge.

---

## 1. Vision

> **Architecture reframe (v2 — see `04_rms_engine_and_architecture.md`):** the product is **layered**. A focused **RMS brain** (mini-RMS) computes revenue signals and findings; a **marketing assistant** turns those findings into cross-channel promotion moves and executes them. The marketing layer is the *outcome* of the RMS layer — not a separate thing.

A revenue platform for accommodation operators (short-term rentals **and** small hotels/B&Bs), built as two layers:

1. **RMS brain (the engine, not a sellable product):** computes pace, pickup, occupancy vs. target, revenue vs. budget, ADR/RevPAN, comp position → emits ranked *findings/opportunities*. Rules-based v1; forecasting later. Built from the same channel-manager data the connectors already pull.
2. **Marketing assistant (the differentiator):** translates each RMS finding into the optimal marketing move — which promotion/discount/program, on which channel, at what depth — recommends it with its "why," and **executes** what's programmatically executable (Guesty promotions API), guiding the rest.

**Target customers are manual-first** (no RMS today) → we are their first RMS. Connecting to an *external* RMS is a later optional wedge, not core.

**One-line positioning:** *"A revenue brain that doesn't just tell you the price — it runs the right deals and programs on every channel for you."*

---

## 2. Why this, why now

- **Pricing alone is a red ocean.** PriceLabs, Beyond, Wheelhouse dominate STR; Duetto, IDeaS, RoomPriceGenie dominate hotels. ✅ Even AirDNA launched an AI-native pricing tool ("Adapt", 2025) that predicts demand and picks comps in real time. Competing head-on on price optimization is a losing entry strategy.
- **The promotions/marketing layer is genuine white space.** No major RMS automates *cross-channel promotion management* end-to-end. ✅ Even leading channel managers (e.g. OwnerRez↔Airbnb) expose only a **limited** set of promotion levers via API — meaning operators do this manually, channel by channel. That manual pain **is** the opportunity.
- **The AI-agent wave in hospitality is just starting.** ✅ Apaleo shipped the first PMS MCP server (Sept 2025) with an "Agent Hub"; ✅ citizenM is an early adopter; ✅ Agentic Hospitality launched a "TravelOS" MCP server. The infrastructure for AI-driven operations is being laid right now — early movers can ride it.

**Why native promotions beat a flat price cut (the core argument — Gemini Task 2 / `06`):**
1. **Merchandising:** a native OTA promotion earns a **strikethrough "was/is" badge + a search-rank boost**; simply dropping the nightly rate does *not* — the guest sees a flat lower price with no badge and no ranking lift. Dynamic-pricing tools (PriceLabs/Beyond/Wheelhouse) only move the *number*, not the *presentation*. That gap is the product.
2. **Double-discount protection:** a flat RMS price cut *stacks on top* of an active OTA promo (20% + 20% ≈ 36% off), silently eroding margin. We track active promos and prevent it.
3. **Orphaned-promotion cleanup:** operators forget to switch promos off when demand recovers; we auto-unassign once pace hits target.

---

## 3. Target users (ICP)

| Segment | Profile | Why they buy |
|---|---|---|
| **Primary: STR property managers** | 10–200 listings, already on a channel manager (Hostaway/Guesty), multi-channel | Drowning in per-channel promo management; revenue-sensitive; tech-comfortable |
| **Secondary: independent small hotels / B&Bs** | 5–40 rooms, on a PMS/channel manager, no revenue manager on staff | Can't afford Duetto/IDeaS; need "a revenue manager in software" |
| **Tertiary: serious solo hosts** | 3–15 listings | Want pro-level optimization without a full RMS |

Start with **primary** — they have the most acute cross-channel promo pain, are reachable, and already have the channel-manager plumbing the product depends on.

---

## 4. The core insight that shapes the whole product

The "execute promotions automatically" vision is **partially constrained by what OTA/channel-manager APIs actually expose.** Some levers are API-settable; others can only be toggled manually in the OTA extranet. (Exact per-lever matrix: see `03_api_lever_matrix.md`.)

**Design consequence:** the product is a **three-tier action model**, not a magic "auto-everything" button:

1. **Auto-execute** — levers exposed by API (e.g. length-of-stay discounts, base rates, certain deals). The agent does it.
2. **Guided-execute** — levers not in the API. The agent prepares the exact change and walks the user through doing it in the extranet (deep link + step list), then verifies it took effect.
3. **Recommend-only** — programs requiring eligibility/enrollment (e.g. Genius, Preferred Partner) where the agent advises and tracks status.

This honesty is a feature: it sets correct expectations and still delivers value across all three tiers.

---

## 5. Feature scope

### MVP (v0 — prove the wedge)
- Connect one channel manager (recommended: **Guesty** — its Open API `PromotionController` is the *only* third-party API that pushes OTA promotions across Airbnb/Booking.com/Expedia/Vrbo; **Hostaway** as fast second for pricing + distribution) via API.
- **Promotion Radar:** read and display every active promotion/discount/program across the operator's connected channels in one view ("what's on, where").
- **Promotion Recommender:** rules + market-data engine suggests the optimal promo mix per listing/date-range (e.g. "add a 15% last-minute deal for the next 10 low-occupancy nights on Booking.com").
- **Three-tier execution:** auto-execute API-settable levers; guided-execute the rest with verification.
- Human-in-the-loop approval on every action (see §7 legal).

### v1
- Add dynamic **pricing** engine (now you're competitive with PriceLabs but differentiated by the promo layer).
- Second channel manager (Guesty) + direct Booking.com Connectivity once volume justifies certification.
- Performance analytics: revenue uplift attributable to promos vs price.

### v2+
- MCP-based agent orchestration exposed to operators ("talk to your revenue agent").
- Hotel-side depth (length-of-stay, segmentation), more OTAs, marketplace listing on channel-manager app stores.

---

## 6. Competitive landscape (summary)

| Player | Does pricing? | Does cross-channel **promotion automation**? |
|---|---|---|
| PriceLabs, Beyond, Wheelhouse | ✅ core | ❌ no |
| AirDNA "Adapt" (2025) | ✅ AI-native | ❌ no |
| Duetto / IDeaS / RoomPriceGenie | ✅ (hotels) | ❌ no |
| Guesty / Hostaway / Cloudbeds | partial (bundled) | ❌ limited, manual |
| **Guesty PriceOptimizer (GPO)** | ✅ (Guesty only) | ⚠️ auto LOS promos — **but Guesty-only, can't ingest external RMS** | 
| **This product** | v1 | ✅ **the wedge** |

**White space confirmed:** the promotion-automation layer is unowned by any *platform-agnostic* player. The closest thing — **Guesty PriceOptimizer** — auto-triggers length-of-stay promotions but is locked to Guesty's ecosystem and can't ingest external signals. **Our edge: platform-agnostic, cross-channel, and able to ingest an external RMS (Wheelhouse/Beyond).**

---

## 7. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Limited promotion API coverage** | 🔴 High | Three-tier action model (§4); lead with what IS automatable; quantify value of guided-execute too |
| **Channel-manager dependency** | 🔴 High | Abstract the integration behind an internal adapter layer; plan 2nd CM early; treat CM API terms as a key risk to monitor |
| **Antitrust / auto-pricing liability** | 🟠 Med | ✅ *Gibson v. Cendyn* (9th Cir., Aug 15 2025) dismissed an antitrust claim against pricing software **because** (a) recommendations were **non-binding** and (b) there was **no pooling of competitors' confidential data**. ✅ The DOJ–RealPage settlement (Nov 2025) punished the opposite (pooled nonpublic competitor data). **→ Product rules: keep recommendations advisory (user confirms), and use public/market data — never pool confidential pricing across competing clients into a shared model.** |
| **Rate parity / regulation** | 🟠 Med | EU DMA banned Booking parity clauses (Nov 2024) — net positive, but handle per-market; surface parity-aware warnings |
| **Incumbents add AI** | 🟠 Med | Move fast on the promo wedge; depth in cross-channel orchestration is hard to copy |
| **OTA ToS / scraping where no API** | 🟠 Med | Prefer official APIs; for guided-execute, the *user* acts in their own extranet (compliant); avoid automated scraping that violates ToS |

---

## 8. Connectivity strategy (decision)

**Channel-Manager-First, Guesty-led.** ✅ Direct OTA APIs are gated: Expedia is TAM-gated supply connectivity; **Booking.com is currently *pausing* new connectivity-partner applications**; Airbnb is invite-only and hosts can't get keys. Going through a channel manager turns years of per-OTA certification into one integration. Critically, ✅ **Guesty is the only channel manager whose public API (`PromotionController`) actually pushes OTA promotions** (Airbnb/Booking.com/Expedia/Vrbo) — so it leads for the marketing-agent wedge; **Hostaway** is the fast second for pricing + marketplace distribution (but exposes no OTA-promotion API). Pursue direct Booking.com/Expedia supply partnerships only post-validation. (Full reasoning + per-OTA/per-CM detail in `03_api_lever_matrix.md`.)

---

## 9. Where MCP fits (calibrated)

✅ MCP (Anthropic's open standard) is a translation/orchestration layer that replaces many point-to-point integrations, and it's already appearing in hospitality (Apaleo, Agentic Hospitality). **But** the research also refuted the hype: ❌ MCP does **not** make intermediaries unnecessary (it *wraps* existing infrastructure, keeping the CRS/PMS as source of truth), and ❌ "MCP will unlock new direct revenue" is speculative — *"we're still early, there's no dominant standard yet."*

**→ Use MCP as the internal orchestration layer for your own AI agent** (connecting it to the channel manager, market data, and the promo/pricing engines), **not** as a bet that the whole industry standardizes on it tomorrow. Optionally expose your own MCP server later so operators can "talk to" their revenue agent.

---

## 10. Go-to-market & validation (fastest realistic path)

1. **Weeks 1–2 — Concierge MVP (no code):** Recruit 3–5 real property managers. Manually analyze their promotions across every channel, deliver a recommended promo plan, and measure whether they implement it and whether revenue improves. This validates *demand* before building integrations.
2. **Month 1–2 — Thin software MVP:** One integration (**Guesty**, for its OTA `PromotionController`) + Promotion Radar + Promotion Recommender (promos only, **no** pricing yet — avoid the crowded fight). Dashboard: "what's active / what's recommended / execute." Use Guesty to demo *real* promotion auto-execution.
3. **Month 3+ — Execution + pricing:** Add three-tier execution, then the pricing engine as an upsell.

**Keep "the marketing agent" as the core and pricing as the add-on — not the reverse.**

---

## 11. Open questions to resolve next

- Exact API-lever coverage per OTA (in progress — `03_api_lever_matrix.md`).
- Hostaway vs Guesty as first integration (technical depth & app-marketplace terms).
- Pricing model for the product itself (per-listing/month vs % of uplift).
- Data strategy for the pricing engine that stays on the safe side of the *Gibson/RealPage* line.
