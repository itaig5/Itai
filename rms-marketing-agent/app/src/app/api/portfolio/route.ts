import { NextResponse } from 'next/server';
import { buildAllSignals, daysBetween } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { clientIdFrom, inScope, scopedListingIds } from '@/lib/server/clientScope';
import type { PortfolioResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = getRuntime();
  const state = rt.store.getState();
  const scope = scopedListingIds(state, clientIdFrom(req));
  const signalsByListing = await buildAllSignals(rt.store, rt.visibility);

  const listings: PortfolioResponse['listings'] = state.listings.filter((l) => inScope(scope, l.id)).map((l) => {
    const s = signalsByListing.get(l.id)!;
    const snaps = state.snapshots[l.id] ?? [];
    return {
      id: l.id,
      name: l.name,
      market: l.market,
      bedrooms: l.bedrooms,
      imageHue: l.imageHue,
      channels: l.channels,
      occupancy: s.occupancy,
      targetOccupancy: s.targetOccupancy,
      paceVsStlyPct: s.paceVsStlyPct,
      pickup7d: s.pickup7d,
      adr: s.adr,
      revpan: s.revpan,
      compGapPct: s.compGapPct,
      activePromos: state.promotions.filter((p) => p.listingId === l.id && p.status === 'active').length,
      openRecs: state.recommendations.filter((r) => r.listingId === l.id && (r.status ?? 'proposed') === 'proposed').length,
      visibilityDrop: (s.visibility ?? []).some((v) => v.dropDetected),
      paceSeries: snaps.slice(-30).map((sn) => ({ ds: sn.asOf, otb: sn.bookedNights })),
    };
  });

  const n = listings.length || 1;
  const totals = {
    occupancy: listings.reduce((a, l) => a + l.occupancy, 0) / n,
    paceVsStlyPct: listings.reduce((a, l) => a + l.paceVsStlyPct, 0) / n,
    revpan: listings.reduce((a, l) => a + l.revpan, 0) / n,
    adr: listings.reduce((a, l) => a + l.adr, 0) / n,
    activePromos: state.promotions.filter((p) => p.status === 'active' && inScope(scope, p.listingId)).length,
    openRecs: state.recommendations.filter((r) => (r.status ?? 'proposed') === 'proposed' && inScope(scope, r.listingId)).length,
    pendingOutcomes: state.outcomes.filter((o) => o.status === 'pending' && inScope(scope, o.listingId)).length,
  };

  // portfolio OTB occupancy over the snapshot history (average across listings per day)
  const byDay = new Map<string, { booked: number; avail: number }>();
  for (const l of state.listings.filter((x) => inScope(scope, x.id))) {
    for (const sn of (state.snapshots[l.id] ?? []).slice(-30)) {
      const cur = byDay.get(sn.asOf) ?? { booked: 0, avail: 0 };
      cur.booked += sn.bookedNights;
      cur.avail += sn.availableNights;
      byDay.set(sn.asOf, cur);
    }
  }
  const otbSeries = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ds, v]) => ({ ds, occupancy: v.avail ? v.booked / v.avail : 0 }));

  // channel mix: confirmed nights booked in the last 60 sim-days
  const mix = new Map<string, number>();
  for (const r of state.reservations) {
    if (r.status !== 'confirmed' || !inScope(scope, r.listingId)) continue;
    const age = daysBetween(r.bookedAt.slice(0, 10), state.simDate);
    if (age < 0 || age > 60) continue;
    mix.set(r.channel, (mix.get(r.channel) ?? 0) + r.nights);
  }
  const channelMix = [...mix.entries()]
    .map(([channel, nights]) => ({ channel: channel as PortfolioResponse['channelMix'][number]['channel'], nights }))
    .sort((a, b) => b.nights - a.nights);

  const body: PortfolioResponse = { simDate: state.simDate, totals, listings, otbSeries, channelMix };
  return NextResponse.json(body);
}
