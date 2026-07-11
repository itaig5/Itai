// Advance the demo world by one day: simulated guests book (native promos visibly lift demand —
// the badge + rank-boost thesis), snapshots append, due outcomes get measured, the bandit
// updates, recovered promos auto-turn-off, visibility drifts (and recovers under a promo).
// Deterministic per (seed, date). This IS the daily-snapshot + nightly-learning pipeline in
// fast-forward; the jobs in src/jobs/ call the same functions.
import type { OutcomeRecord, Reservation, Signals } from '../types.ts';
import type { Runtime } from '../engine/engine.ts';
import { mulberry32, hashSeed, clamp01 } from '../util/prng.ts';
import { addDays, daysBetween } from '../util/dates.ts';
import { buildAllSignals } from '../engine/signalService.ts';
import { autoTurnOffRecovered } from '../orchestrator/orchestrator.ts';
import { computeReward } from '../learning/rewards.ts';
import { round } from '../rms/signals.ts';

export interface DaySummary {
  date: string;
  newBookings: number;
  bookedNights: number;
  outcomesMeasured: string[];
  promosEnded: string[];
  banditUpdates: number;
}

export async function advanceDay(rt: Runtime): Promise<DaySummary> {
  const { store } = rt;
  const before = store.getState();
  const newDate = addDays(before.simDate, 1);
  const rng = mulberry32(hashSeed(before.seed, 'day', newDate));

  // 1) demand simulation — promo depth boosts booking probability (strikethrough badge + rank)
  let newBookings = 0;
  let bookedNights = 0;
  store.update((s) => {
    s.simDate = newDate;
    // real clients fed by a sheet import are NEVER simulated — their data only changes on re-sync
    const sheetOwners = new Set(s.clients.filter((c) => c.channelManager === 'sheets').map((c) => c.id));
    for (const listing of s.listings) {
      if (listing.clientId && sheetOwners.has(listing.clientId)) continue;
      const nights = s.calendar[listing.id] ?? [];
      const activePromos = s.promotions.filter(
        (p) => p.listingId === listing.id && p.status === 'active',
      );
      const promoDepth = activePromos.length ? Math.max(...activePromos.map((p) => p.depthPct)) : 0;
      const comp = s.compMedianRate[listing.id] ?? listing.baseRate;

      let i = 0;
      while (i < nights.length) {
        const n = nights[i];
        const daysOut = daysBetween(newDate, n.stayDate);
        if (n.booked || !n.available || daysOut < 0 || daysOut > 60) { i++; continue; }
        const inPromoWindow = activePromos.some(
          (p) => (!p.window || (n.stayDate >= p.window.start && n.stayDate <= p.window.end)),
        );
        const priceFactor = clamp01(1.6 - (n.price / comp)); // pricier than market -> fewer bookings
        const leadFactor = daysOut <= 14 ? 1.25 : daysOut <= 30 ? 1 : 0.7;
        const promoBoost = inPromoWindow ? 1 + promoDepth * 2.4 : 1; // 15% deal -> ~+36% demand
        const base = 0.028 * listing.targetOccupancy * 2;
        const p = clamp01(base * priceFactor * leadFactor * promoBoost);
        if (rng() < p) {
          // book a 1-4 night stay starting here
          const stay = 1 + Math.floor(rng() * Math.min(4, 61 - daysOut));
          const run = nights.slice(i, i + stay).filter((x) => !x.booked && x.available);
          if (run.length > 0) {
            for (const night of run) night.booked = true;
            const roomRevenue = run.reduce((sum, x) => sum + x.price, 0);
            const effRevenue = Math.round(roomRevenue * (1 - (inPromoWindow ? promoDepth : 0)));
            const res: Reservation = {
              id: `res_sim_${newDate}_${listing.id}_${i}`,
              listingId: listing.id,
              checkIn: run[0].stayDate,
              checkOut: addDays(run[run.length - 1].stayDate, 1),
              bookedAt: `${newDate}T${String(Math.floor(rng() * 24)).padStart(2, '0')}:00:00Z`,
              nights: run.length,
              revenue: Math.round(effRevenue * 1.12),
              roomRevenue: effRevenue,
              channel: activePromos[0]?.channel ?? listing.channels[0],
              status: 'confirmed',
            };
            s.reservations.push(res);
            newBookings++;
            bookedNights += run.length;
            i += stay;
            continue;
          }
        }
        i++;
      }

      // 2) roll the calendar: drop the night that just passed, extend the horizon
      s.calendar[listing.id] = nights.filter((x) => x.stayDate > newDate);

      // 3) daily OTB snapshot over the forward-30 window (the pace curve — capture EVERY day)
      const win = s.calendar[listing.id].filter((x) => daysBetween(newDate, x.stayDate) <= 30);
      const avail = win.filter((x) => x.available);
      const booked = avail.filter((x) => x.booked);
      const snaps = s.snapshots[listing.id] ?? [];
      snaps.push({
        asOf: newDate,
        bookedNights: booked.length,
        availableNights: avail.length,
        otbRevenue: booked.reduce((sum, x) => sum + x.price, 0),
        soldOut: avail.length > 0 && booked.length === avail.length,
      });
      s.snapshots[listing.id] = snaps.slice(-60);

      // 4) visibility drift: promos on a dropped platform claw rank back (~2-4 positions/day);
      //    otherwise a light random walk around the current level
      const platforms = listing.channels.filter((c) => c !== 'direct') as Array<Exclude<typeof listing.channels[number], 'direct'>>;
      for (const platform of platforms) {
        const rankObs = s.visibilityObservations
          .filter((o) => o.listingId === listing.id && o.platform === platform && o.rank != null)
          .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
        const last = rankObs[rankObs.length - 1];
        if (!last?.rank) continue;
        const promoHere = activePromos.some((p) => p.channel === platform);
        const drift = promoHere && last.rank > 8
          ? -(2 + Math.floor(rng() * 3))            // native promo -> rank boost (recovery)
          : Math.round((rng() - 0.5) * 2);
        const rank = Math.max(1, last.rank + drift);
        s.visibilityObservations.push({
          listingId: listing.id, platform, observedAt: newDate, source: 'public_rank', rank,
        });
      }

      // 5) expire promos whose window has passed
      for (const promo of activePromos) {
        if (promo.window && promo.window.end < newDate) {
          promo.status = 'ended';
          promo.endedAt = newDate;
          promo.endedReason = 'expired';
        }
      }
    }
  });

  store.appendAudit({
    ts: newDate, actor: 'system', kind: 'snapshot',
    detail: `Daily OTB snapshot: +${newBookings} bookings / ${bookedNights} nights across the portfolio`,
  });

  // 6) measure due outcomes + update the bandit (the nightly learning job)
  const signalsByListing = await buildAllSignals(store, rt.visibility);
  const { measured, banditUpdates } = await measureDueOutcomes(rt, signalsByListing, newDate);

  // 7) auto-turn-off recovered promos (doc 12 §1)
  const ended = await autoTurnOffRecovered(store, rt.adapter, signalsByListing);

  return {
    date: newDate,
    newBookings,
    bookedNights,
    outcomesMeasured: measured,
    promosEnded: ended.map((p) => p.id),
    banditUpdates,
  };
}

