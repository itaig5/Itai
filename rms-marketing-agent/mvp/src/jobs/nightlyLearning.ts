// Nightly learning job (BUILD_PROMPT step 7): measure any due outcomes, push rewards into the
// bandit, and (when the ML service is up) run a forecast backtest so champion/challenger stays
// honest. Run: npm run job:learn   (from rms-marketing-agent/)
import { createRuntime } from '../runtime.ts';
import { buildAllSignals } from '../engine/signalService.ts';
import { measureDueOutcomes } from '../sample/simulator.ts';

const rt = createRuntime();
const state = rt.store.getState();
const signals = await buildAllSignals(rt.store, rt.visibility);
const { measured, banditUpdates } = await measureDueOutcomes(rt, signals, state.simDate);

// champion/challenger backtest via the ML service (skipped gracefully when it's down)
let backtest: unknown = null;
try {
  const listing = state.listings[0];
  const series = (state.snapshots[listing.id] ?? []).map((s) => ({ ds: s.asOf, y: s.bookedNights }));
  if (series.length >= 14) {
    const res = await fetch(`${rt.env.mlServiceUrl}/eval/backtest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ series, holdoutDays: 7 }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) backtest = await res.json();
  }
} catch {
  backtest = 'ml-service unreachable — TS fallback bandit already updated locally';
}

rt.store.appendAudit({
  ts: state.simDate, actor: 'system', kind: 'learning_job',
  detail: `Nightly learning: ${measured.length} outcome(s) measured, ${banditUpdates} bandit update(s)${backtest && typeof backtest === 'object' ? ', backtest refreshed' : ''}`,
});

console.log(JSON.stringify({ job: 'nightly-learning', measured, banditUpdates, backtest }, null, 2));
