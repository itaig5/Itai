import { NextResponse } from 'next/server';
import { getHitlRunner } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/** Resume a suspended HITL run with the operator's decision (approve / dry-run / reject). */
export async function POST(req: Request) {
  const { runId, approved, dryRun, approvalToken } = await req.json().catch(() => ({}));
  if (!runId || typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'runId and approved required' }, { status: 400 });
  }
  try {
    const handle = await getHitlRunner().resume(runId, { approved, dryRun, approvalToken });
    return NextResponse.json(handle);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'resume failed' }, { status: 400 });
  }
}
