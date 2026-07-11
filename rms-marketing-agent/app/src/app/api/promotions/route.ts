import { NextResponse } from 'next/server';
import type { Channel } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { clientIdFrom, inScope, scopedListingIds } from '@/lib/server/clientScope';
import { forcedClientId } from '@/lib/server/session';
import type { RadarResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = await getRuntime();
  const state = rt.store.getState();
  const scope = scopedListingIds(state, (await forcedClientId(req)) ?? clientIdFrom(req));
  const withName = (p: (typeof state.promotions)[number]) => ({
    ...p,
    listingName: state.listings.find((l) => l.id === p.listingId)?.name ?? p.listingId,
  });
  const body: RadarResponse = {
    simDate: state.simDate,
    channels: ['booking', 'airbnb', 'expedia', 'vrbo'] as Channel[],
    listings: state.listings.filter((l) => inScope(scope, l.id)).map((l) => ({ id: l.id, name: l.name, imageHue: l.imageHue })),
    active: state.promotions.filter((p) => (p.status === 'active' || p.status === 'pending_sync') && inScope(scope, p.listingId)).map(withName),
    ended: state.promotions.filter((p) => p.status === 'ended' && inScope(scope, p.listingId)).slice(-20).map(withName),
  };
  return NextResponse.json(body);
}
