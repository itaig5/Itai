import { NextResponse } from 'next/server';
import { getHitlRunner } from '@/lib/server/runtime';
import { requireAdmin } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/** Start a Mastra HITL run for one listing: signals -> recommend -> verify -> SUSPEND. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { listingId } = await req.json().catch(() => ({}));
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  try {
    const handle = await (await getHitlRunner()).start(listingId);
    return NextResponse.json(handle);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'workflow failed' }, { status: 400 });
  }
}
