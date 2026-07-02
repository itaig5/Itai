'use client';

import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CHANNEL_COLOR, CHANNEL_LABEL, fmtMoney, fmtPct } from '@/lib/utils';
import type { PushResultDto } from '@/lib/apiTypes';

export function PushResultDialog({
  result, onClose,
}: {
  result: PushResultDto | null;
  onClose: () => void;
}) {
  if (!result) return null;
  const executed = result.results.filter((r) => r.status === 'executed' || r.status === 'dry_run').length;
  const blocked = result.results.filter((r) => r.status === 'blocked').length;
  return (
    <Dialog
      open
      onClose={onClose}
      title={result.dryRun ? 'Dry-run preview — nothing was written' : 'Pushed to all channels'}
      description={`${executed} channel${executed === 1 ? '' : 's'} ${result.dryRun ? 'would execute' : 'executed'}${blocked ? `, ${blocked} blocked by the guardrail` : ''}`}
    >
      <div className="flex flex-col gap-2">
        {result.results.map((r) => (
          <div key={r.channel} className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: CHANNEL_COLOR[r.channel] }} />
            <span className="w-28 text-sm font-medium">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
            {r.status === 'blocked' ? (
              <Badge variant="critical">blocked</Badge>
            ) : r.status === 'guided' ? (
              <Badge variant="warning">guided step</Badge>
            ) : (
              <Badge variant={result.dryRun ? 'accent' : 'good'}>{result.dryRun ? 'would push' : 'live'}</Badge>
            )}
            <span className="ml-auto text-right text-xs text-ink-secondary">
              {r.status === 'blocked' ? (
                <span className="text-critical">{r.reason}</span>
              ) : (
                <>
                  compounded {fmtPct(r.effectiveDiscount, 1)} · public price {fmtMoney(r.finalPrice)}
                  {r.ref ? <span className="text-ink-muted"> · {r.ref}</span> : null}
                </>
              )}
            </span>
          </div>
        ))}
        {!result.dryRun && result.outcomeId ? (
          <p className="mt-1 rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">
            Outcome measurement opened ({result.outcomeId}). Advance the demo clock — after the measurement
            window the booking lift is logged and the learning policy updates itself.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
