// Pickup forecasting. Baseline = additive pickup on the booking curve (docs 07 1b:
// "use FIRST — simple arithmetic on the booking curve"); the ml-service upgrades it
// (StatsForecast / TimeGPT) behind the same shape. Date math only touches timestamps
// already in the data — no wall-clock reads.
import type { OtbSnapshot } from '../types.ts';
import type { RevPilotEnv } from '../config/env.ts';
import { round } from '../rms/signals.ts';

const DAY_MS = 86_400_000;
const PICKUP_WINDOW_DAYS = 14;

export interface ForecastPoint {
  ds: string; // ISO date
  yhat: number;
}

export interface SeriesPoint {
  ds: string;
  y: number;
}

function isoAddDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Additive pickup: avg daily bookedNights gain over the last <=14 days of snapshots,
 *  projected from the latest snapshot, capped at its availableNights. */
export function pickupForecast(snapshots: OtbSnapshot[], horizonDays: number): ForecastPoint[] {
  if (snapshots.length === 0 || horizonDays <= 0) return [];
  const sorted = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const latest = sorted[sorted.length - 1];
  const window = sorted.slice(-PICKUP_WINDOW_DAYS);
  const first = window[0];
  const elapsedDays = (Date.parse(latest.asOf) - Date.parse(first.asOf)) / DAY_MS;
  const rate = elapsedDays > 0 ? (latest.bookedNights - first.bookedNights) / elapsedDays : 0;
  const points: ForecastPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const yhat = Math.min(latest.bookedNights + rate * i, latest.availableNights);
    points.push({ ds: isoAddDays(latest.asOf, i), yhat: round(yhat, 2) });
  }
  return points;
}

export class ForecastClient {
  private env: RevPilotEnv;
  private fetchImpl: typeof fetch;

  constructor(env: RevPilotEnv, fetchImpl: typeof fetch = fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  async forecast(series: SeriesPoint[], horizon: number): Promise<{ model: string; points: ForecastPoint[] }> {
    try {
      const res = await this.fetchImpl(`${this.env.mlServiceUrl}/forecast`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ series, horizon }),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`ml-service ${res.status}`);
      const body = (await res.json()) as { model: string; points: ForecastPoint[] };
      if (!body || !Array.isArray(body.points)) throw new Error('ml-service bad forecast');
      return { model: body.model, points: body.points };
    } catch {
      const snapshots: OtbSnapshot[] = series.map((p) => ({
        asOf: p.ds,
        bookedNights: p.y,
        availableNights: Infinity, // an uncapped series carries no capacity info
        otbRevenue: 0,
        soldOut: false,
      }));
      return { model: 'pickup-baseline', points: pickupForecast(snapshots, horizon) };
    }
  }
}
