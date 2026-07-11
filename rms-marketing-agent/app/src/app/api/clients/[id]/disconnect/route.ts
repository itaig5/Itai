import { NextResponse } from 'next/server';
import { disconnectClient, toClientView } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { requireAdmin } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const rt = await getRuntime();
  try {
    disconnectClient(rt.store, id);
    const client = rt.store.getState().clients.find((c) => c.id === id)!;
    return NextResponse.json({ client: toClientView(rt.store, client) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'disconnect failed' }, { status: 400 });
  }
}
