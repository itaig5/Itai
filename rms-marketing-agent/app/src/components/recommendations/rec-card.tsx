'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, Rocket, ShieldCheck, ShieldX } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, CHANNEL_COLOR, CHANNEL_LABEL, MOVE_LABEL, fmtDate, fmtMoney, fmtPct, fmtPp } from '@/lib/utils';
import { postJson, triggerRefresh } from '@/lib/useApi';
import type { PushResultDto, RecCardDto } from '@/lib/apiTypes';
import { PushResultDialog } from './push-dialog';

const SIGNAL_BADGE: Record<string, { label: string; variant: 'good' | 'warning' | 'critical' | 'accent' | 'default' }> = {
  soft_demand_overpriced: { label: 'soft demand · overpriced', variant: 'warning' },
  soft_demand: { label: 'soft demand', variant: 'warning' },
  ahead_of_pace: { label: 'ahead of pace', variant: 'good' },
  visibility_drop: { label: 'visibility drop', variant: 'critical' },
  orphan_gap: { label: 'orphan gaps', variant: 'accent' },
  new_listing: { label: 'new listing', variant: 'accent' },
  healthy: { label: 'healthy', variant: 'default' },
};

export function RecCard({ item }: { item: RecCardDto }) {
  const { rec, report, metrics } = item;
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<PushResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuided, setShowGuided] = useState(false);

  const channels = rec.targetChannels ?? [rec.move.channel];
  const isRemove = rec.move.type === 'remove_discounts';
  const badge = SIGNAL_BADGE[rec.finding.signal] ?? SIGNAL_BADGE.healthy;

  async function act(dryRun: boolean) {
    setBusy(dryRun ? 'dry' : 'push');
    setError(null);
    try {
      const res = await postJson<PushResultDto>(`/api/recommendations/${rec.recommendationId}/approve`, { dryRun });
      setResult(res);
      if (!dryRun) triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'push failed');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    try {
      await postJson(`/api/recommendations/${rec.recommendationId}/reject`);
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reject failed');
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <div
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-lg"
          style={{ background: `linear-gradient(135deg, hsl(${item.imageHue} 45% 62%), hsl(${(item.imageHue + 40) % 360} 45% 42%))` }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{item.listingName}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <div className="text-[11px] text-ink-muted">
            {item.market} · window {fmtDate(rec.window.start)} – {fmtDate(rec.window.end)} · confidence {Math.round(rec.confidence * 100)}%
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* the WHY — plain English, grounded only in computed metrics */}
        <p className="text-sm leading-relaxed text-ink-secondary">{rec.move.rationale}</p>
        <div className="flex flex-wrap gap-1.5">
          <MetricChip label="occupancy" value={`${fmtPct(metrics.occupancy)} / ${fmtPct(metrics.targetOccupancy)} target`} />
          <MetricChip label="pace" value={fmtPp(metrics.paceVsStlyPct)} bad={metrics.paceVsStlyPct <= -0.05} />
          <MetricChip label="vs market" value={`${metrics.compGapPct >= 0 ? '+' : ''}${fmtPct(metrics.compGapPct)}`} />
          <MetricChip label="pickup 7d" value={`${metrics.pickup7d} nights`} />
          {metrics.visibilityDrops > 0 ? <MetricChip label="visibility" value={`${metrics.visibilityDrops} platform(s) dropped`} bad /> : null}
        </div>

        {/* the proposed action */}
        <div className="rounded-lg bg-inset p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {MOVE_LABEL[rec.move.type] ?? rec.move.type}
              {rec.move.depthPct > 0 ? ` — ${fmtPct(rec.move.depthPct)} off` : ''}
            </span>
            <span className="text-xs text-ink-muted">on</span>
            {channels.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-2 py-0.5 text-[11px]">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
                {CHANNEL_LABEL[c] ?? c}
              </span>
            ))}
          </div>
          {rec.banditChoice ? (
            <p className="mt-1.5 text-[11px] text-ink-muted">
              policy: {rec.banditChoice.arm.type}@{Math.round(rec.banditChoice.arm.depthPct * 100)}% ·{' '}
              {rec.banditChoice.explore ? 'exploring a new arm' : 'best-known arm'} · {rec.banditChoice.model}
            </p>
          ) : null}
        </div>

        {/* per-channel guard preview — the double-discount guard made visible */}
        {report.guards.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Stacked-discount guard (checked again before every write)
            </div>
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-hairline text-left text-[10px] uppercase text-ink-muted">
                    <th className="px-3 py-1.5 font-medium">Channel</th>
                    <th className="px-3 py-1.5 font-medium">Compounded discount</th>
                    <th className="px-3 py-1.5 font-medium">Public price</th>
                    <th className="px-3 py-1.5 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {report.guards.map((g) => (
                    <tr key={g.channel} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[g.channel] }} />
                          {CHANNEL_LABEL[g.channel] ?? g.channel}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{fmtPct(g.effectiveDiscount, 1)}</td>
                      <td className="px-3 py-1.5">{fmtMoney(g.finalPrice)}</td>
                      <td className="px-3 py-1.5">
                        {g.approved
                          ? <Badge variant="good"><ShieldCheck size={11} /> within cap</Badge>
                          : <Badge variant="critical"><ShieldX size={11} /> {g.reason}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* verifier strip */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-muted">verifier:</span>
          {report.checks.map((c) => (
            <span
              key={c.name}
              title={c.detail}
              className={cn(
                'cursor-help rounded-full px-2 py-0.5 text-[10px] font-medium',
                c.pass ? 'bg-good/10 text-good' : 'bg-critical/10 text-critical',
              )}
            >
              {c.pass ? '✓' : '✗'} {c.name}
            </span>
          ))}
        </div>
        {!report.pass ? (
          <p className="rounded-lg bg-critical/10 px-3 py-2 text-xs text-critical">
            Verifier blocked this recommendation — it cannot be executed. Hover the failing checks for the reason.
          </p>
        ) : null}

        {/* guided actions — the no-API tier */}
        {(rec.guidedActions ?? []).length > 0 ? (
          <div className="rounded-lg border border-hairline">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-ink-secondary hover:bg-inset"
              onClick={() => setShowGuided((s) => !s)}
            >
              Also do — no API for these ({rec.guidedActions!.length})
              <ChevronDown size={14} className={cn('transition-transform', showGuided && 'rotate-180')} />
            </button>
            {showGuided ? (
              <div className="flex flex-col gap-3 border-t border-hairline p-3">
                {rec.guidedActions!.map((a, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={a.kind === 'program_enrollment' ? 'accent' : 'warning'}>
                        {a.kind === 'program_enrollment' ? 'program enrollment' : 'content fix'}
                      </Badge>
                      <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                        {a.title} <ExternalLink size={11} />
                      </a>
                    </div>
                    <ol className="mt-1.5 list-decimal pl-6 text-ink-secondary">
                      {a.steps.map((s, j) => <li key={j}>{s}</li>)}
                    </ol>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-xs text-critical">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <Button onClick={() => act(false)} disabled={!report.pass || busy !== null}>
            <Rocket size={14} />
            {busy === 'push'
              ? 'Pushing…'
              : isRemove
                ? `Approve & remove on ${channels.length} channel${channels.length > 1 ? 's' : ''}`
                : `Approve & push to ${channels.length} channel${channels.length > 1 ? 's' : ''}`}
          </Button>
          <Button variant="secondary" onClick={() => act(true)} disabled={busy !== null}>
            {busy === 'dry' ? 'Previewing…' : 'Dry-run preview'}
          </Button>
          <Button variant="ghost" onClick={reject} disabled={busy !== null}>
            Reject
          </Button>
          <span className="ml-auto text-[10px] text-ink-muted">{rec.risk}</span>
        </div>
      </CardContent>

      <PushResultDialog result={result} onClose={() => { setResult(null); triggerRefresh(); }} />
    </Card>
  );
}

function MetricChip({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px]">
      <span className="text-ink-muted">{label}</span>
      <span className={cn('font-medium', bad ? 'text-critical' : 'text-ink')}>{value}</span>
    </span>
  );
}
