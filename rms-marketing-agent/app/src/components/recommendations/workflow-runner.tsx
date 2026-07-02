'use client';

import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CHANNEL_LABEL, MOVE_LABEL, fmtPct } from '@/lib/utils';
import { postJson, triggerRefresh } from '@/lib/useApi';
import type { HitlHandle } from '@/lib/apiTypes';

/** Demonstrates the Mastra HITL workflow end-to-end: the run SUSPENDS at the approval
 *  gate; the operator's decision resumes it into guarded multi-channel execution. */
export function WorkflowRunner({ listings }: { listings: { id: string; name: string }[] }) {
  const [listingId, setListingId] = useState(listings[0]?.id ?? '');
  const [handle, setHandle] = useState<HitlHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setHandle(await postJson<HitlHandle>('/api/workflow/run', { listingId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'workflow failed');
    } finally {
      setBusy(false);
    }
  }

  async function decide(approved: boolean, dryRun?: boolean) {
    if (!handle) return;
    setBusy(true);
    try {
      const next = await postJson<HitlHandle>('/api/workflow/resume', {
        runId: handle.runId, approved, dryRun, approvalToken: 'workflow-ui',
      });
      setHandle(next);
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'resume failed');
    } finally {
      setBusy(false);
    }
  }

  const pending = handle?.status === 'suspended' ? handle.pending : undefined;
  const result = handle?.status === 'success' ? handle.result : undefined;

  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Listing for workflow run" value={listingId} onChange={(e) => setListingId(e.target.value)} className="h-8 text-xs">
        {listings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <Button variant="secondary" size="sm" onClick={start} disabled={busy || !listingId}>
        <GitBranch size={13} />
        {busy && !handle ? 'Running…' : 'Run HITL workflow'}
      </Button>
      {error ? <span className="text-xs text-critical">{error}</span> : null}

      <Dialog
        open={handle !== null}
        onClose={() => setHandle(null)}
        title={pending ? 'Workflow suspended — your approval gate' : 'Workflow result'}
        description={pending
          ? 'signals -> recommend -> verify all passed; Mastra suspended the run at the human gate.'
          : undefined}
      >
        {pending ? (
          <div className="flex flex-col gap-3 text-sm">
            <p className="leading-relaxed text-ink-secondary">{pending.rec.move.rationale}</p>
            <div className="rounded-lg bg-inset p-3 text-sm">
              <span className="font-semibold">
                {MOVE_LABEL[pending.rec.move.type] ?? pending.rec.move.type}
                {pending.rec.move.depthPct > 0 ? ` — ${fmtPct(pending.rec.move.depthPct)} off` : ''}
              </span>
              <span className="ml-2 text-xs text-ink-muted">
                → {(pending.rec.targetChannels ?? []).map((c) => CHANNEL_LABEL[c] ?? c).join(', ')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pending.report.checks.map((c) => (
                <Badge key={c.name} variant={c.pass ? 'good' : 'critical'}>{c.name}</Badge>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => decide(true)} disabled={busy}>Approve & push everywhere</Button>
              <Button size="sm" variant="secondary" onClick={() => decide(true, true)} disabled={busy}>Dry-run</Button>
              <Button size="sm" variant="ghost" onClick={() => decide(false)} disabled={busy}>Reject</Button>
            </div>
          </div>
        ) : result ? (
          <div className="flex flex-col gap-2 text-sm">
            <Badge
              variant={result.status === 'executed' ? 'good' : result.status === 'blocked' ? 'critical' : result.status === 'rejected' ? 'default' : 'accent'}
              className="w-fit"
            >
              {result.status}
            </Badge>
            <p className="text-ink-secondary">{result.detail}</p>
            {result.push ? (
              <p className="text-xs text-ink-muted">
                executed: {result.push.executedChannels.join(', ') || '—'}
                {result.push.blockedChannels.length ? ` · blocked: ${result.push.blockedChannels.join(', ')}` : ''}
                {result.push.outcomeId ? ` · outcome ${result.push.outcomeId} opened` : ''}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Run state: {handle?.status}</p>
        )}
      </Dialog>
    </div>
  );
}
