'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { postJson, triggerRefresh } from '@/lib/useApi';
import type { AddClientRequest, ClientChannelManager, ClientMutationResponse } from '@/lib/apiTypes';

const CM_OPTIONS: { value: ClientChannelManager; title: string; detail: string }[] = [
  {
    value: 'sheets',
    title: 'Google Sheets / weekly OTB log (real clients, no API)',
    detail: 'Paste the CSV export of the client’s weekly on-the-books sheet (room nights, income, targets, last-year same-time per stay-month). The brain runs on it; execution is guided — RevPilot proposes with exact parameters, you apply them in the extranet.',
  },
  {
    value: 'demo',
    title: 'Demo portfolio (no credentials)',
    detail: 'Generates a realistic portfolio with full booking history — the client sees the whole loop working before any integration.',
  },
  {
    value: 'guesty',
    title: 'Guesty',
    detail: 'The execution rail: the only channel-manager API that manages OTA promotions. Needs the client’s Open-API credentials.',
  },
  {
    value: 'hostaway',
    title: 'Hostaway',
    detail: 'Rates & calendar only (no promotion API — promos stay guided). Needs account ID + API key.',
  },
];

export function AddClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', contactEmail: '', market: '',
    channelManager: 'sheets' as ClientChannelManager,
    apiId: '', apiSecret: '', demoListingCount: 4, sheetsCsv: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClientMutationResponse | null>(null);

  const needsCreds = form.channelManager === 'guesty' || form.channelManager === 'hostaway';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: AddClientRequest = {
        name: form.name,
        contactEmail: form.contactEmail,
        market: form.market,
        channelManager: form.channelManager,
        credentials: needsCreds ? { clientId: form.apiId, clientSecret: form.apiSecret } : undefined,
        demoListingCount: form.demoListingCount,
        sheetsCsv: form.channelManager === 'sheets' ? form.sheetsCsv : undefined,
        connectNow: true,
      };
      const res = await postJson<ClientMutationResponse>('/api/clients', payload);
      setResult(res);
      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setForm({ name: '', contactEmail: '', market: '', channelManager: 'sheets', apiId: '', apiSecret: '', demoListingCount: 4, sheetsCsv: '' });
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={reset}
      title={result ? 'Client added' : 'Add a client'}
      description={result ? undefined : 'Create the account, connect its channel manager, and import its listings — one flow.'}
      footer={result ? (
        <Button onClick={reset}>Done</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={reset} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !form.name || !form.contactEmail || (form.channelManager === 'sheets' && !form.sheetsCsv.trim())}>
            {busy ? 'Connecting…' : 'Add & connect'}
          </Button>
        </>
      )}
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{result.client.name}</span>
            <Badge variant={result.client.status === 'connected' ? 'good' : result.client.status === 'error' ? 'critical' : 'default'}>
              {result.client.status}
            </Badge>
          </div>
          <p className={cn('text-sm', result.client.status === 'error' ? 'text-critical' : 'text-ink-secondary')}>
            {result.client.statusDetail}
          </p>
          {result.client.status === 'connected' ? (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">
              {result.client.listingCount} listing{result.client.listingCount === 1 ? '' : 's'} now feed the brain —
              they appear on Home, and the next sweep queues recommendations for any that are behind pace.
            </p>
          ) : result.client.status === 'error' ? (
            <p className="text-xs text-ink-muted">
              Fix the credentials and hit <em>Retry connection</em> on the client card — nothing was imported.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cl-name">Client / company name</Label>
              <Input id="cl-name" className="mt-1" placeholder="e.g. Blue Door BnB" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="cl-email">Contact email</Label>
              <Input id="cl-email" className="mt-1" type="email" placeholder="ops@bluedoor.co" value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cl-market">Primary market</Label>
              <Input id="cl-market" className="mt-1" placeholder="e.g. Tel Aviv" value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Channel manager</Label>
            <div className="mt-1.5 flex flex-col gap-2">
              {CM_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setForm({ ...form, channelManager: o.value })}
                  aria-pressed={form.channelManager === o.value}
                  className={cn(
                    'cursor-pointer rounded-lg border p-3 text-left transition-colors',
                    form.channelManager === o.value ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-hairline hover:bg-inset',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className={cn('h-3 w-3 rounded-full border-2', form.channelManager === o.value ? 'border-accent bg-accent' : 'border-baseline')} />
                    {o.title}
                  </div>
                  <p className="mt-0.5 pl-5 text-xs leading-relaxed text-ink-muted">{o.detail}</p>
                </button>
              ))}
            </div>
          </div>

          {form.channelManager === 'sheets' ? (
            <div className="flex flex-col gap-2 rounded-lg border border-hairline p-3">
              <Label htmlFor="cl-sheet">Weekly OTB sheet — CSV export</Label>
              <Textarea
                id="cl-sheet"
                className="min-h-36 font-mono text-[11px]"
                placeholder={'property,rooms,month,asOf,roomNights,income,occTarget,revenueTarget,expectedAdr,stlyRoomNights,stlyIncome\nHarbor House,19,2026-06,2026-01-25,210,41000,92,110000,220,30,8500\nHarbor House,19,2026-06,2026-02-01,240,46000,92,110000,220,55,12000'}
                value={form.sheetsCsv}
                onChange={(e) => setForm({ ...form, sheetsCsv: e.target.value })}
              />
              <p className="text-[11px] leading-relaxed text-ink-muted">
                One row per as-of week × stay-month: room nights + income on the books, targets, expected ADR,
                and same-time-last-year (the pace baseline). Column names are matched loosely; extra columns are ignored.
                Re-sync any time by pasting a fresh export — the weekly sheet update is the data feed.
              </p>
            </div>
          ) : null}

          {needsCreds ? (
            <div className="grid gap-3 rounded-lg border border-hairline p-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cl-apiid">{form.channelManager === 'guesty' ? 'Guesty client ID' : 'Hostaway account ID'}</Label>
                <Input id="cl-apiid" className="mt-1 font-mono text-xs" value={form.apiId}
                  onChange={(e) => setForm({ ...form, apiId: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cl-apisecret">{form.channelManager === 'guesty' ? 'Client secret' : 'API key'}</Label>
                <Input id="cl-apisecret" className="mt-1 font-mono text-xs" type="password" value={form.apiSecret}
                  onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} />
              </div>
              <p className="text-[11px] text-ink-muted sm:col-span-2">
                Credentials are used server-side only and never sent back to the browser. Guesty grants
                at most 5 tokens per 24h — RevPilot caches the token automatically.
              </p>
            </div>
          ) : form.channelManager === 'demo' ? (
            <div className="flex items-center gap-4 rounded-lg border border-hairline p-3">
              <div className="w-32 shrink-0">
                <Label htmlFor="cl-count" className="whitespace-nowrap">Demo listings</Label>
                <Input id="cl-count" className="mt-1" type="number" min={1} max={12} value={String(form.demoListingCount)}
                  onChange={(e) => setForm({ ...form, demoListingCount: Math.min(12, Math.max(1, Number(e.target.value) || 4)) })} />
              </div>
              <p className="text-[11px] leading-relaxed text-ink-muted">
                Generated with booking history, pace curves, comps and visibility data — a mix of
                behind-pace and healthy units so recommendations appear immediately.
              </p>
            </div>
          ) : null}

          {error ? <p className="text-xs text-critical">{error}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
