import { NextResponse } from 'next/server';
import { connectClient, toClientView } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import type { ClientMutationResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

/** (Re)test the connection and import any new listings. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { demoListingCount } = await req.json().catch(() => ({}));
  const rt = getRuntime();
  try {
    const connect = await connectClient(rt.store, id, { env: rt.env, demoListingCount });
    const client = rt.store.getState().clients.find((c) => c.id === id)!;
    const body: ClientMutationResponse = { client: toClientView(rt.store, client), connect };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'connect failed' }, { status: 400 });
  }
}
