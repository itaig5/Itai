'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApi, triggerRefresh } from '@/lib/useApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input, Label } from '@/components/ui/input';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { cn, CHANNEL_COLOR, CHANNEL_LABEL, MOVE_LABEL } from '@/lib/utils';
import type { OperatorSettings } from '@/lib/apiTypes';

interface SettingsResponse {
  simDate: string;
  settings: OperatorSettings;
  integrations: Record<string, string>;
}

const BOUND_TYPES = ['last_minute', 'early_booker', 'weekly_los', 'basic_deal'] as const;
const PLATFORMS = ['booking', 'airbnb', 'expedia', 'vrbo'] as const;

export default function SettingsPage() {
  const { data, loading, error } = useApi<SettingsResponse>('/api/settings');
  const [draft, setDraft] = useState<OperatorSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data.settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading || !data || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
      </div>
    );
  }
  if (error) return <p className="text-sm text-critical">Failed to load settings: {error}</p>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      triggerRefresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  const auto = draft.autonomyMode === 'auto_within_bounds';

  return (
    <div className="flex flex-col gap-4 pb-20">
      <PageHeader title="Settings" description="Autonomy, hard guardrails, and channel connections. Everything here is enforced in code — not in prompts." />

      {/* AUTONOMY */}
      <Card>
        <CardHeader>
          <CardTitle>Autonomy</CardTitle>
          <CardDescription>How much RevPilot may do on its own. Default is approve-each — there is never a hidden auto-accept.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ModeOption
            active={!auto}
            title="Approve each action"
            detail="Every push needs your click. One click still pushes to every channel at once. Recommended."
            onSelect={() => setDraft({ ...draft, autonomyMode: 'approve_each' })}
          />
          <ModeOption
            active={auto}
            title="Auto-execute within my bounds"
            detail="RevPilot pushes low-risk promotions automatically when ALL bounds below hold. Compliant because YOU set the bounds (RealPage settlement / CA AB325: no hidden auto-accept)."
            onSelect={() => setDraft({ ...draft, autonomyMode: 'auto_within_bounds' })}
          />

          <div className={cn('ml-4 grid gap-3 rounded-lg border border-hairline p-4 sm:grid-cols-2', !auto && 'opacity-50')}>
            <NumberField
              label="Max discount depth (%)"
              value={Math.round(draft.bounds.maxDepthPct * 100)}
              min={5} max={30}
              disabled={!auto}
              onChange={(v) => setDraft({ ...draft, bounds: { ...draft.bounds, maxDepthPct: v / 100 } })}
            />
            <NumberField
              label="Max active promos per listing"
              value={draft.bounds.maxActivePromosPerListing}
              min={1} max={5}
              disabled={!auto}
              onChange={(v) => setDraft({ ...draft, bounds: { ...draft.bounds, maxActivePromosPerListing: v } })}
            />
            <NumberField
              label="Only when behind pace by at least (pp)"
              value={Math.round(draft.bounds.minPaceDeficitPct * 100)}
              min={5} max={30}
              disabled={!auto}
              onChange={(v) => setDraft({ ...draft, bounds: { ...draft.bounds, minPaceDeficitPct: v / 100 } })}
            />
            <div>
              <Label>Allowed promo types</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {BOUND_TYPES.map((t) => {
                  const on = draft.bounds.allowedTypes.includes(t);
                  return (
                    <button
                      key={t}
                      disabled={!auto}
                      onClick={() => setDraft({
                        ...draft,
                        bounds: {
                          ...draft.bounds,
                          allowedTypes: on ? draft.bounds.allowedTypes.filter((x) => x !== t) : [...draft.bounds.allowedTypes, t],
                        },
                      })}
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-default',
                        on ? 'border-accent bg-accent-soft text-ink' : 'border-hairline text-ink-muted hover:bg-inset',
                      )}
                    >
                      {MOVE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-hairline p-4">
            <div>
              <div className="text-sm font-medium">Auto turn-off</div>
              <p className="text-xs text-ink-muted">End a promotion automatically once pace recovers to target (works in both modes).</p>
            </div>
            <Switch checked={draft.autoTurnOffEnabled} onCheckedChange={(v) => setDraft({ ...draft, autoTurnOffEnabled: v })} aria-label="Auto turn-off" />
          </div>
          <NumberField
            label="Measure outcomes after (days)"
            value={draft.measureAfterDays}
            min={3} max={14}
            onChange={(v) => setDraft({ ...draft, measureAfterDays: v })}
            className="max-w-56"
          />
        </CardContent>
      </Card>

      {/* GUARDRAILS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck size={15} className="text-accent" /> Hard guardrails — checked before every write</CardTitle>
          <CardDescription>
            OTA discounts stack (Booking.com multiplies Genius × mobile × deals; Airbnb stacks by priority).
            RevPilot simulates the compounded public price per channel and blocks any push beyond these limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Max compounded discount (%)"
            value={Math.round(draft.maxEffectiveDiscount * 100)}
            min={10} max={60}
            onChange={(v) => setDraft({ ...draft, maxEffectiveDiscount: v / 100 })}
          />
          <NumberField
            label="Break-even clip floor (% of ADR)"
            value={Math.round(draft.clipFloorPctOfAdr * 100)}
            min={20} max={90}
            onChange={(v) => setDraft({ ...draft, clipFloorPctOfAdr: v / 100 })}
          />
          <p className="text-[11px] leading-relaxed text-ink-muted sm:col-span-2">
            Advisory by design: triggers use this property's own data plus public market data only; no pooling of
            confidential competitor data (the Gibson/RealPage line, CA AB325/SB763); every action lands in the immutable audit trail.
          </p>
        </CardContent>
      </Card>

      {/* CHANNELS */}
      <Card>
        <CardHeader>
          <CardTitle>Channel connections</CardTitle>
          <CardDescription>Which platforms "push everywhere" targets. Execution rides the channel manager (Guesty first).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {PLATFORMS.map((p) => (
            <div key={p} className="flex items-center gap-3 rounded-lg border border-hairline px-4 py-2.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: CHANNEL_COLOR[p] }} />
              <span className="text-sm font-medium">{CHANNEL_LABEL[p]}</span>
              <Badge variant="outline">{draft.channels[p]?.via ?? 'mock'}</Badge>
              <div className="ml-auto">
                <Switch
                  checked={draft.channels[p]?.connected ?? false}
                  onCheckedChange={(v) => setDraft({ ...draft, channels: { ...draft.channels, [p]: { ...draft.channels[p], connected: v } } })}
                  aria-label={`${CHANNEL_LABEL[p]} connected`}
                />
              </div>
            </div>
          ))}
          <div className="mt-2 grid gap-1.5 rounded-lg bg-inset p-4 text-xs text-ink-secondary">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Integrations (env-gated)</div>
            <IntegrationRow name="Guesty — OTA promotions API (the execution rail)" status={data.integrations.guesty} />
            <IntegrationRow name="Hostaway — rates/calendar only (no promotion API)" status={data.integrations.hostaway} />
            <IntegrationRow name="Booking.com Market Insights — demand/pace (not the funnel)" status={data.integrations.bookingInsights} />
            <IntegrationRow name="ML service — bandit + forecasting" status={data.integrations.mlService} />
          </div>
        </CardContent>
      </Card>

      {/* sticky save bar */}
      {dirty || saved || saveError ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
            {saved ? <span className="text-xs font-medium text-good">Saved — changes are live for the next sweep.</span>
              : saveError ? <span className="text-xs text-critical">{saveError}</span>
              : <span className="text-xs text-ink-muted">Unsaved changes</span>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(structuredClone(data.settings))} disabled={busy || !dirty}>Discard</Button>
              <Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModeOption({ active, title, detail, onSelect }: { active: boolean; title: string; detail: string; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-lg border p-4 text-left transition-colors',
        active ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-hairline hover:bg-inset',
      )}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={cn('h-3 w-3 rounded-full border-2', active ? 'border-accent bg-accent' : 'border-baseline')} />
        {title}
      </div>
      <p className="mt-1 pl-5 text-xs leading-relaxed text-ink-muted">{detail}</p>
    </button>
  );
}

function NumberField({
  label, value, min, max, onChange, disabled, className,
}: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; disabled?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input
        type="number"
        className="mt-1"
        value={String(value)}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        onBlur={(e) => {
          const v = Number(e.target.value);
          onChange(Number.isNaN(v) ? min : Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );
}

function IntegrationRow({ name, status }: { name: string; status: string }) {
  const live = status.startsWith('live') || status.startsWith('http');
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>{name}</span>
      <span className={cn('text-right font-medium', live ? 'text-good' : 'text-ink-muted')}>{status}</span>
    </div>
  );
}
