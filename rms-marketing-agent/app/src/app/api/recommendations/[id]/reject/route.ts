import { NextResponse } from 'next/server';
import { rejectRecommendation } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { requireAdmin } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await rejectRecommendation(await getRuntime(), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'reject failed' }, { status: 400 });
  }
}
