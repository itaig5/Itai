import { NextResponse } from 'next/server';
import { approveAndPush } from '@revpilot/core';
import { requireAdmin } from '@/lib/server/session';
import { getRuntime } from '@/lib/server/runtime';
import type { PushResultDto } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const { dryRun = false } = await req.json().catch(() => ({}));
  const rt = await getRuntime();
  try {
    const summary = await approveAndPush(rt, id, { dryRun, approvalToken: 'operator-ui' });
    const body: PushResultDto = {
      recommendationId: summary.recommendationId,
      dryRun: summary.dryRun,
      executedChannels: summary.executedChannels,
      blockedChannels: summary.blockedChannels,
      outcomeId: summary.outcomeId,
      results: summary.results.map((r) => ({
        channel: r.channel,
        approved: r.guard.approved,
        effectiveDiscount: r.guard.effectiveDiscount,
        finalPrice: r.guard.finalPrice,
        reason: r.guard.reason,
        status: r.execution.status,
        ref: r.promotionRef,
      })),
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'approve failed' }, { status: 400 });
  }
}
