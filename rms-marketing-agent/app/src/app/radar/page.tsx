'use client';

import { useState } from 'react';
import { useApi, postJson, triggerRefresh } from '@/lib/useApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { cn, CHANNEL_COLOR, CHANNEL_LABEL, MOVE_LABEL, fmtDate, fmtPct } from '@/lib/utils';
import type { RadarResponse, RadarRowDto } from '@/lib/apiTypes';

const TYPE_ABBREV: Record<string, string> = {
  last_minute: 'LM', basic_deal: 'BD', early_booker: 'EB', weekly_los: 'LOS', new_listing: 'NEW',
};

const SOURCE_STYLE: Record<RadarRowDto['source'], string> = {
  revpilot: 'border-accent bg-accent-soft text-ink',
  operator: 'border-warning bg-warning/15 text-ink',
  ota: 'border-hairline bg-inset text-ink-secondary',
};

const ENDED_REASON: Record<string, { label: string; variant: 'good' | 'outline' | 'default' | 'critical' }> = {
  pace_recovered: { label: 'auto-off · pace recovered', variant: 'good' },
  expired: { label: 'expired', variant: 'outline' },
  operator: { label: 'ended by operator', variant: 'default' },
  guardrail: { label: 'guardrail', variant: 'critical' },
};

export default function RadarPage() {
  const { data, loading, error } = useApi<RadarResponse>('/api/promotions');
  const [selected, setSelected] = useState<RadarRowDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (error || !data) return <p className="text-sm text-critical">Failed to load promotions: {error}</p>;

  const cell = new Map<string, RadarRowDto[]>();
  for (const p of data.active) {
    const key = `${p.listingId}|${p.channel}`;
    cell.set(key, [...(cell.get(key) ?? []), p]);
  }

  async function endPromotion(id: string) {
    setBusy(true);
    setEndError(null);
    try {
      await postJson(`/api/promotions/${id}/end`);
      setSelected(null);
      triggerRefresh();
    } catch (err) {
      setEndError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Promotion Radar"
        description={`${data.active.length} live promotion${data.active.length === 1 ? '' : 's'} across ${data.channels.length} channels — what's on, where, in one grid.`}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-accent bg-accent-soft" /> set by RevPilot</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-warning bg-warning/15" /> set by you in the extranet</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-hairline bg-inset" /> OTA program</span>
            <span className="ml-auto">Extranet-created promos are the double-discount hazard — the guard simulates them before every push.</span>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-hairline text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-2 font-medium">Listing</th>
                {data.channels.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
                      {CHANNEL_LABEL[c] ?? c}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.listings.map((l) => (
                <tr key={l.id} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        aria-hidden
                        className="h-7 w-7 shrink-0 rounded-md"
                        style={{ background: `linear-gradient(135deg, hsl(${l.imageHue} 45% 62%), hsl(${(l.imageHue + 40) % 360} 45% 42%))` }}
                      />
                      <span className="font-medium">{l.name}</span>
                    </div>
                  </td>
                  {data.channels.map((c) => {
                    const promos = cell.get(`${l.id}|${c}`) ?? [];
                    return (
                      <td key={c} className="px-3 py-2.5">
                        {promos.length === 0 ? (
                          <span aria-hidden className="text-ink-muted">·</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {promos.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => { setSelected(p); setEndError(null); }}
                                className={cn(
                                  'cursor-pointer rounded-md border px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80',
                                  SOURCE_STYLE[p.source],
                                )}
                                title={`${MOVE_LABEL[p.type] ?? p.type} · ${p.source}`}
                              >
                                {TYPE_ABBREV[p.type] ?? p.type} {Math.round(p.depthPct * 100)}%
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently ended</CardTitle>
          <CardDescription>Including automatic turn-offs — RevPilot unassigns a promo once pace recovers to target.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.ended.length === 0 ? (
            <div className="p-5"><EmptyState title="No ended promotions yet" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-hairline text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-2 font-medium">Listing</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Promotion</th>
                  <th className="px-3 py-2 font-medium">Ended</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {[...data.ended].reverse().map((p) => {
                  const reason = ENDED_REASON[p.endedReason ?? ''] ?? { label: p.endedReason ?? '—', variant: 'outline' as const };
                  return (
                    <tr key={p.id} className="border-b border-hairline last:border-0">
                      <td className="px-5 py-2">{p.listingName}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[p.channel] }} />
                          {CHANNEL_LABEL[p.channel] ?? p.channel}
                        </span>
                      </td>
                      <td className="px-3 py-2">{MOVE_LABEL[p.type] ?? p.type} · {fmtPct(p.depthPct)}</td>
                      <td className="px-3 py-2 text-ink-muted">{p.endedAt ? fmtDate(p.endedAt) : '—'}</td>
                      <td className="px-3 py-2"><Badge variant={reason.variant}>{reason.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${MOVE_LABEL[selected.type] ?? selected.type} — ${fmtPct(selected.depthPct)} off` : ''}
        description={selected ? `${selected.listingName} · ${CHANNEL_LABEL[selected.channel] ?? selected.channel}` : undefined}
        footer={selected ? (
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            <Button variant="destructive" onClick={() => endPromotion(selected.id)} disabled={busy}>
              {busy ? 'Ending…' : 'End promotion now'}
            </Button>
          </>
        ) : undefined}
      >
        {selected ? (
          <div className="flex flex-col gap-2 text-sm">
            <Row k="Stay window" v={`${fmtDate(selected.window.start)} – ${fmtDate(selected.window.end)}`} />
            <Row k="Source" v={selected.source === 'revpilot' ? 'RevPilot (approved push)' : selected.source === 'operator' ? 'Created by you in the extranet' : 'OTA program'} />
            <Row k="Created" v={fmtDate(selected.createdAt)} />
            <Row k="Status" v={selected.status} />
            {selected.recommendationId ? <Row k="From recommendation" v={selected.recommendationId} /> : null}
            {endError ? <p className="text-xs text-critical">{endError}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline pb-1.5 text-sm last:border-0">
      <span className="text-ink-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
