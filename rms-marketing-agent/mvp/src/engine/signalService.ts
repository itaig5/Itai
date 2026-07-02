// Builds SignalInputs from the store for any listing/window — the one place that maps the
// demo-world state (or, in prod, the Guesty-synced tables) into the tested signal math.
import type { Signals } from '../types.ts';
import type { Store } from '../store/store.ts';
import type { VisibilityProviderPort } from '../visibility/provider.ts';
import { computeSignals, orphanGaps } from '../rms/signals.ts';
import { addDays } from '../util/dates.ts';

/** Recommendations look at the next 3 weeks — the window promos act on. */
export const REC_WINDOW_DAYS = 21;

export function defaultWindow(simDate: string): { start: string; end: string } {
  return { start: addDays(simDate, 1), end: addDays(simDate, REC_WINDOW_DAYS) };
}

export async function buildSignals(
  store: Store,
  visibility: VisibilityProviderPort,
  listingId: string,
  window?: { start: string; end: string },
): Promise<Signals> {
  const state = store.getState();
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) throw new Error(`unknown listing ${listingId}`);
  const win = window ?? defaultWindow(state.simDate);

  const calendar = (state.calendar[listingId] ?? []).filter(
    (n) => n.stayDate >= win.start && n.stayDate <= win.end,
  );
  const windowNights = calendar.filter((n) => n.available);
  const prices = windowNights.map((n) => n.price).sort((a, b) => a - b);
  const myRate = prices.length ? prices[Math.floor(prices.length / 2)] : listing.baseRate;

  const signals = computeSignals({
    listingId,
    window: win,
    calendar,
    targetOccupancy: listing.targetOccupancy,
    stlyOccupancy: state.stlyOccupancy[listingId] ?? 0,
    snapshots: state.snapshots[listingId] ?? [],
    reservations: state.reservations.filter((r) => r.listingId === listingId),
    myRate,
    compMedianRate: state.compMedianRate[listingId] ?? 0,
    asOf: state.simDate,
  });

  const platforms = listing.channels.filter((c): c is Exclude<typeof c, 'direct'> => c !== 'direct');
  signals.visibility = await visibility.getVisibility(listingId, platforms, state.simDate);
  signals.orphanGapCount = orphanGaps(calendar).length;
  return signals;
}

export async function buildAllSignals(
  store: Store,
  visibility: VisibilityProviderPort,
): Promise<Map<string, Signals>> {
  const out = new Map<string, Signals>();
  for (const listing of store.getState().listings) {
    out.set(listing.id, await buildSignals(store, visibility, listing.id));
  }
  return out;
}
