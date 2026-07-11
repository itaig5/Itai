import { NextResponse } from 'next/server';
import { generateRecommendations, openRecommendations } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { clientIdFrom, inScope, scopedListingIds } from '@/lib/server/clientScope';
import type { RecommendationsResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = getRuntime();
  await generateRecommendations(rt); // idempotent sweep (dedups against open recs)
  const open = await openRecommendations(rt);
  const state = rt.store.getState();
  const scope = scopedListingIds(state, clientIdFrom(req));

  const items: RecommendationsResponse['items'] = open.filter(({ rec }) => inScope(scope, rec.listingId)).map(({ rec, report, signals }) => {
    const listing = state.listings.find((l) => l.id === rec.listingId)!;
    return {
      rec,
      report,
      listingName: listing.name,
      market: listing.market,
      imageHue: listing.imageHue,
      metrics: {
        occupancy: signals.occupancy,
        targetOccupancy: signals.targetOccupancy,
        paceVsStlyPct: signals.paceVsStlyPct,
        compGapPct: signals.compGapPct,
        pickup7d: signals.pickup7d,
        visibilityDrops: (signals.visibility ?? []).filter((v) => v.dropDetected).length,
      },
    };
  });

  // most urgent first: deepest pace deficit, then visibility drops
  items.sort((a, b) => a.metrics.paceVsStlyPct - b.metrics.paceVsStlyPct);
  const body: RecommendationsResponse = { simDate: state.simDate, items };
  return NextResponse.json(body);
}
