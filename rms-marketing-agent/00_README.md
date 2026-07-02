# RMS + "Marketing Agent" — Research & Plan

Deliverables for a hybrid Revenue Management System (short-term rentals **and** small hotels) differentiated by an automated **cross-channel promotion / "marketing agent"** layer on top of dynamic pricing.

## Documents
1. **`01_PRD_strategy.md`** — product strategy & PRD: vision, market, ICP, competitive white space, risks, GTM.
2. **`02_technical_mvp_plan.md`** — architecture, the channel adapter interface, the three engines, build sequence, stack.
3. **`03_api_lever_matrix.md`** — the make-or-break answer: what's auto-executable vs guided vs manual, per OTA and per channel manager.
4. **`04_rms_engine_and_architecture.md`** — ⭐ the reframe: RMS brain → marketing assistant layered architecture, the mini-RMS signal/data model, and the locked build decisions. Read this first for the current thinking.
5. **`05_GEMINI_BRIEF.md`** — Gemini persona, learning curriculum, Deep Research task prompts, and the Claude↔Gemini handoff protocol.
6. **`06`–`09`** — research log, best-of catalog (algorithms/prompts/skills/agents), engineering playbook, and the Claude↔Gemini cross-check reconciliation.
7. **`10_concierge_mvp_playbook.md`** — the 2-week no-code validation plan (run this before building).
8. **`mvp/`** — ⭐ the **starter code** (TypeScript, 22 passing tests): mini-RMS signals, the double-discount guard, the rules engine, the 3-tool agent contract, Guesty adapter skeleton, and DB schema. `cd mvp && npm test && npm run demo`.

> **Current framing (v2):** the marketing assistant is the **action layer on top of an RMS brain** — promotion moves are outcomes of RMS findings (pace, occupancy vs. target, etc.). We build a lean **mini-RMS as the engine** (customers are manual-first, so we're their first RMS), rules-first with ML groundwork captured from day one. See `04`.

## The three conclusions that matter

1. **Pricing alone is a red ocean; the *promotion/marketing automation* layer is genuine white space.** No major RMS automates cross-channel OTA promotions.

2. **The connectivity reality (verified):**
   - Direct OTA access is closed/gated to a startup — Airbnb invite-only; **Booking.com *pausing* new connectivity partners**; Expedia TAM-gated.
   - Rates & availability are auto-executable through every channel-manager API.
   - **OTA *promotions* are auto-executable as a third party only through Guesty's `PromotionController`** (Airbnb/Booking.com/Expedia/Vrbo) — the single most important finding. Everywhere else they're guided/manual.
   - → **Build on Guesty first; Hostaway second.**

3. **Legal design rule (verified, 2025 case law):** keep pricing/promo recommendations **advisory** and use **public/market data only — never pool confidential competitor pricing.** That is the line between the *Gibson v. Cendyn* dismissal and the *RealPage* settlement.

## Method & reliability
- Built from a deep-research workflow (adversarial 3-voter verification: 21/25 claims confirmed) plus targeted per-OTA / per-channel-manager research agents.
- ⚠️ Many official OTA/vendor doc domains were blocked at the network proxy during research, so quotes come from search-indexed snippets of official pages, not byte-verified page reads. Items marked 🟡 should be confirmed in a browser / dev account before committing engineering.

## Key sources (representative)
- Booking.com Connectivity & Promotions API: developers.booking.com/connectivity/docs, /b_xml-promotions, /con-faq-promotions; connectivity.booking.com (CPP, minimum requirements)
- Expedia: developers.expediagroup.com/supply (Promotions GraphQL, Avail & Rates), partner.expediagroup.com/join-us/rapid-api
- Airbnb partner program: airbnb.com/help/article/3418, news.airbnb.com (Preferred / Preferred+ partners)
- Channel managers: open-api-docs.guesty.com (PromotionController, rate limits), api.hostaway.com/documentation, developers.cloudbeds.com, ownerrez.com/support, docs.lodgify.com
- MCP in hospitality: Apaleo MCP server (hospitalitynet.org/news/4129031), Agentic Hospitality TravelOS
- Legal: Gibson v. Cendyn (9th Cir., Aug 15 2025); DOJ–RealPage settlement (Nov 2025) — arnoldporter.com, wsgr.com
