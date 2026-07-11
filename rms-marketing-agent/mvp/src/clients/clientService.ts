// Client onboarding: add a property-manager account, connect its channel manager, import its
// listings into the brain. Demo clients get a generated portfolio (full history, zero creds);
// Guesty/Hostaway clients use the real adapters with the client's own credentials — secrets
// stay server-side and are never echoed back to the browser.
import type {
  ClientChannelManager, ClientRecord, ClientStatus, ListingRecord,
} from '../types.ts';
import type { Store } from '../store/store.ts';
import type { RevPilotEnv } from '../config/env.ts';
import { createGuestyAdapter } from '../adapters/guestyAdapter.ts';
import { createHostawayAdapter } from '../adapters/hostawayAdapter.ts';
import { generateClientListings } from '../sample/world.ts';
import { materializeProperty, parseMonthlySnapshotCsv } from './sheetsImport.ts';
import { hashSeed, mulberry32 } from '../util/prng.ts';

export interface AddClientInput {
  name: string;
  contactEmail: string;
  market: string;
  channelManager: ClientChannelManager;
  credentials?: { clientId?: string; clientSecret?: string };
  /** demo mode only: portfolio size to generate on connect (default 4) */
  demoListingCount?: number;
  /** sheets mode: the monthly-snapshot CSV (see sheetsImport.ts for the format) */
  sheetsCsv?: string;
}

/** The browser-safe view: secrets masked to their last 4 characters; the raw sheet export
 *  stays server-side (it's the client's business data — kept only for re-sync). */
export interface ClientView extends Omit<ClientRecord, 'credentials' | 'sheetsCsv'> {
  credentialHint: string | null;
  listingCount: number;
  openRecs: number;
  activePromos: number;
}

export function toClientView(store: Store, c: ClientRecord): ClientView {
  const state = store.getState();
  const { credentials, sheetsCsv: _omitted, ...rest } = c;
  const secret = credentials?.clientSecret;
  return {
    ...rest,
    credentialHint: credentials?.clientId
      ? `${credentials.clientId}${secret ? ` / ····${secret.slice(-4)}` : ''}`
      : null,
    listingCount: c.listingIds.length,
    openRecs: state.recommendations.filter(
      (r) => (r.status ?? 'proposed') === 'proposed' && c.listingIds.includes(r.listingId),
    ).length,
    activePromos: state.promotions.filter(
      (p) => p.status === 'active' && c.listingIds.includes(p.listingId),
    ).length,
  };
}

export function addClient(store: Store, input: AddClientInput): ClientRecord {
  const name = input.name.trim();
  const email = input.contactEmail.trim();
  if (!name) throw new Error('client name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('a valid contact email is required');
  if (input.channelManager === 'sheets' && !input.sheetsCsv?.trim()) {
    throw new Error('sheets clients need the monthly-snapshot CSV (paste the sheet export)');
  }
  if (!['demo', 'sheets'].includes(input.channelManager) && !(input.credentials?.clientId && input.credentials?.clientSecret)) {
    throw new Error(`${input.channelManager} needs an API client id + secret (or pick the demo portfolio to start without credentials)`);
  }
  const state = store.getState();
  if (state.clients.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.status !== 'disabled')) {
    throw new Error(`a client named "${name}" already exists`);
  }
  const client: ClientRecord = {
    id: store.nextId('cl'),
    name,
    contactEmail: email,
    market: input.market.trim() || 'Unspecified',
    channelManager: input.channelManager,
    credentials: input.channelManager === 'demo' ? undefined : input.credentials,
    status: 'pending',
    statusDetail: 'created — not connected yet',
    listingIds: [],
    createdAt: state.simDate,
    demoListingCount: input.channelManager === 'demo' ? (input.demoListingCount ?? 4) : undefined,
    sheetsCsv: input.channelManager === 'sheets' ? input.sheetsCsv : undefined,
  };
  store.update((s) => {
    s.clients.push(client);
  });
  store.appendAudit({
    ts: state.simDate, actor: 'operator', kind: 'client_added',
    detail: `Client "${name}" added (${input.channelManager}${input.channelManager === 'demo' ? `, ${input.demoListingCount ?? 4} demo listings on connect` : ''})`,
  });
  return client;
}

export interface ConnectOptions {
  env: RevPilotEnv;
  demoListingCount?: number;
  /** sheets mode: fresh CSV for this sync (falls back to the one stored on the client) */
  sheetsCsv?: string;
  /** injectable for tests — passed through to the live adapters */
  fetchImpl?: typeof fetch;
}

