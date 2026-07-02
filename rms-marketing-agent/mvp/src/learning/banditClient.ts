// Bandit facade: prefers the Python ml-service, degrades to the in-process Thompson
// fallback on ANY failure (the demo runs with no service at all). updates ALWAYS land
// in the local store first — the dashboard's "bandit visibly updating" view reads it
// even when the service is up.
import type { BanditArm, BanditChoice, BanditContext } from '../types.ts';
import type { RevPilotEnv } from '../config/env.ts';
import type { Store } from '../store/store.ts';
import { banditStateView, chooseArm, TS_MODEL, updateArm } from './tsBandit.ts';
import type { BanditStateRow } from './tsBandit.ts';

const JSON_HEADERS = { 'content-type': 'application/json' };

export interface BanditStateView {
  model: string;
  local: BanditStateRow[];
  remote: BanditStateRow[] | null;
}

export class BanditClient {
  private store: Store;
  private env: RevPilotEnv;
  private fetchImpl: typeof fetch;

  constructor(store: Store, env: RevPilotEnv, fetchImpl: typeof fetch = fetch) {
    this.store = store;
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  async choose(ctx: BanditContext, candidates: BanditArm[], seed: string | number): Promise<BanditChoice> {
    try {
      const res = await this.fetchImpl(`${this.env.mlServiceUrl}/bandit/choose`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ context: ctx, candidates, seed }),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`ml-service ${res.status}`);
      const body = (await res.json()) as BanditChoice;
      if (!body || !body.arm || typeof body.score !== 'number') throw new Error('ml-service bad choice');
      return { ...body, model: `ml:${body.model}` };
    } catch {
      return chooseArm(this.store.getState().banditState, ctx, candidates, seed);
    }
  }

  /** Local posterior update ALWAYS applies; the remote POST is best-effort. */
  async update(ctx: BanditContext, arm: BanditArm, reward: number): Promise<{ model: string }> {
    this.store.update((s) => {
      updateArm(s.banditState, ctx, arm, reward);
      s.banditModel = TS_MODEL;
    });
    try {
      const res = await this.fetchImpl(`${this.env.mlServiceUrl}/bandit/update`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ context: ctx, arm, reward }),
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return { model: `ml:+${TS_MODEL}` }; // both paths updated
    } catch {
      // ignored: the local posterior above is the durable record
    }
    return { model: TS_MODEL };
  }

  async stateView(): Promise<BanditStateView> {
    const local = banditStateView(this.store.getState().banditState);
    try {
      const res = await this.fetchImpl(`${this.env.mlServiceUrl}/bandit/state`, {
        signal: AbortSignal.timeout(1000),
      });
      if (!res.ok) throw new Error(`ml-service ${res.status}`);
      const body = (await res.json()) as { model: string; arms: BanditStateRow[] };
      return { model: `ml:${body.model}`, local, remote: body.arms };
    } catch {
      return { model: TS_MODEL, local, remote: null };
    }
  }
}
