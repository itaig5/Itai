// Human-in-the-loop source (doc 11): the funnel metrics (impressions/CTR/conversion) live in the
// extranet dashboards the OTAs expose no API for. The operator reads/exports them and RevPilot
// ingests (CSV upload or manual entry) — it never scrapes the logged-in extranet.
import type { Platform, VisibilityObservation, VisibilitySource } from '../types.ts';
import type { Store } from '../store/store.ts';
import type { VisibilityAdapter } from './provider.ts';
import { readStoreObservations } from './provider.ts';

const PLATFORMS: Platform[] = ['airbnb', 'booking', 'expedia', 'vrbo'];

function isPlatform(v: string | undefined): v is Platform {
  return v !== undefined && (PLATFORMS as string[]).includes(v);
}

export class StoreBackedOperatorInputAdapter implements VisibilityAdapter {
  id = 'operator_input_store';
  source: VisibilitySource = 'operator_input';

  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    return readStoreObservations(this.store, this.source, listingId, platform, asOf);
  }
}

/** '' -> absent; non-numeric -> malformed (row skipped). */
function numCell(v: string | undefined): number | undefined | 'malformed' {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : 'malformed';
}

/**
 * Parse an operator-exported CSV. Header: listingId,platform,observedAt,rank,searchImpressions,ctr,conversion
 * (rank and later columns optional/empty). Tolerant: trims cells, skips malformed rows.
 */
export function parseOperatorVisibilityCsv(csv: string): VisibilityObservation[] {
  const out: VisibilityObservation[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells[0]?.toLowerCase() === 'listingid') continue; // header row
    const [listingId, platform, observedAt] = cells;
    if (!listingId || !isPlatform(platform)) continue;
    if (observedAt === undefined || !/^\d{4}-\d{2}-\d{2}/.test(observedAt)) continue;

    const nums = [cells[3], cells[4], cells[5], cells[6]].map(numCell);
    if (nums.includes('malformed')) continue;
    const [rank, searchImpressions, ctr, conversion] = nums as (number | undefined)[];

    const obs: VisibilityObservation = { listingId, platform, observedAt, source: 'operator_input' };
    if (rank !== undefined) obs.rank = rank;
    if (searchImpressions !== undefined) obs.searchImpressions = searchImpressions;
    if (ctr !== undefined) obs.ctr = ctr;
    if (conversion !== undefined) obs.conversion = conversion;
    out.push(obs);
  }
  return out;
}

export interface ManualVisibilityEntry {
  listingId: string;
  platform: Platform;
  observedAt: string;
  rank?: number;
  searchImpressions?: number;
  ctr?: number;
  conversion?: number;
}

/** One periodic manual entry from the extranet dashboard (the 🟡 path in doc 11). */
export function buildManualEntry(input: ManualVisibilityEntry): VisibilityObservation {
  return { ...input, source: 'operator_input' };
}
