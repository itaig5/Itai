// End-to-end demo: sample listing pacing behind + overpriced -> signals -> finding ->
// recommendation -> guardrail check -> dry-run execute. Run: `npm run demo`.
import type { CalendarNight, OtbSnapshot, Reservation } from './types.ts';
import { computeSignals } from './rms/signals.ts';
import { recommendPromotion, executePromotion } from './agent/tools.ts';
import { validateBookingCom } from './guardrail/promotionGuardrail.ts';
import type { ChannelAdapter } from './adapters/channelAdapter.ts';

// --- sample data: 10-night window, 40% occupancy, priced above market, pacing behind STLY ---
const calendar: CalendarNight[] = Array.from({ length: 10 }, (_, i) => ({
  stayDate: `2026-08-${String(i + 12).padStart(2, '0')}`,
  available: true,
  booked: i < 4, // 4/10 booked
  price: 200,
  minStay: 1,
}));

const snapshots: OtbSnapshot[] = [
  { asOf: '2026-08-01', bookedNights: 3, availableNights: 10, otbRevenue: 600, soldOut: false },
  { asOf: '2026-08-08', bookedNights: 4, availableNights: 10, otbRevenue: 800, soldOut: false },
];

const reservations: Reservation[] = [
  { id: 'r1', listingId: 'L-DEMO', checkIn: '2026-08-14', checkOut: '2026-08-16', bookedAt: '2026-08-01T00:00:00Z', nights: 2, revenue: 420, roomRevenue: 400, channel: 'booking', status: 'confirmed' },
];

const signals = computeSignals({
  listingId: 'L-DEMO',
  window: { start: '2026-08-12', end: '2026-08-21' },
  calendar,
  targetOccupancy: 0.75,
  stlyOccupancy: 0.7,   // last year we were at 70% -> 30pp behind
  snapshots,
  reservations,
  myRate: 200,
  compMedianRate: 165, // market median -> we're ~21% above
  asOf: '2026-08-08',
});

const rec = recommendPromotion(signals, { channel: 'booking' });

// Guardrail: model the proposed last-minute deal as the single active portfolio discount.
const guard = validateBookingCom(signals.adr, {
  geniusTier: 1, mobileRate: false, countryRate: false, portfolioDiscount: rec.move.depthPct,
}, { maxEffectiveDiscount: 0.35, clipFloor: 120 });

const mockAdapter: ChannelAdapter = {
  id: 'mock', capabilities: { pushRates: true, pushAvailability: true, listOtaPromotions: true, executeOtaPromotions: 'api', promotionTargets: ['booking'] },
  async getListings() { return []; },
  async getActivePromotions() { return []; },
  async assignPromotion() { return { ok: true, ref: 'mock-job-1' }; },
};

const line = (t: string) => console.log(`\n=== ${t} ===`);

async function main() {
  line('SIGNALS (computed deterministically — the LLM never recomputes these)');
  console.log(JSON.stringify(signals, null, 2));

  line('FINDING + RECOMMENDATION (pure, advisory)');
  console.log(JSON.stringify(rec, null, 2));

  line('GUARDRAIL (double-discount / clip-floor check on the proposed depth)');
  console.log(JSON.stringify(guard, null, 2));

  line('EXECUTE — dry run (no human token would be accepted as blank; approval required for live)');
  const dry = await executePromotion(mockAdapter, rec, { approvalToken: 'demo-operator', idempotencyKey: 'k1', dryRun: true });
  console.log(JSON.stringify(dry, null, 2));

  line('SUMMARY');
  console.log(`${rec.finding.signal} -> ${rec.move.type} ${Math.round(rec.move.depthPct * 100)}% on ${rec.move.channel} (${rec.move.tier}); guardrail approved=${guard.approved}`);
}

main();
