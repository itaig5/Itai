# Visibility Tracking — API Availability & Smart-Handling Design

**Date:** 2026-07-02 · **Basis:** focused research (official OTA partner/dev docs via search-indexed snippets; several gated). 🟡 = confirm live.

## Headline
**Search-visibility funnel data (impressions, rank/position, CTR, conversion) is almost entirely EXTRANET-ONLY** across Booking.com, Airbnb, and Expedia/Vrbo — same pattern as promotions. There is **no unified API** for it. Channel managers (Guesty/Hostaway) don't surface it either — their analytics are about your *own bookings*, not OTA search visibility.

## Per-OTA reality
| OTA | Visibility funnel via API? | The one API exception | Visibility programs |
|---|---|---|---|
| **Booking.com** | ❌ Extranet-only (Analytics → **Visibility Dashboard**: views, CTR, **Search Results Score**) | ✅ **Market Insights API** (gated to connectivity partners; property grants "Performance data and insights"): demand + own **reservations/pace/booker benchmarking** (`sales_statistics_report_data`, `pace_report_data`, `area_demand_data`, `book_window_data`) — **NOT** the impressions/rank/CTR funnel | Visibility Booster, Genius, Preferred Partner — all extranet-only; nudges pushed via email/Pulse |
| **Airbnb** | ❌ Dashboard-only (Insights/Performance: views, conversion, 90-day). Official Partner API is invite-only and **carries no analytics**. Only financial CSV exports | none | Superhost / Guest Favorite — dashboard-only |
| **Expedia/Vrbo** | ❌ Extranet-only (Partner Central **Property Analytics** + **Visibility Performance**: Offer Strength / Guest Experience Score). EPS Rapid = distribution API (wrong side); Supply GraphQL has no reporting | ⚠️ **Rev+ Insights API** externalizes demand/pricing to *certified* PMS/CRS only — not the funnel | Accelerator, Traveler Preference, Vrbo Premier Host — extranet-only |

**Do NOT** auto-scrape the logged-in extranets: all three ToS prohibit bots; doing it with the operator's own account risks suspending the revenue listing itself.

## What's actually automatable vs manual
- **🟢 Automatable & ToS-safe:** Booking.com Market Insights API (demand/own-pace, where you qualify) · own-booking analytics from Guesty/Hostaway · **compliant public-search rank tracking** (crawl public search results as a guest — a cross-OTA *position proxy*, what Lighthouse/OTA Insight do) · OTA reviews/quality scores via CM API (reputation signals that influence rank).
- **🟡 Human-in-the-loop:** the extranet visibility dashboards (Booking Visibility Dashboard, Expedia Property Analytics, Airbnb Insights) — the operator reads/exports and the system ingests it (operator-uploaded CSV/screenshot or a periodic manual entry). Treat as an *input*, don't promise to automate it.
- **🔴 Off the table:** headless-browser scraping of the logged-in extranet (ToS/account-ban risk).

## Recommended visibility-tracking design (fits the layered architecture)
Treat **visibility as another signal into the RMS brain**, assembled from a mix of sources per platform:
1. **VisibilityProvider** (a sibling of `InsightsProvider`) with adapters: `BookingMarketInsightsProvider` (API), `PublicRankProvider` (compliant public-search position proxy), `OperatorInputProvider` (human-in-the-loop extranet metrics), `ReviewsProvider` (CM API quality scores).
2. **Visibility signals:** rank/position trend (proxy), impressions/CTR/conversion (operator-input where available), quality/review score, program status (Genius/Preferred/Accelerator — operator-confirmed).
3. **Smart handling (the "marketing part" acts on visibility):** when a **visibility drop** is detected → the marketing engine responds:
   - 🟢 **Auto-add a native promotion** to regain rank (the primary lever — badge + rank boost) within operator-set bounds.
   - 🟡 **Recommend + guide** enrolling in the visibility program (Visibility Booster / Accelerator / Genius) — no API, so guided-execute.
   - 🟡 **Flag quality/content fixes** (reviews, photos, content completeness) that drive rank.
   - **Close the loop:** measure whether rank/conversion recovers → feed the outcome to the learning engine.

## Open questions (verify live)
- Does Booking Market Insights return any funnel metrics (views/CTR/Search Results Score) or strictly demand/pace? (OAS check + Extranet.)
- Can Booking Visibility Dashboard / Expedia Property Analytics export CSV/PDF (for operator-input ingestion)?
- Airbnb partner API — accepting applicants; any non-public insights endpoint? (Appears closed/analytics-free.)
