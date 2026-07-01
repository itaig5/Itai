// The insights port. v1 = your own mini-RMS. Later (optional wedge) = Wheelhouse/Beyond providers,
// which expose pace/comp/attribution over self-serve APIs (docs 06/09).
import type { Signals } from '../types.ts';

export interface InsightsProvider {
  id: string;
  capabilities: { hasForecast: boolean; hasPace: boolean; hasTargets: boolean };
  getSignals(listingId: string, window: { start: string; end: string }): Promise<Signals>;
}
