import { NextResponse } from 'next/server';
import { getRuntime } from '@/lib/server/runtime';
import type { AuditResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = getRuntime();
  const state = rt.store.getState();
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 200);
  const names = new Map(state.listings.map((l) => [l.id, l.name]));
  const body: AuditResponse = {
    simDate: state.simDate,
    events: state.audit
      .slice(-limit)
      .reverse()
      .map((e) => ({ ...e, listingName: e.listingId ? names.get(e.listingId) : undefined })),
  };
  return NextResponse.json(body);
}
