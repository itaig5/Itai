import { NextResponse } from 'next/server';
import { connectClient, toClientView } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { requireAdmin } from '@/lib/server/session';
import type { ClientMutationResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

/** (Re)test the connection and import any new listings. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const { demoListingCount, sheetsCsv } = await req.json().catch(() => ({}));
  const rt = await getRuntime();
  try {
    const connect = await connectClient(rt.store, id, { env: rt.env, demoListingCount, sheetsCsv });
    const client = rt.store.getState().clients.find((c) => c.id === id)!;
    const body: ClientMutationResponse = { client: toClientView(rt.store, client), connect };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'connect failed' }, { status: 400 });
  }
}
