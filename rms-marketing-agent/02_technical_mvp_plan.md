# Technical MVP Plan — RMS + Marketing Agent

**Status:** v1 · **Date:** 2026-06-30
**Reads with:** `01_PRD_strategy.md` (strategy) and `03_api_lever_matrix.md` (verified API facts).

> Everything here is grounded in the verified API-lever research. Where a fact drove a design choice, it's cited inline. Confidence: ✅ verified this run · 🟡 verify before coding.

---

## 1. The one architectural fact that drives everything

✅ **Rates and availability are auto-executable through every channel-manager API. OTA *promotions* are only auto-executable through (a) Guesty's `PromotionController`, or (b) direct OTA supply connectivity (Booking.com — paused; Expedia — TAM-gated).** Most channel managers do not expose promotion management at all.

→ The architecture must therefore:
1. Treat **Guesty as the primary integration** (only third-party API that pushes OTA promotions).
2. Model every action as one of three tiers — **auto-execute / guided-execute / recommend** — and degrade gracefully per channel.
3. Keep the OTA/CM integration behind an **adapter interface** so adding Hostaway, Cloudbeds, or direct Booking.com later doesn't touch the core.

---

## 2. System architecture (MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEB APP (operator UI)                     │
│   Promotion Radar · Recommendations · Approve/Execute · Results    │
└───────────────┬───────────────────────────────────────────────────┘
                │ REST/GraphQL
┌───────────────▼───────────────────────────────────────────────────┐
│                       APPLICATION / API LAYER                      │
│  Auth · Accounts · Approval workflow · Audit log · Job queue       │
└───────┬───────────────────────┬───────────────────────┬───────────┘
        │                       │                       │
┌───────▼────────┐   ┌──────────▼──────────┐   ┌────────▼───────────┐
│  AI AGENT CORE │   │  PRICING ENGINE     │   │ PROMOTIONS ENGINE  │
│  (MCP host)    │   │  (rates: rules +    │   │ (detect→recommend→ │
│  orchestrates  │   │   market data)      │   │  execute per tier) │
└───────┬────────┘   └──────────┬──────────┘   └────────┬───────────┘
        │  MCP / internal tool calls                     │
┌───────▼────────────────────────────────────────────────▼───────────┐
│              INTEGRATION ADAPTER LAYER (the moat)                    │
│  ChannelAdapter interface → GuestyAdapter (1st), HostawayAdapter,    │
│  CloudbedsAdapter, …  + later DirectBookingAdapter / DirectExpedia    │
└───────┬─────────────────────────────────────────────────────────────┘
        │
┌───────▼───────────┐   ┌────────────────────┐   ┌────────────────────┐
│ Guesty Open API   │   │ Market-data sources │   │ Operator's OTA      │
│ (OAuth2)          │   │ (comp/event/demand) │   │ extranet (guided)   │
└───────────────────┘   └────────────────────┘   └────────────────────┘
```

---

## 3. The adapter interface (most important code decision)

Define one interface; every channel manager / direct OTA implements it. This is what lets you start on Guesty and expand without rewrites.

```ts
// Capability flags let the engine know what's auto vs guided per channel
interface ChannelAdapter {
  id: string                          // "guesty" | "hostaway" | ...
  capabilities: {
    pushRates: boolean                // ✅ all CMs
    pushAvailability: boolean         // ✅ all CMs
    listOtaPromotions: boolean        // ✅ Guesty; ❌ most others
    executeOtaPromotions: 'api' | 'guided' | 'none'
    promotionTargets: Array<'airbnb'|'booking'|'expedia'|'vrbo'|'direct'>
  }

  // Reads
  getListings(): Promise<Listing[]>
  getCalendar(listingId, range): Promise<CalendarDay[]>
  getActivePromotions(listingId): Promise<Promotion[]>   // Radar source

  // Writes (auto-execute)
  pushRates(listingId, rates): Promise<JobResult>
  assignPromotion?(listingId, promotionRef): Promise<JobResult> // Guesty
  createPromotion?(listingId, spec): Promise<JobResult>         // 🟡 if supported