/** Close the loop on every pending outcome whose measurement horizon arrived. */
export async function measureDueOutcomes(
  rt: Runtime,
  signalsByListing: Map<string, Signals>,
  today: string,
): Promise<{ measured: string[]; banditUpdates: number }> {
  const { store } = rt;
  const state = store.getState();
  const measured: string[] = [];
  let banditUpdates = 0;

  for (const outcome of state.outcomes) {
    if (outcome.status !== 'pending') continue;
    if (daysBetween(outcome.executedAt, today) < outcome.measureAfterDays) continue;
    const signals = signalsByListing.get(outcome.listingId);
    if (!signals) continue;

    const bestRank = (signals.visibility ?? [])
      .map((v) => v.rank)
      .filter((r): r is number => r != null)
      .reduce<number | null>((min, r) => (min == null || r < min ? r : min), null);
    const result: OutcomeRecord['result'] = {
      occupancy: signals.occupancy,
      pickupPerDay: round(signals.pickup7d / 7, 3),
      revpan: signals.revpan,
      rank: bestRank,
    };
    const bookingLift = round(result.pickupPerDay - outcome.baseline.pickupPerDay, 3);
    const revenueLift = round(result.revpan - outcome.baseline.revpan, 2);
    const visibilityChange = outcome.baseline.rank != null && bestRank != null
      ? outcome.baseline.rank - bestRank // positive = climbed toward rank 1
      : null;
    const reward = computeReward({
      bookingLift, revenueLift, visibilityChange, baselineRevpan: outcome.baseline.revpan,
    });

    store.updateOutcome(outcome.id, {
      measuredAt: today, result, bookingLift, revenueLift, visibilityChange, reward, status: 'measured',
    });
    store.appendAudit({
      ts: today, actor: 'system', kind: 'outcome_measured',
      listingId: outcome.listingId, recommendationId: outcome.recommendationId,
      detail: `Measured ${outcome.actionType} ${(outcome.depthPct * 100).toFixed(0)}%: ${bookingLift >= 0 ? '+' : ''}${bookingLift} nights/day, ${revenueLift >= 0 ? '+' : ''}${revenueLift} RevPAN${visibilityChange != null ? `, rank ${visibilityChange >= 0 ? '+' : ''}${visibilityChange}` : ''} -> reward ${reward}`,
      payload: { outcomeId: outcome.id, reward },
    });

    await rt.bandit.update(outcome.context, { type: outcome.actionType, depthPct: outcome.depthPct }, reward);
    banditUpdates++;
    store.appendAudit({
      ts: today, actor: 'system', kind: 'bandit_update',
      listingId: outcome.listingId,
      detail: `Bandit updated ${outcome.actionType}@${outcome.depthPct.toFixed(2)} with reward ${reward} — policy learns from its own outcome`,
    });
    measured.push(outcome.id);
  }
  return { measured, banditUpdates };
}
