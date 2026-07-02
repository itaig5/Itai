import { NextResponse } from 'next/server';
import { disconnectClient, toClientView } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rt = getRuntime();
  try {
    disconnectClient(rt.store, id);
    const client = rt.store.getState().clients.find((c) => c.id === id)!;
    return NextResponse.json({ client: toClientView(rt.store, client) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'disconnect failed' }, { status: 400 });
  }
}
