import { NextResponse } from 'next/server';
import { addClient, connectClient, toClientView } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { forcedClientId, requireAdmin } from '@/lib/server/session';
import type { AddClientRequest, ClientMutationResponse, ClientsResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = await getRuntime();
  const state = rt.store.getState();
  const forced = await forcedClientId(req);
  const clients = state.clients
    .filter((c) => !forced || c.id === forced)
    .map((c) => toClientView(rt.store, c));
  const body: ClientsResponse = {
    simDate: state.simDate,
    clients,
    totals: {
      connected: clients.filter((c) => c.status === 'connected').length,
      listings: clients.reduce((a, c) => a + c.listingCount, 0),
    },
  };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const rt = await getRuntime();
  const input = (await req.json().catch(() => null)) as AddClientRequest | null;
  if (!input) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  try {
    const client = addClient(rt.store, input);
    let connect;
    if (input.connectNow !== false) {
      connect = await connectClient(rt.store, client.id, {
        env: rt.env,
        demoListingCount: input.demoListingCount,
      });
    }
    const fresh = rt.store.getState().clients.find((c) => c.id === client.id)!;
    const body: ClientMutationResponse = { client: toClientView(rt.store, fresh), connect };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed to add client' }, { status: 400 });
  }
}
