'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { postJson, triggerRefresh } from '@/lib/useApi';
import type { AddClientRequest, ClientChannelManager, ClientMutationResponse } from '@/lib/apiTypes';

const CM_OPTIONS: { value: ClientChannelManager; title: string; detail: string }[] = [
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
    channelManager: 'demo' as ClientChannelManager,
    apiId: '', apiSecret: '', demoListingCount: 4,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClientMutationResponse | null>(null);

  const needsCreds = form.channelManager !== 'demo';

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
    setForm({ name: '', contactEmail: '', market: '', channelManager: 'demo', apiId: '', apiSecret: '', demoListingCount: 4 });
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
          <Button onClick={submit} disabled={busy || !form.name || !form.contactEmail}>
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
          ) : (
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
          )}

          {error ? <p className="text-xs text-critical">{error}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
