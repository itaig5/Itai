# API-Lever Matrix — What Can Actually Be Auto-Executed per Channel

**Status:** v1 · **Date:** 2026-06-30
**Purpose:** The make-or-break question for the "marketing agent" — for each OTA promotion/visibility lever, can it be set **programmatically** (auto-execute), only **read** via API, or only changed **manually in the extranet** (guided-execute)?

> **Confidence legend:**
> ✅ **Verified** = corroborated by this research run (official docs via search-indexed snippets; multiple independent sources).
> 🟡 **Domain knowledge** = analyst knowledge, not re-verified in this run — confirm before relying on it.
> ⚠️ **Methodology caveat:** All `*.booking.com`, Airbnb, and several vendor doc domains were blocked at the network proxy during research, so Booking/Airbnb quotes come from search-engine snippets of the official pages, **not** byte-verified page reads. Re-verify exact wording in a browser before contractual reliance.

---

## The three-tier action model (recap)

1. **🟢 Auto-execute** — lever is settable via API → the agent does it.
2. **🟡 Guided-execute** — lever exists only in the extranet → the agent prepares the exact change + deep-links the user, then verifies.
3. **🔵 Recommend/track** — eligibility/enrollment program → the agent advises and monitors status.

---

## 1. Airbnb

**Access model (✅ Verified):** No public/self-serve API. **Partner-only and invite-based** — Airbnb's partner managers reach out; you cannot simply apply. Tiers: **Preferred** and **Preferred+** software partners, annually re-certified (NDA → API Terms → data-security review → implement mandatory features within 6 months). **Individual hosts cannot get API keys** — they connect via an approved PMS/channel manager. → For a startup, Airbnb access is realistically **only through a channel manager** that already holds partner status.

