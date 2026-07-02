import { NextResponse } from 'next/server';
import { rejectRecommendation } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await rejectRecommendation(getRuntime(), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'reject failed' }, { status: 400 });
  }
}
