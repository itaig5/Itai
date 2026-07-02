import { NextResponse } from 'next/server';
import type { Channel } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import type { VisibilityResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rt = getRuntime();
  const state = rt.store.getState();

  const listings: VisibilityResponse['listings'] = [];
  for (const l of state.listings) {
    const platforms = l.channels.filter((c): c is Exclude<Channel, 'direct'> => c !== 'direct');
    const signals = await rt.visibility.getVisibility(l.id, platforms, state.simDate);
    listings.push({
      listingId: l.id,
      name: l.name,
      market: l.market,
      imageHue: l.imageHue,
      openVisibilityRec: state.recommendations.find(
        (r) => r.listingId === l.id && (r.status ?? 'proposed') === 'proposed' && r.finding.signal === 'visibility_drop',
      ) ?? null,
      platforms: platforms.map((platform) => ({
        platform,
        signals: signals.find((s) => s.platform === platform)!,
        rankSeries: state.visibilityObservations
          .filter((o) => o.listingId === l.id && o.platform === platform && o.rank != null && o.observedAt <= state.simDate)
          .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
          .slice(-30)
          .map((o) => ({ ds: o.observedAt, rank: o.rank! })),
        impressionsSeries: state.visibilityObservations
          .filter((o) => o.listingId === l.id && o.platform === platform && o.searchImpressions != null && o.observedAt <= state.simDate)
          .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
          .slice(-12)
          .map((o) => ({ ds: o.observedAt, impressions: o.searchImpressions! })),
      })),
    });
  }

  // listings with a detected drop first
  listings.sort((a, b) =>
    Number(b.platforms.some((p) => p.signals.dropDetected)) - Number(a.platforms.some((p) => p.signals.dropDetected)));
  const body: VisibilityResponse = { simDate: state.simDate, listings };
  return NextResponse.json(body);
}
