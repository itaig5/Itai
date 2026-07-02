// The v1 mini-RMS as an InsightsProvider: pulls data, computes signals deterministically.
import type { Signals } from '../types.ts';
import type { InsightsProvider } from './insightsProvider.ts';
import { computeSignals, type SignalInputs } from '../rms/signals.ts';

/** Where the mini-RMS reads from (Guesty reservations/calendar + snapshots + public market data). */
export interface RmsDataSource {
  loadSignalInputs(listingId: string, window: { start: string; end: string }): Promise<SignalInputs>;
}

export class InternalRmsProvider implements InsightsProvider {
  id = 'internal-rms';
  capabilities = { hasForecast: false, hasPace: true, hasTargets: true };

  private source: RmsDataSource;
  constructor(source: RmsDataSource) {
    this.source = source;
  }

  async getSignals(listingId: string, window: { start: string; end: string }): Promise<Signals> {
    const inputs = await this.source.loadSignalInputs(listingId, window);
    return computeSignals(inputs);
  }
}
