import { NextResponse } from 'next/server';
import { getRuntime } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rt = getRuntime();
  const state = rt.store.getState();
  const promo = state.promotions.find((p) => p.id === id);
  if (!promo) return NextResponse.json({ error: 'unknown promotion' }, { status: 404 });
  if (promo.status !== 'active') return NextResponse.json({ error: `promotion is ${promo.status}` }, { status: 400 });

  if (rt.adapter.unassignPromotion) await rt.adapter.unassignPromotion(promo.listingId, promo.id);
  rt.store.endPromotion(promo.id, state.simDate, 'operator');
  rt.store.appendAudit({
    ts: state.simDate, actor: 'operator', kind: 'promo_ended',
    listingId: promo.listingId, channel: promo.channel,
    detail: `Operator manually ended ${promo.type} ${(promo.depthPct * 100).toFixed(0)}% on ${promo.channel}`,
  });
  return NextResponse.json({ ok: true });
}
