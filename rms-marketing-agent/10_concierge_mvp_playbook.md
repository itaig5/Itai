# Concierge MVP — 2-Week Validation Playbook

**Status:** v1 · **Date:** 2026-07-01
**Goal:** prove operators will **act on** cross-channel promotion recommendations and that it **lifts revenue** — *before* building integrations. No code required.

> Why concierge first: the whole thesis is "operators drown in per-channel promo management and will pay to have it done." Validate that with humans + spreadsheets in 2 weeks; only then wire the `mvp/` code to Guesty.

---

## The one question to answer
**"When we hand an operator a specific, prioritized promotion plan across their channels, do they run it — and does it measurably improve pace/revenue vs. their untouched listings?"**

If yes → build. If they nod but don't act → the wedge is weaker than it looks; re-scope.

---

## Recruit (Days 1–2)
- **3–5 operators** on **Guesty or Hostaway** (your first integration targets), 10–100 listings, multi-channel (Airbnb + Booking.com at least), **manual-first** (no RMS). Reachable via STR Facebook groups, r/AirBnBHosts, local PM networks, your dconsult network.
- Pitch: *"Free 2-week revenue concierge — I'll analyze your promotions across every channel and hand you a weekly action plan. You keep 100% of the upside; I just want feedback."*
- Get read access (or screen-share exports) to their calendar, rates, and current promotions per channel.

## Set the measurement up (Day 2)
- Pick **2 comparable listings per operator**: one **treated** (gets the plan), one **control** (untouched). Or split their portfolio 50/50.
- Baseline for each: current occupancy on-the-books for the next 30/60 days, active promos per channel, current rates, and pace vs. same-time-last-year if they have it.
- **Snapshot occupancy/rates daily** in a sheet — this is the manual version of `daily_calendar_snapshots`, and it seeds real pace data.

## Run the loop (Days 3–12, twice)
Each cycle, **by hand**, do exactly what the `mvp/` engine does:
1. **Radar:** list every active promotion/discount per channel per listing ("what's on, where").
2. **Signals:** compute occupancy vs. a target you agree with the operator, pace vs. STLY (or vs. their expectation), and comp position (eyeball public rates or an AirDNA/AirROI trial).
3. **Findings → moves:** for each soft window, pick the promo + depth from the ladder (5% behind→10%, 10–20%→15%, >20%→20%), preferring **native OTA promotions** over flat price cuts (badge + rank boost), and **check for double-discounting** (the biggest catch).
4. **Deliver a 1-page plan:** "Run a 15% last-minute deal on Booking.com for Aug 12–21; switch off the stale Airbnb weekly discount (it's stacking); enroll in Genius (guided steps attached)."
5. **They execute** in their own extranets (you observe adoption).
6. **Verify:** did pace/occupancy move on treated vs. control?

## Decide (Days 13–14)
Score against the success bar below, write a 1-page readout, and make the build/no-build call.

---

## Success metrics (agree the bar up front)
| Metric | Target to proceed |
|---|---|
| **Adoption** — % of recommendations the operator actually runs | ≥ 60% |
| **Revenue/pace lift** — treated vs. control over the window | positive & noticeable (even directional) |
| **"Would you pay?"** — commit to a paid pilot at $X/listing/mo | ≥ 2 of 5 say yes |
| **Double-discount catches** — real margin leaks you found | ≥ 1 per operator (proves the guard's value) |
| **Time saved** — operator's self-reported hours/week | any material saving |

## What you're really testing (and what each result means)
- **They act + revenue lifts** → strong signal; build the Guesty integration.
- **They act, revenue flat** → the *recommendations* need work (tune the rules/ladder), not the concept.
- **They don't act** → friction or trust problem; the auto-execution (the product's core) may be the actual value — lean harder into "we do it for you."
- **Biggest recurring pain they mention** → your v1 headline feature.

## Tools (all no-code)
- A shared **Google Sheet** per operator (Radar + daily snapshots + plan + results).
- The **manual playbook = the `mvp/` logic**: use `rules.ts`'s ladder and `promotionGuardrail.ts`'s stacking checks by hand (or run `npm run demo` to show them the concept).
- Optional: an **AirDNA/AirROI** trial for comp data.

## Guardrails even in concierge mode
- Recommendations are **advisory** — the operator clicks in their own extranet (keeps you clear of the auto-pricing/antitrust line while validating).
- Use **public/market data only**; never pool one operator's private numbers to advise another.

---

## Deliverable at the end
A 1-page readout: adoption %, treated-vs-control lift, "would pay" count, top 3 pains, and a **build / tune / pivot** recommendation. That readout decides whether to point the `mvp/` code at the live Guesty API.
