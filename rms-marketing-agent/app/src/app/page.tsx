'use client';

import Link from 'next/link';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowRight, Eye, Sparkles } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { CHANNEL_COLOR, CHANNEL_LABEL, cn, fmtDate, fmtMoney, fmtPct, fmtPp } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Skeleton, StatTile } from '@/components/ui/misc';
import type { PortfolioResponse } from '@/lib/apiTypes';

export default function HomePage() {
  const { data, loading, error } = useApi<PortfolioResponse>('/api/portfolio');

  if (loading) return <HomeSkeleton />;
  if (error || !data) return <p className="text-sm text-critical">Failed to load portfolio: {error}</p>;

  const t = data.totals;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Portfolio"
        description={`${data.listings.length} listings · next 21 nights as of ${fmtDate(data.simDate)}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Occupancy (next 21 nights)"
          value={fmtPct(t.occupancy)}
          sub="on-the-books across the portfolio"
        />
        <StatTile
          label="Pace vs same time last year"
          value={fmtPp(t.paceVsStlyPct)}
          delta={{ value: t.paceVsStlyPct, text: 'vs STLY' }}
        />
        <StatTile label="RevPAN" value={fmtMoney(t.revpan)} sub={`ADR ${fmtMoney(t.adr)}`} />
        <StatTile
          label="Automation"
          value={`${t.activePromos} live promos`}
          sub={`${t.openRecs} recommendations waiting · ${t.pendingOutcomes} outcomes measuring`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>On-the-books occupancy — building over time</CardTitle>
            <CardDescription>Portfolio OTB for the forward 30-night window, from daily snapshots (the pace curve)</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.otbSeries.map((p) => ({ ...p, pct: p.occupancy * 100 }))} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="ds" tickFormatter={fmtDate} tickLine={false} minTickGap={40} />
                <YAxis unit="%" tickLine={false} axisLine={false} width={58} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => fmtDate(String(v))}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'OTB occupancy']}
                />
                <Line type="monotone" dataKey="pct" stroke="var(--seq-400)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface-card)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Booked nights by channel</CardTitle>
            <CardDescription>Confirmed bookings, last 60 days</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data.channelMix.map((m) => ({ ...m, name: CHANNEL_LABEL[m.channel] ?? m.channel }))} margin={{ top: 4, right: 36, bottom: 0, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={86} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-inset)' }}
                  contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => [`${value} nights`, 'booked']}
                />
                <Bar dataKey="nights" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fill: 'var(--ink-secondary)', fontSize: 11 }}>
                  {data.channelMix.map((m) => (
                    <Cell key={m.channel} fill={CHANNEL_COLOR[m.channel] ?? 'var(--series-8)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Listings</CardTitle>
            <CardDescription>Signals for the next 21 nights — the numbers every recommendation is grounded in</CardDescription>
          </div>
          <Link href="/recommendations" className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            Review recommendations <ArrowRight size={13} />
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-hairline text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-2 font-medium">Listing</th>
                <th className="px-3 py-2 font-medium">Occupancy</th>
                <th className="px-3 py-2 font-medium">Pace vs STLY</th>
                <th className="px-3 py-2 font-medium">RevPAN</th>
                <th className="px-3 py-2 font-medium">vs market</th>
                <th className="px-3 py-2 font-medium">Pace curve</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.listings.map((l) => (
                <tr key={l.id} className="border-b border-hairline last:border-0 hover:bg-inset/50">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        aria-hidden
                        className="h-7 w-7 shrink-0 rounded-md"
                        style={{ background: `linear-gradient(135deg, hsl(${l.imageHue} 45% 62%), hsl(${(l.imageHue + 40) % 360} 45% 42%))` }}
                      />
                      <div>
                        <div className="font-medium leading-tight">{l.name}</div>
                        <div className="text-[11px] text-ink-muted">{l.market}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {fmtPct(l.occupancy)} <span className="text-[11px] text-ink-muted">/ {fmtPct(l.targetOccupancy)} target</span>
                  </td>
                  <td className={cn('px-3 py-2.5 font-medium', l.paceVsStlyPct <= -0.05 ? 'text-critical' : l.paceVsStlyPct >= 0.1 ? 'text-[var(--delta-up-good)]' : '')}>
                    {fmtPp(l.paceVsStlyPct)}
                  </td>
                  <td className="px-3 py-2.5">{fmtMoney(l.revpan)}</td>
                  <td className="px-3 py-2.5">{l.compGapPct >= 0 ? '+' : ''}{fmtPct(l.compGapPct)}</td>
                  <td className="px-3 py-2.5">
                    <Spark data={l.paceSeries} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {l.activePromos > 0 ? <Badge variant="accent">{l.activePromos} promo{l.activePromos > 1 ? 's' : ''} live</Badge> : null}
                      {l.openRecs > 0 ? (
                        <Badge variant="warning"><Sparkles size={11} /> {l.openRecs} to review</Badge>
                      ) : null}
                      {l.visibilityDrop ? (
                        <Badge variant="critical"><Eye size={11} /> visibility drop</Badge>
                      ) : null}
                      {l.activePromos === 0 && l.openRecs === 0 && !l.visibilityDrop ? (
                        <Badge variant="outline">steady</Badge>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Spark({ data }: { data: { ds: string; otb: number }[] }) {
  if (data.length < 2) return <span className="text-[11px] text-ink-muted">—</span>;
  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="otb" stroke="var(--ink-muted)" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-12 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 lg:col-span-3" />
        <Skeleton className="h-72 lg:col-span-2" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
