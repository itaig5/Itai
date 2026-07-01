# RMS + Marketing Assistant — MVP starter

A lean, **rules-first** revenue engine that turns pace/occupancy/comp signals into cross-channel
OTA promotion moves, behind a **human-approved** execution gate. Built to the verified decisions in
`../04`, `../07`, `../08`, `../09`.

**Zero external dependencies to run** — uses Node 22's native TypeScript type-stripping + built-in test runner.

```bash
cd rms-marketing-agent/mvp
npm test      # 22 passing tests (signals math, double-discount guard, rules, token cache)
npm run demo  # end-to-end: sample listing -> signals -> recommendation -> guardrail -> dry-run
```

## What's implemented (real, tested) ✅
- **`src/rms/signals.ts`** — occupancy, pace-vs-STLY, pickup, ADR/RevPAN, comp-gap, lead-time, orphan-gaps, `computeSignals`.
- **`src/guardrail/promotionGuardrail.ts`** — the **double-discount / clip-floor guard** (Booking.com multiplicative stacking; Airbnb priority hierarchy; Vrbo 5% merchandising floor). *Build-this-first.*
- **`src/rms/rules.ts`** — pace-deficit → depth ladder, `evaluateFinding`, `recommendMove`.
- **`src/agent/tools.ts`** — the **3-tool contract**: `getSignals` (read-only, does all math) · `recommendPromotion` (pure, advisory) · `executePromotion` (gated by human token, dry-run default, idempotent).
- **`src/adapters/tokenCache.ts`** — Guesty token manager that respects the **5-tokens/24h** limit (Redis-swappable).

## What's scaffolded (documented stubs to wire) 🚧
- **`src/adapters/guestyAdapter.ts`** — Guesty `PromotionController` endpoints (GET list, PUT assign/unassign). Throws "not wired" until you add credentials + `fetch`.
- **`src/adapters/channelAdapter.ts`**, **`src/insights/*`** — interfaces + `InternalRmsProvider` (your mini-RMS) with an `RmsDataSource` port.
- **`src/db/schema.sql`** — the Postgres data model. **Populate `daily_calendar_snapshots` from day 1** — it's the pace history you can't reconstruct later.

## Architecture (matches `../04`)
```
DATA (Guesty reservations/calendar + public market data: Wheelhouse/AirROI)
  -> ① mini-RMS (signals.ts)  -> Signals
  -> ② rules engine (rules.ts) -> Finding -> PromoMove
  -> 3-tool agent contract (tools.ts): getSignals -> recommendPromotion -> [HUMAN APPROVAL] -> executePromotion
  -> ③ channel adapter (guestyAdapter.ts) -> Guesty PromotionController -> OTAs
     with the double-discount guardrail enforced before any write.
```

## Design rules baked in
- The LLM **orchestrates and explains; it never computes the numbers** (all math is in `signals.ts`/`rules.ts`).
- **Advisory-only:** `executePromotion` refuses without a human approval token and dry-runs by default.
- **Legal line (`../01`, `../09`):** public/market data only; never pool confidential competitor data; own-property data for triggers; no auto-accept. Keeps you clear of the RealPage / CA AB325 exposure.

## Next steps to a working v1
1. Wire `GuestyAdapter` to the live Open API (auth via `tokenCache`); confirm assign-vs-create semantics.
2. Implement an `RmsDataSource` that loads reservations/calendar/snapshots from Guesty + market data.
3. Add the daily snapshot cron (populate `daily_calendar_snapshots`).
4. Wrap the 3 tools in a LangGraph (Python) or Mastra (TS) HITL workflow — blueprints are in the Gemini cross-check docs (Drive folder).
5. Ship the concierge MVP first (see `../10_concierge_mvp_playbook.md`).
