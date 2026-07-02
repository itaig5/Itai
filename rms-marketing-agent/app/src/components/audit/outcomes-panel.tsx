'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatTile, EmptyState } from '@/components/ui/misc';
import { cn, CHANNEL_COLOR, MOVE_LABEL, fmtDate, fmtPct } from '@/lib/utils';
import type { LearningResponse } from '@/lib/apiTypes';

export function OutcomesPanel({ data }: { data: LearningResponse }) {
  const [showAllArms, setShowAllArms] = useState(false);
  const arms = data.bandit.local
    .filter((r) => showAllArms || r.pulls > 0)
    .sort((a, b) => b.pulls - a.pulls || b.mean - a.mean);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Outcomes measured" value={String(data.measuredCount)} sub="labeled data — the moat" />
        <StatTile
          label="Average reward"
          value={data.avgReward != null ? data.avgReward.toFixed(2) : '—'}
          sub="0–1 · what the bandit learns from"
        />
        <StatTile label="Policy" value={data.bandit.model} sub="Thompson sampling over promo type × depth" />
        <StatTile
          label="ML service"
          value={data.mlService.up ? 'connected' : 'fallback'}
          sub={data.mlService.up
            ? `${data.mlService.url}${data.mlService.backends ? ` · statsforecast ${data.mlService.backends.statsforecast ? '✓' : '–'} · TimeGPT ${data.mlService.backends.timegpt ? '✓' : 'key needed'}` : ''}`
            : 'in-process TS bandit running — start ml-service to hand over'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outcome log</CardTitle>
          <CardDescription>
            Every executed action becomes a labeled row: baseline → result → reward. This is the training data.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {data.outcomes.length === 0 ? (
            <div className="p-5"><EmptyState title="No outcomes yet" detail="Approve a recommendation, then advance the demo clock past the measurement window." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-hairline text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-2 font-medium">Listing</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Channels</th>
                  <th className="px-3 py-2 font-medium">Executed</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Booking lift</th>
                  <th className="px-3 py-2 font-medium">RevPAN lift</th>
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 font-medium">Reward</th>
                </tr>
              </thead>
              <tbody>
                {data.outcomes.map((o) => (
                  <tr key={o.id} className="border-b border-hairline last:border-0" title={`baseline: occ ${fmtPct(o.baseline.occupancy)}, ${o.baseline.pickupPerDay} n/day, RevPAN ${o.baseline.revpan}${o.result ? ` -> result: occ ${fmtPct(o.result.occupancy)}, ${o.result.pickupPerDay} n/day, RevPAN ${o.result.revpan}` : ''}`}>
                    <td className="px-5 py-2">{o.listingName}</td>
                    <td className="px-3 py-2">{MOVE_LABEL[o.actionType] ?? o.actionType} · {fmtPct(o.depthPct)}</td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        {o.channels.map((c) => (
                          <span key={c} aria-label={c} title={c} className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{fmtDate(o.executedAt)}</td>
                    <td className="px-3 py-2">
                      {o.status === 'measured'
                        ? <Badge variant="good">measured {o.measuredAt ? fmtDate(o.measuredAt) : ''}</Badge>
                        : <Badge variant="outline">measuring (day {Math.max(0, Math.round((Date.parse(data.simDate) - Date.parse(o.executedAt)) / 86400000))} of {o.measureAfterDays})</Badge>}
                    </td>
                    <SignedCell v={o.bookingLift} unit=" n/day" />
                    <SignedCell v={o.revenueLift} unit="" money />
                    <td className="px-3 py-2">{o.visibilityChange != null && o.visibilityChange !== 0 ? `${o.visibilityChange > 0 ? '+' : ''}${o.visibilityChange} rank` : '—'}</td>
                    <td className="px-3 py-2">
                      {o.reward != null ? (
                        <span
                          className="rounded-md px-1.5 py-0.5 font-semibold"
                          style={{ backgroundColor: `color-mix(in srgb, var(--seq-400) ${Math.round(o.reward * 35)}%, transparent)` }}
                        >
                          {o.reward.toFixed(2)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the policy has learned</CardTitle>
          <CardDescription>
            Beta posteriors per context bucket × promo arm. Updates land after each measured outcome —
            advance the demo clock and watch the means move.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-hairline text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-2 font-medium">Context bucket</th>
                <th className="px-3 py-2 font-medium">Arm</th>
                <th className="px-3 py-2 font-medium">Pulls</th>
                <th className="px-3 py-2 font-medium">Expected reward</th>
              </tr>
            </thead>
            <tbody>
              {arms.map((r) => (
                <tr key={`${r.bucket}|${r.armId}`} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-2 font-mono text-xs" title="pace-deficit band | visibility drop | comp-gap band">{r.bucket}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.armId}</td>
                  <td className="px-3 py-2">{r.pulls}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-36 overflow-hidden rounded-full" style={{ background: 'var(--seq-100)' }}>
                        <div className={cn('h-full rounded-full')} style={{ width: `${Math.round(r.mean * 100)}%`, background: 'var(--seq-400)' }} />
                      </div>
                      <span className="text-xs font-medium">{r.mean.toFixed(3)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {arms.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-4 text-center text-xs text-ink-muted">No pulls yet — approve and measure an action first.</td></tr>
              ) : null}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-[11px] text-ink-muted">
              Unpulled arms start at Beta(1,1) — the policy explores them opportunistically (no cold-start).
              {data.bandit.remote ? ' ML-service posteriors in sync.' : ''}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setShowAllArms((s) => !s)}>
              {showAllArms ? 'Show pulled arms only' : 'Show all arms'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SignedCell({ v, unit, money }: { v: number | null; unit: string; money?: boolean }) {
  if (v == null) return <td className="px-3 py-2 text-ink-muted">—</td>;
  return (
    <td className={cn('px-3 py-2 font-medium', v > 0 ? 'text-[var(--delta-up-good)]' : v < 0 ? 'text-critical' : '')}>
      {v > 0 ? '+' : ''}{money ? `€${v.toFixed(0)}` : v.toFixed(2)}{unit}
    </td>
  );
}