  // Guided-execute fallback
  buildGuidedStep(action): GuidedInstruction   // deep link + checklist + verify
}
```

**MVP ships `GuestyAdapter` fully + a generic `GuidedExecuteAdapter`.** `HostawayAdapter` (pricing/calendar only) is the fast follow.

---

## 4. The three engines

### 4a. Promotions Engine (the differentiator — build first)
- **Detect:** `getActivePromotions()` across the operator's listings → normalized "what's running where" state (Promotion Radar).
- **Recommend:** rules + market signals → optimal promo mix per listing/date-range. Start rules-based and explainable (e.g. *"occupancy <40% for nights 12–22 AND a comp set median 18% below your rate → recommend a 15% Last-Minute deal on Booking.com + Guesty assign"*). Add ML later.
- **Execute (tiered):**
  - 🟢 **API** via `GuestyAdapter.assignPromotion()` (Airbnb/Booking.com/Expedia/Vrbo) 🟡 confirm create/update method.
  - 🟡 **Guided** for Genius / Visibility Booster / Accelerator (no API) → deep-link the extranet + checklist + re-read to verify.
- **Measure:** Booking.com `getpromotions` returns ✅ revenue/nights/bookings/cancellations → attribution.

### 4b. Pricing Engine (v1 — the add-on, not the lead)
- Rules + market data → nightly price; push via `pushRates()` (✅ Guesty calendar PUT, Hostaway, Cloudbeds `putRate`, OwnerRez SpotRates).
- **Legal guardrail (✅ critical):** keep recommendations **advisory (operator confirms)** and use **public/market data only — never pool confidential pricing across competing clients.** This is the line between the *Gibson v. Cendyn* dismissal (non-binding recs, no data pooling = safe) and the *RealPage* settlement (pooled competitor data = liability). Encode it as a hard rule, not a preference.

### 4c. AI Agent Core (the orchestration layer — where MCP fits)
- The agent reasons over Radar + market data and proposes actions; humans approve; adapters execute.
- ✅ **MCP is the right internal abstraction** — wrap each adapter and data source as MCP tools the agent calls. This matches where hospitality is going (Apaleo, Agentic Hospitality both shipped MCP servers) **without** betting the business on industry-wide MCP adoption (✅ refuted as premature: "we're still early, no dominant standard").
- Concretely: an internal **MCP host** exposes tools like `radar.getActivePromotions`, `market.getCompSet`, `promo.recommend`, `promo.execute`, `pricing.push`. Swappable model backend (Claude) behind the host.

---

## 5. Auth, limits, and gotchas (✅ verified, per channel)

| Channel | Auth | Rate limits | Watch out |
|---|---|---|---|
| **Guesty** | OAuth2 client-credentials; token 24h; **max 5 tokens/key/24h** | **15 req/s, 120/min, 5000/hr**; `X-RateLimit-*` + 429/`Retry-After` | Customer needs paid plan; Rate-Plans & Vrbo promos are **gated pilots**; confirm promo create/update method & scopes 🟡 |
| **Hostaway** | OAuth2 client-credentials; token up to 24 months | Per-IP/account; exact number undocumented 🟡 | No OTA-promo API; Booking.com discounts unsupported; coupons are direct-booking only |
| **Cloudbeds** | API key **or** OAuth2 | 5 req/s (property) / 10 req/s (partner); `putRate` 2500/15min | No promo API; availability is room-type level |
| **OwnerRez** | PAT (Basic) or OAuth2 auth-code | 300 req/5min per IP | Messaging webhooks need partnership; SpotRates needs `currency` (since Mar 2025) |
| **Lodgify** | API key (`X-ApiKey`) | ~100 req/min (inconsistent) 🟡 | Rate **write is v1 only**; no promo API; Pro+ tier gated |

**Token-bucket + backoff in the adapter layer** is mandatory — bulk repricing will hit these limits.

---

## 6. Build sequence (fastest realistic MVP)

**Phase 0 — Concierge validation (weeks 1–2, no code).** 3–5 real Guesty/Hostaway operators; manually run Radar + recommendations; measure adoption + revenue lift. Kills or confirms demand before engineering.

**Phase 1 — Promotion Radar (weeks 3–6).** `GuestyAdapter` read path + normalized promotion model + dashboard "what's running where." Pure read = low risk, immediate "aha."

**Phase 2 — Recommender + execute (weeks 7–12).** Rules-based recommendations + approval workflow + audit log; `assignPromotion()` auto-execute on Guesty + guided-execute fallback. Booking.com `getpromotions` attribution. **This is the demoable wedge.**

**Phase 3 — Pricing engine + Hostaway (months 4–5).** Add `pushRates()` and the advisory pricing engine (with the legal guardrail); add `HostawayAdapter` for reach + marketplace distribution.

**Phase 4 — Scale (months 6+).** MCP host hardening; pursue direct Booking.com (when reopened) / Expedia supply connectivity; more adapters; ML pricing.

---

## 7. Stack recommendation

- **Backend:** TypeScript (Node) or Python — both have clean Guesty/MCP SDK paths. TS preferred for one language across app + adapters + MCP tools.
- **AI/agent:** Claude (latest) behind an internal MCP host; tools = adapters + market data.
- **Data:** Postgres (accounts, listings, promotions, audit) + a job queue (BullMQ/Temporal) for rate-limited, retryable channel writes.
- **Frontend:** Next.js dashboard. The audit log + approval workflow are first-class (legal + trust).
- **Market data:** start with AirDNA/Key Data or scraped public comp data (public only — legal line) for the Recommender.

---

## 8. Top risks to retire early (verify before heavy build)

1. 🟡 **Guesty promotion create/update method + scopes + pilot eligibility** — the whole wedge depends on it. Get a Guesty dev account and confirm in week 1 of Phase 1.
2. 🟡 **Whether Guesty `assignPromotion` covers the promo types you care about** across all four OTAs, or only "Portfolio" (Basic/Last-Minute/Early-Bird).
3. ✅ **Legal model** — advisory + public-data-only is settled as the safe design; bake it in from day one.
4. 🟡 **Guesty paid-plan requirement** — confirm your target customers are already on Guesty (or willing), since the API needs it.