export interface ConnectResult {
  status: ClientStatus;
  detail: string;
  importedListingIds: string[];
}

/** Test the connection and import listings. Retry-safe: reconnecting a connected client
 *  re-imports only listings it doesn't already own. */
export async function connectClient(store: Store, clientId: string, opts: ConnectOptions): Promise<ConnectResult> {
  const state = store.getState();
  const client = state.clients.find((c) => c.id === clientId);
  if (!client) throw new Error(`unknown client ${clientId}`);
  if (client.status === 'disabled') throw new Error('client is disabled — re-enable it by reconnecting is not allowed; add a new client');

  const demoCount = opts.demoListingCount ?? client.demoListingCount ?? 4;
  let result: ConnectResult;
  try {
    if (client.channelManager === 'sheets') {
      result = importSheetsProperty(store, client, opts.sheetsCsv);
    } else if (client.channelManager === 'demo') {
      result = importDemoPortfolio(store, client, demoCount);
    } else {
      result = await importFromChannelManager(store, client, opts);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'connection failed';
    setClientStatus(store, clientId, 'error', detail);
    store.appendAudit({
      ts: state.simDate, actor: 'system', kind: 'client_error',
      detail: `Client "${client.name}" connection failed: ${detail}`,
    });
    return { status: 'error', detail, importedListingIds: [] };
  }

  store.update((s) => {
    const c = s.clients.find((x) => x.id === clientId)!;
    c.status = 'connected';
    c.statusDetail = result.detail;
    c.connectedAt = s.simDate;
    c.listingIds = [...new Set([...c.listingIds, ...result.importedListingIds])];
    // remember the portfolio size actually used, so "Sync now" never silently grows it
    if (c.channelManager === 'demo') c.demoListingCount = demoCount;
    if (c.channelManager === 'sheets' && opts.sheetsCsv?.trim()) c.sheetsCsv = opts.sheetsCsv;
  });
  store.appendAudit({
    ts: state.simDate, actor: 'system', kind: 'client_connected',
    detail: `Client "${client.name}" connected via ${client.channelManager}: ${result.detail}`,
  });
  return { ...result, status: 'connected' };
}

export function disconnectClient(store: Store, clientId: string): void {
  const state = store.getState();
  const client = state.clients.find((c) => c.id === clientId);
  if (!client) throw new Error(`unknown client ${clientId}`);
  setClientStatus(store, clientId, 'disabled', 'disconnected by operator — listings kept for the audit trail, no new pushes');
  store.appendAudit({
    ts: state.simDate, actor: 'operator', kind: 'client_disconnected',
    detail: `Client "${client.name}" disconnected (${client.listingIds.length} listings retained read-only)`,
  });
}

// ---------------------------------------------------------------------------

function setClientStatus(store: Store, clientId: string, status: ClientStatus, detail: string): void {
  store.update((s) => {
    const c = s.clients.find((x) => x.id === clientId);
    if (c) {
      c.status = status;
      c.statusDetail = detail;
    }
  });
}

function importDemoPortfolio(store: Store, client: ClientRecord, count: number): ConnectResult {
  const state = store.getState();
  const already = new Set(client.listingIds);
  const portfolio = generateClientListings(state.seed, client, count, state.simDate);
  const fresh = portfolio.listings.filter((l) => !already.has(l.id));
  store.update((s) => {
    for (const l of fresh) {
      s.listings.push(l);
      s.calendar[l.id] = portfolio.calendar[l.id];
      s.snapshots[l.id] = portfolio.snapshots[l.id];
      s.stlyOccupancy[l.id] = portfolio.stlyOccupancy[l.id];
      s.compMedianRate[l.id] = portfolio.compMedianRate[l.id];
    }
    const freshIds = new Set(fresh.map((l) => l.id));
    s.reservations.push(...portfolio.reservations.filter((r) => freshIds.has(r.listingId)));
    s.visibilityObservations.push(...portfolio.visibilityObservations.filter((v) => freshIds.has(v.listingId)));
  });
  return {
    status: 'connected',
    detail: fresh.length === 0
      ? `portfolio in sync — ${client.listingIds.length} listings up to date`
      : `${fresh.length} demo listing${fresh.length === 1 ? '' : 's'} imported with full booking history`,
    importedListingIds: fresh.map((l) => l.id),
  };
}

/** No-API onboarding: the client's weekly OTB sheet (monthly buckets) becomes a property the
 *  brain reasons over. Re-sync with a fresh CSV replaces the property's data in place —
 *  the weekly sheet update IS the data feed. */
function importSheetsProperty(store: Store, client: ClientRecord, freshCsv: string | undefined): ConnectResult {
  const csv = freshCsv?.trim() || client.sheetsCsv;
  if (!csv) throw new Error('no sheet data — paste the monthly-snapshot CSV');
  const { property, skipped } = parseMonthlySnapshotCsv(csv);
  const state = store.getState();
  const materialized = materializeProperty(client.id, property, state.simDate);

  store.update((s) => {
    const existing = s.listings.findIndex((l) => l.id === materialized.listing.id);
    if (existing >= 0) s.listings[existing] = materialized.listing;
    else s.listings.push(materialized.listing);
    s.calendar[materialized.listing.id] = materialized.calendar;
    s.snapshots[materialized.listing.id] = materialized.snapshots;
    s.stlyOccupancy[materialized.listing.id] = materialized.stlyOccupancy;
    // no market feed for sheet clients (yet) — comp gap reads as "no data", never fabricated
    delete s.compMedianRate[materialized.listing.id];
    // open recommendations were computed on the replaced data — expire them; the next sweep re-evaluates
    for (const r of s.recommendations) {
      if (r.listingId === materialized.listing.id && (r.status ?? 'proposed') === 'proposed') r.status = 'expired';
    }
  });

  const weeks = new Set(property.months.flatMap((m) => m.snapshots.map((sn) => sn.asOf))).size;
  return {
    status: 'connected',
    detail: `${property.name}: ${materialized.monthsLoaded.length} forward month(s) loaded (${materialized.monthsLoaded.join(', ')}) from ${weeks} weekly snapshot(s), ${property.rooms} rooms${skipped.length ? ` — ${skipped.length} row(s) skipped` : ''}. Execution runs at GUIDED tier (no PMS/OTA API).`,
    importedListingIds: [materialized.listing.id],
  };
}

async function importFromChannelManager(store: Store, client: ClientRecord, opts: ConnectOptions): Promise<ConnectResult> {
  const creds = client.credentials;
  if (!creds?.clientId || !creds.clientSecret) throw new Error('missing credentials');

  // per-client credentials override the global env flags
  const envForClient: RevPilotEnv = client.channelManager === 'guesty'
    ? { ...opts.env, guestyEnabled: true, guestyClientId: creds.clientId, guestyClientSecret: creds.clientSecret }
    : { ...opts.env, hostawayEnabled: true, hostawayAccountId: creds.clientId, hostawayApiKey: creds.clientSecret };
  const adapter = client.channelManager === 'guesty'
    ? createGuestyAdapter(envForClient, undefined, { fetchImpl: opts.fetchImpl })
    : createHostawayAdapter(envForClient, undefined, { fetchImpl: opts.fetchImpl });

  const cmListings = await adapter.getListings();
  if (cmListings.length === 0) {
    throw new Error(`connected to ${client.channelManager}, but the account has no listings`);
  }

  const state = store.getState();
  const already = new Set(client.listingIds);
  const fresh: ListingRecord[] = [];
  for (const [i, l] of cmListings.entries()) {
    const id = `${client.id.toUpperCase()}-${l.id}`;
    if (already.has(id) || state.listings.some((x) => x.id === id)) continue;
    const rng = mulberry32(hashSeed(state.seed, client.id, l.id));
    fresh.push({
      id,
      cmId: l.id,
      name: l.name,
      market: client.market,
      bedrooms: 1 + Math.floor(rng() * 3),
      baseRate: 150, // real rates arrive with the first calendar sync — flagged in statusDetail
      targetOccupancy: 0.65,
      channels: l.channels.length ? l.channels : ['airbnb', 'booking', 'expedia', 'vrbo'],
      createdAt: state.simDate,
      imageHue: Math.floor(rng() * 360),
      clientId: client.id,
    });
  }
  store.update((s) => {
    for (const l of fresh) {
      s.listings.push(l);
      s.calendar[l.id] = [];
      s.snapshots[l.id] = [];
    }
  });
  return {
    status: 'connected',
    detail: `${cmListings.length} listing${cmListings.length === 1 ? '' : 's'} found, ${fresh.length} imported — signals populate after the first calendar sync + snapshot job`,
    importedListingIds: fresh.map((l) => l.id),
  };
}
