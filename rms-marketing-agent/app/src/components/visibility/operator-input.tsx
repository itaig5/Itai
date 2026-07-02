'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { postJson, triggerRefresh } from '@/lib/useApi';
import { CHANNEL_LABEL } from '@/lib/utils';

const PLATFORMS = ['booking', 'airbnb', 'expedia', 'vrbo'] as const;

export function OperatorInput({ listings }: { listings: { id: string; name: string }[] }) {
  const [entry, setEntry] = useState({ listingId: listings[0]?.id ?? '', platform: 'booking', rank: '', impressions: '', ctr: '', conversion: '' });
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitEntry() {
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { listingId: entry.listingId, platform: entry.platform };
      if (entry.rank) payload.rank = Number(entry.rank);
      if (entry.impressions) payload.searchImpressions = Number(entry.impressions);
      if (entry.ctr) payload.ctr = Number(entry.ctr);
      if (entry.conversion) payload.conversion = Number(entry.conversion);
      await postJson('/api/visibility/operator-input', { entry: payload });
      setMsg('Entry added — the brain sees it on the next sweep.');
      triggerRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitCsv() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await postJson<{ added: number }>('/api/visibility/operator-input', { csv });
      setMsg(`${res.added} row(s) imported.`);
      setCsv('');
      triggerRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your extranet numbers — human-in-the-loop</CardTitle>
        <CardDescription>
          The OTA search funnel (impressions, CTR, conversion) has no API. Read your extranet dashboards
          (Booking Visibility Dashboard, Airbnb Insights, Expedia Property Analytics) and enter the numbers here —
          RevPilot never scrapes logged-in extranets.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-ink-secondary">Single entry</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="vi-listing">Listing</Label>
              <Select id="vi-listing" className="mt-1 w-full" value={entry.listingId} onChange={(e) => setEntry({ ...entry, listingId: e.target.value })}>
                {listings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="vi-platform">Platform</Label>
              <Select id="vi-platform" className="mt-1 w-full" value={entry.platform} onChange={(e) => setEntry({ ...entry, platform: e.target.value })}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{CHANNEL_LABEL[p]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="vi-rank">Search rank</Label>
              <Input id="vi-rank" className="mt-1" inputMode="numeric" placeholder="e.g. 7" value={entry.rank} onChange={(e) => setEntry({ ...entry, rank: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vi-impressions">Impressions (7d)</Label>
              <Input id="vi-impressions" className="mt-1" inputMode="numeric" placeholder="e.g. 2400" value={entry.impressions} onChange={(e) => setEntry({ ...entry, impressions: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vi-ctr">CTR (0–1)</Label>
              <Input id="vi-ctr" className="mt-1" inputMode="decimal" placeholder="e.g. 0.041" value={entry.ctr} onChange={(e) => setEntry({ ...entry, ctr: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vi-conv">Conversion (0–1)</Label>
              <Input id="vi-conv" className="mt-1" inputMode="decimal" placeholder="e.g. 0.012" value={entry.conversion} onChange={(e) => setEntry({ ...entry, conversion: e.target.value })} />
            </div>
          </div>
          <Button size="sm" className="w-fit" onClick={submitEntry} disabled={busy || !entry.listingId}>Add entry</Button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-ink-secondary">Bulk CSV import</div>
          <Textarea
            aria-label="Visibility CSV"
            className="min-h-32 font-mono text-xs"
            placeholder={'listingId,platform,observedAt,rank,searchImpressions,ctr,conversion\nL-CHALET,booking,2026-07-01,18,1900,0.021,0.009'}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <Button size="sm" variant="secondary" className="w-fit" onClick={submitCsv} disabled={busy || !csv.trim()}>
            <Upload size={13} /> Import CSV
          </Button>
        </div>
        {msg ? <p className="text-xs text-ink-secondary lg:col-span-2">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