| Lever | Auto-execute via API? | Tier | Notes |
|---|---|---|---|
| Nightly/base price | 🟢 Yes (via partner/CM API) | Auto | Core pricing field exposed to Preferred partners |
| Length-of-stay: weekly / monthly discount | 🟢 Yes 🟡 | Auto | Standard discount fields in the partner API |
| Early-bird / last-minute discount | 🟢 Yes 🟡 | Auto | Settable as length-of-stay/booking-window discounts |
| Custom / limited-time promotions | 🟡 Partial 🟡 | Guided | Some promo types are extranet-driven; API coverage is partial |
| New-listing promotion | 🔵 Mostly manual 🟡 | Recommend | Typically host-accepted in dashboard |
| Smart Pricing (Airbnb's own dynamic pricing) | 🔵 Toggle is host-side 🟡 | Recommend | You'd *replace* it with your own pricing, not toggle it via API |
| Min nights / availability / calendar | 🟢 Yes | Auto | Fully exposed via partner/CM API |
| "Boost"/featured visibility placement | 🔴 No public API 🟡 | Guided | No documented programmatic placement lever |

> ⚠️ The Airbnb **promotion-lever** rows are marked 🟡 — the consolidated promotion-lever sub-report didn't land in this run; the access-model rows are ✅ verified. The known industry constraint (✅ from the prior deep-research run: even leading channel managers expose only a *limited* set of Airbnb discount levers via API) stands.

---

## 2. Booking.com

**Access model (✅ Verified):** Connectivity API onboarding is **gated and currently *pausing new connectivity-provider applications***; requires PCI DSS + PII/GDPR compliance, KYP form, cloud/central-server architecture, real-time reservation handling, an (unpublished) minimum property count, and mandatory **certification** before go-live. Tiered Connectivity Partner Programme (Certified → Advanced → Premier → Premier Plus), points-based. → **Direct Booking.com integration is effectively closed to a new startup right now** — go through a certified channel manager.

| Lever | Auto-execute via API? | Mechanism | Tier |
|---|---|---|---|
| Base rates | 🟢 ✅ Yes | `OTA_HotelRateAmountNotif` (Connectivity, XML/OTA 2003B) | Auto |
| Availability / inventory | 🟢 ✅ Yes | `OTA_HotelAvailNotif` | Auto |
| Restrictions (min/max LoS, CTA, CTD) | 🟢 ✅ Yes | `OTA_HotelAvailNotif` | Auto |
| **Promotions — Basic / Last-Minute / Early Booker** | 🟢 ✅ Yes | **Promotions API** `POST /hotels/xml/promotions` | Auto |
| **Promotions — Mobile Rate / Geo (Country) Rate** | 🟢 ✅ Yes | Promotions API | Auto |
| **Campaign deals (Getaway, Late Escape, seasonal, Black Friday)** | 🟢 ✅ Yes | Promotions API (campaign/deep-deal types; 9 types total) | Auto |
| Promotion performance stats | 🟢 ✅ Yes (read) | `getpromotions` returns revenue, nights, bookings, cancellations | Auto |
| Targeted (secret) deals | 🟢 ✅ Yes | `target_channel` = PUBLIC/SECRET | Auto |
| **Genius enrollment + L1/2/3 discounts** | 🔵 ✅ **No API** | Extranet "Opportunities"/"Boost performance" only; API shows Genius *read-only* in reservations | Recommend |
| **Preferred Partner / Preferred Plus** | 🔵 ✅ **No API** | Extranet opt-in; eligibility-gated (top 30% / top 10%) | Recommend |
| **Visibility Booster** (pay-for-placement) | 🟡 ✅ **No API** | Extranet "Boost performance" slider | Guided |
| Booking Network Sponsored Ads (CPC) | 🔵 ✅ No API | Separate commercial ad product | Recommend |

**Booking.com is the strongest case for the product:** most *deals* are fully auto-executable via the Promotions API, while the *programs* (Genius/Preferred/Visibility Booster) are guided/recommend. A clean, demonstrable split.

---

## 3. Expedia Group / Vrbo

**Two different APIs — don't confuse them (✅ Verified):**
- **EPS Rapid = demand/affiliate side.** You *read* and merchandise deals and *book* Expedia inventory; you **cannot** push rates or create promotions. Partner-only, case-by-case approval, separate Certified Technology Partner program. Auth = API key + SHA-512 signature.
- **EG Connectivity Hub = supply side.** This is where rates and promotions are *set* — via the Availability & Rates API (ARI) and a **GraphQL Promotions API**. Separate program for hotels/CMs/PMSs/VR managers.

| Lever | Auto-execute via API? | Mechanism | Notes |
|---|---|---|---|
| Base rates / inventory / ARI | 🟢 ✅ Yes | Availability & Rates API (XML/EQC): per-day, occupancy, LOS, restrictions | Supply side |
| **Promotions: Single / Day-of-Week / Multi-night** | 🟢 ✅ Yes | **GraphQL Promotions API** — `createSingleDiscountPromotion`, `createDayOfWeekDiscountPromotion`, `createMultiNightDiscountPromotion` (+ `update*`) | Supply side |
| **Promotions: Early-Booking / Same-Day / Member-Only / Mobile-Only** | 🟢 ✅ Yes | Promotion types on the GraphQL Promotions API | Can't stack (except Member-Only); not for large chains |
| Rate-plan *creation* (Product API) | 🟡 Gated | Product API mostly GET-only for new partners; needs a Technical Account Manager | Use ARI to push rates instead |
| **Accelerator** (pay-for-visibility comp bid) | 🔵 ✅ **No public API** | Partner Central → Marketing → Accelerator (dashboard only) | Visibility program |
| TravelAds (sponsored, PPC) | 🔵 Ad platform | Separate advertising product | — |
| **Vrbo: Early-Booking / Last-Minute** | 🟢 ✅ Yes | Vrbo Promotions Suite via Owner Dashboard **and** connectivity API | Channel managers confirm push |
| Vrbo: Mobile / Member-Only (OneKey) | 🟡 Partial | Dashboard yes; "not yet configured for all API partners" | API parity incomplete |
| Vrbo: Weekly/Monthly extended-stay discounts | 🟡 Partial | Dashboard + channel-manager LOS push | — |

**Takeaway:** Expedia's **supply-side GraphQL Promotions API is genuinely auto-executable** for the core deal types — better promotion-API coverage than Booking.com's channel-manager path. The catch is the same gating: you need supply-side connectivity access (TAM-mediated). Accelerator (the visibility booster) stays UI-only.

---

## 4. Channel Managers / PMS — the integration layer (✅ now fully verified)

The strategy rests on integrating *through* these. The research produced a **critical, partly counter-intuitive result:** channel managers expose **rates and availability** through their public APIs — but **almost none of them re-expose OTA *promotion management* through their own public API.** Promotions are handled either in the channel manager's **own UI** (not API) or punted back to the **OTA extranet**.

| Platform | Rates push (API) | Availability (API) | **OTA promotions via *their public API*** | Listing read | 3rd-party access | Verdict |
|---|---|---|---|---|---|---|
| **Hostaway** | 🟢 ✅ Yes | 🟢 ✅ Yes | 🔴 ✅ **No** — "Promotions must be managed through the Booking.com Extranet"; API "coupons" are direct-booking only | 🟢 ✅ Yes | Public API + marketplace; ✅ Preferred+ Airbnb partner | 🥇 Best STR rates/availability integration |
| **Guesty** | 🟢 ✅ Yes (calendar PUT) | 🟢 ✅ Yes | 🟢 ✅ **Best — public API `PromotionController`** (`getlist`, `assignlistings`) **targets Airbnb, Booking.com, Expedia, Vrbo-pilot**; create/update method name unconfirmed; Genius still extranet | 🟢 ✅ Yes | Open API (OAuth2); paid plan; some pilots gated; ✅ Preferred+ Airbnb | 🥇 **Only CM exposing OTA promotions via public API** |
| **Cloudbeds** | 🟢 ✅ Yes (`putRate`/`patchRate`) | 🟢 ✅ Yes (room-type level) | 🔴 ✅ **No** — promo codes UI-only, excluded from channel sync | 🟢 ✅ Yes | ✅ **Self-service API keys** per property; partner approval for multi-account | 🥇 Best hotel integration (self-serve) |
| **Beds24** | 🟢 ✅ Yes | 🟢 ✅ Yes | 🟠 ✅ **UI only** — Beds24 panel manages Booking.com Basic/Early-Booker/Last-Minute; **not in public API V2** | 🟢 ✅ Yes | Public API V2; developer-friendly | Promo UI exists, not API |
| **OwnerRez** | 🟢 ✅ Yes (`SpotRates` PATCH) | 🟢 ✅ Yes (blocks) | 🔴 ✅ **No** — pushes Airbnb/Vrbo standard discounts from its UI; no public promo API | 🟢 ✅ Yes | ✅ Self-serve PAT/OAuth; 300 req/5min | Good STR rates integration |
| **Lodgify** | 🟢 ✅ Yes (v1 only) | 🟢 ✅ Yes | 🔴 ✅ **No** promotions/coupon API at all | 🟢 ✅ Yes | Self-serve `X-ApiKey`; tier-gated | Rates only |
| **STAAH / eviivo / HotelRunner** | 🟢 ✅ Yes | 🟢 ✅ Yes | 🟠 ✅ **UI only** — these manage Booking.com deals (incl. mobile/geo) in their dashboards, but expose it to *you* only via UI, not a public promo API | 🟢 ✅ Yes | Connectivity partners | Promo-capable UIs, not 3rd-party-API |

**The promotion-execution reality (✅ the key finding, nuanced):**
- **The OTAs themselves have real Promotions APIs:** Booking.com (`supply-xml.booking.com/hotels/xml/promotions`, 9 deal types) and Expedia (GraphQL `createSingleDiscountPromotion` etc.). Both require **certified supply-side connectivity access** — Booking.com is currently **pausing new connectivity-partner applications**; Expedia is TAM-gated.
- **Most channel-manager public APIs do NOT re-expose promotion management** — Hostaway/Channex/Cloudbeds/Lodgify/OwnerRez punt to the extranet; Beds24/STAAH/eviivo/HotelRunner manage promos only in their **own UI**.
- **The exception that makes this buildable: Guesty.** Its Open API exposes a **`PromotionController`** that lists promotions and **assigns listings to promotions across Airbnb, Booking.com, Expedia, and Vrbo (pilot)** — the one third-party-callable OTA-promotion surface found. (Caveat: the *create/update* method name and scopes are unconfirmed; some pieces are gated pilots — verify against the live spec.)
- **Net:** auto-executing OTA promotions as a third party is **viable through Guesty today, and through direct OTA supply partnerships later** — but **not** through most channel managers. Rates/availability are auto-executable everywhere.

---

## Key takeaways for product design (✅ final, evidence-based)

1. **Auto-execute splits into two realities:**
   - **🟢 Pricing/availability = auto-executable everywhere** via channel-manager APIs (Hostaway, Guesty, Cloudbeds, OwnerRez, Lodgify, Beds24 all ✅). Solid ground.
   - **🟡 Promotion execution = auto-executable through Guesty's API and direct OTA supply APIs; manual/guided everywhere else.**
2. **This flips the first integration to Guesty.** If the differentiator is the *marketing agent*, **Guesty's `PromotionController` is the only public API that lets you push OTA promotions** — build there first. Add **Hostaway second** (easiest onboarding, best marketplace distribution, but pricing/calendar only — no OTA promo API).
3. **The MVP still leads with Radar + Recommender + guided-execute**, but on Guesty you can prove **real auto-execute of promotions** for a flagship demo — a strong wedge. Where the API can't reach (Genius, Visibility Booster, Accelerator), fall back to guided-execute.
4. **Three routes to broaden promotion auto-execution** (post-validation): (a) **become a Booking.com Connectivity Partner** when applications reopen; (b) **Expedia supply-side connectivity** for the GraphQL Promotions API (TAM-mediated); (c) **assisted browser automation** of the extranet *as the user* for the long tail (ToS-sensitive, brittle — bridge only).
5. **Verify before committing code:** Guesty promotion *create/update* method name + OAuth scopes + pilot eligibility; whether Guesty single-listing calendar PUT accepts CTA/CTD; Hostaway's exact rate limit; Expedia GraphQL mutation spellings + any private Accelerator API; current Vrbo promotion-API parity (moving fast since the Sept-2025 Expedia unification).
