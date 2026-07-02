import { NextResponse } from 'next/server';
import type { Channel } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import type { RadarResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rt = getRuntime();
  const state = rt.store.getState();
  const withName = (p: (typeof state.promotions)[number]) => ({
    ...p,
    listingName: state.listings.find((l) => l.id === p.listingId)?.name ?? p.listingId,
  });
  const body: RadarResponse = {
    simDate: state.simDate,
    channels: ['booking', 'airbnb', 'expedia', 'vrbo'] as Channel[],
    listings: state.listings.map((l) => ({ id: l.id, name: l.name, imageHue: l.imageHue })),
    active: state.promotions.filter((p) => p.status === 'active' || p.status === 'pending_sync').map(withName),
    ended: state.promotions.filter((p) => p.status === 'ended').slice(-20).map(withName),
  };
  return NextResponse.json(body);
}
