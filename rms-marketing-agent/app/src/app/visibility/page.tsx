'use client';

import Link from 'next/link';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, ExternalLink, TrendingDown } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { OperatorInput } from '@/components/visibility/operator-input';
import { cn, CHANNEL_COLOR, CHANNEL_LABEL, fmtDate, fmtPct } from '@/lib/utils';
import type { VisibilityListingDto, VisibilityPlatformDto, VisibilityResponse } from '@/lib/apiTypes';

export default function VisibilityPage() {
  const { data, loading, error } = useApi<VisibilityResponse>('/api/visibility');

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
      </div>
    );
  }
  if (error || !data) return <p className="text-sm text-critical">Failed to load visibility: {error}</p>;

  const listings = data.listings.map((l) => ({ id: l.listingId, name: l.name }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Visibility"
        description="Search-rank proxy from PUBLIC results + your extranet numbers. The OTA funnel has no API — RevPilot never scrapes logged-in extranets (doc 11)."
      />
      {data.listings.map((l) => <ListingVisibility key={l.listingId} listing={l} />)}
      <OperatorInput listings={listings} />
    </div>
  );
}

function ListingVisibility({ listing }: { listing: VisibilityListingDto }) {
  const dropped = listing.platforms.some((p) => p.signals.dropDetected);
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <div
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-lg"
          style={{ background: `linear-gradient(135deg, hsl(${listing.imageHue} 45% 62%), hsl(${(listing.imageHue + 40) % 360} 45% 42%))` }}
        />
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {listing.name}
            {dropped ? <Badge variant="critical"><TrendingDown size={11} /> visibility drop</Badge> : null}
          </div>
          <div className="text-[11px] text-ink-muted">{listing.market}</div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {listing.platforms.map((p) => (
          <PlatformRow key={p.platform} p={p} rec={listing.openVisibilityRec} />
        ))}
      </CardContent>
    </Card>
  );
}

function PlatformRow({ p, rec }: { p: VisibilityPlatformDto; rec: VisibilityListingDto['openVisibilityRec'] }) {
  const s = p.signals;
  return (
    <div className={cn('rounded-lg border p-3', s.dropDetected ? 'border-critical/40' : 'border-hairline')}>
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: CHANNEL_COLOR[p.platform] }} />
            {CHANNEL_LABEL[p.platform] ?? p.platform}
            {s.programs.map((pr) => (
              <Badge key={pr.program} variant={pr.enrolled ? 'accent' : 'outline'}>
                {pr.program}{pr.enrolled ? ' ✓' : ' — not enrolled'}
              </Badge>
            ))}
          </div>
          {p.rankSeries.length >= 2 ? (
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.rankSeries} margin={{ top: 6, right: 10, bottom: 0, left: -26 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="ds" tickFormatter={fmtDate} tickLine={false} minTickGap={50} />
                  {/* rank 1 = the top of the search page = the top of the chart */}
                  <YAxis reversed domain={[1, 'dataMax + 2']} tickLine={false} axisLine={false} width={58} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(v) => fmtDate(String(v))}
                    formatter={(value) => [`#${value}`, 'search position (public proxy)']}
                  />
                  <Line type="monotone" dataKey="rank" stroke={CHANNEL_COLOR[p.platform]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface-card)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">No rank history yet — the public-search proxy fills this in over time.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 text-xs">
          <Stat k="Search rank" v={s.rank != null ? `#${s.rank}` : 'no data'} />
          <Stat
            k="Rank trend (14d)"
            v={s.rankTrend14d != null ? `${s.rankTrend14d > 0 ? `dropped ${s.rankTrend14d} places` : s.rankTrend14d < 0 ? `up ${-s.rankTrend14d} places` : 'flat'}` : 'no data'}
            tone={s.rankTrend14d != null ? (s.rankTrend14d > 0 ? 'bad' : s.rankTrend14d < 0 ? 'good' : undefined) : undefined}
          />
          <Stat k="Impressions (7d)" v={s.impressions7d != null ? `${s.impressions7d.toLocaleString()}${s.impressionsTrendPct != null ? ` (${s.impressionsTrendPct > 0 ? '+' : ''}${fmtPct(s.impressionsTrendPct)})` : ''}` : 'no data — enter below'} tone={s.impressionsTrendPct != null && s.impressionsTrendPct <= -0.25 ? 'bad' : undefined} />
          <Stat k="CTR" v={s.ctr != null ? fmtPct(s.ctr, 1) : 'no data — enter below'} />
          <Stat k="Conversion" v={s.conversion != null ? fmtPct(s.conversion, 1) : 'no data — enter below'} />
          <Stat k="Review score" v={s.reviewScore != null ? `${s.reviewScore.toFixed(1)}/10` : 'no data'} tone={s.reviewScore != null && s.reviewScore < 8 ? 'bad' : undefined} />
          <div className="mt-auto text-[10px] text-ink-muted">sources: {s.sources.join(', ') || '—'}</div>
        </div>
      </div>

      {s.dropDetected ? (
        <div className="mt-3 rounded-lg bg-critical/10 p-3 text-xs">
          <div className="font-semibold text-critical">Dropped — {s.dropReason}</div>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            <div className="rounded-md bg-card p-2.5">
              <div className="font-medium">① Native promotion (the rank lever)</div>
              {rec ? (
                <p className="mt-1 text-ink-secondary">
                  {Math.round(rec.move.depthPct * 100)}% {rec.move.type.replace(/_/g, '-')} queued to regain the badge + rank boost.{' '}
                  <Link href="/recommendations" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                    Review &amp; push <ArrowRight size={11} />
                  </Link>
                </p>
              ) : (
                <p className="mt-1 text-ink-secondary">Promotion pushed — measuring rank recovery daily.</p>
              )}
            </div>
            {(rec?.guidedActions ?? []).filter((a) => a.platform === p.platform).slice(0, 2).map((a, i) => (
              <div key={i} className="rounded-md bg-card p-2.5">
                <div className="font-medium">{i === 0 ? '② ' : '③ '}{a.kind === 'program_enrollment' ? 'Program enrollment (guided)' : 'Content / quality fix'}</div>
                <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent hover:underline">
                  {a.title} <ExternalLink size={10} />
                </a>
                <ol className="mt-1 list-decimal pl-4 text-ink-secondary">
                  {a.steps.slice(0, 3).map((step, j) => <li key={j}>{step}</li>)}
                </ol>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1 last:border-0">
      <span className="text-ink-muted">{k}</span>
      <span className={cn('text-right font-medium', tone === 'bad' && 'text-critical', tone === 'good' && 'text-[var(--delta-up-good)]')}>{v}</span>
    </div>
  );
}
