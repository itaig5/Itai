# Contextual bandit choosing promo type + depth per context (docs 07 §1d, 12 §3).
# The math here is the shared cross-language contract: mvp/src/learning implements the SAME
# arm catalog, bucket() and Beta-posterior update, so the TS fallback and this service agree.
import json
import os
from pathlib import Path

import numpy as np

try:
    from mabwiser.mab import MAB, LearningPolicy
    HAS_MABWISER = True
except ImportError:  # pragma: no cover - installed in this environment
    HAS_MABWISER = False

DEFAULT_STATE_PATH = Path(__file__).resolve().parent / '.state' / 'bandit.json'

# Doc 07 §1d: keep to few arms — sparse bookings. 10 arms = 4 promo types x pace-ladder depths.
ARM_CATALOG: list[dict] = [
    {'type': 'last_minute', 'depthPct': 0.10},
    {'type': 'last_minute', 'depthPct': 0.15},
    {'type': 'last_minute', 'depthPct': 0.20},
    {'type': 'early_booker', 'depthPct': 0.10},
    {'type': 'early_booker', 'depthPct': 0.15},
    {'type': 'basic_deal', 'depthPct': 0.10},
    {'type': 'basic_deal', 'depthPct': 0.15},
    {'type': 'basic_deal', 'depthPct': 0.20},
    {'type': 'weekly_los', 'depthPct': 0.10},
    {'type': 'weekly_los', 'depthPct': 0.15},
]

CONTEXT_FIELDS = (
    'occupancyDeviation', 'paceVsStlyPct', 'compGapPct',
    'leadTimeDays', 'pickup7d', 'visibilityDrop',
)


def arm_id(arm: dict) -> str:
    return f"{arm['type']}@{arm['depthPct']:.2f}"


def fnv1a(s: str) -> int:
    # Python's hash() is process-salted; FNV-1a gives a stable string -> seed
    # (same construction as mvp/src/util/prng.ts hashSeed).
    h = 0x811C9DC5
    for byte in s.encode('utf-8'):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def bucket(context: dict) -> str:
    # Shared contract: deficit = -paceVsStlyPct -> d0/d1/d2; visibilityDrop -> v; compGap -> c.
    deficit = -float(context['paceVsStlyPct'])
    d = 'd0' if deficit < 0.05 else 'd1' if deficit < 0.15 else 'd2'
    v = 'v1' if context.get('visibilityDrop') else 'v0'
    c = 'c1' if float(context['compGapPct']) >= 0.08 else 'c0'
    return f'{d}|{v}|{c}'


class ThompsonBandit:
    """Thompson sampling over Beta(alpha, beta) posteriors, one per (bucket, arm)."""

    model = 'thompson-v1'

    def __init__(self, state_path: str | Path = DEFAULT_STATE_PATH):
        self.state_path = Path(state_path)
        self.arms: dict[str, dict] = {}   # "bucket::armId" -> {alpha, beta, pulls}
        self.history: list[dict] = []     # update log (the mabwiser backend refits from it)
        self._load()

    # -- persistence -------------------------------------------------------

    def _load(self) -> None:
        if self.state_path.exists():
            raw = json.loads(self.state_path.read_text())
            self.arms = raw.get('arms', {})
            self.history = raw.get('history', [])
        else:
            self._save()

    def _save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(
            {'model': self.model, 'arms': self.arms, 'history': self.history}, indent=1))

    # -- posterior access --------------------------------------------------

    def _entry(self, bkt: str, aid: str) -> dict:
        key = f'{bkt}::{aid}'
        if key not in self.arms:
            self.arms[key] = {'alpha': 1.0, 'beta': 1.0, 'pulls': 0}
        return self.arms[key]

    @staticmethod
    def _mean(entry: dict) -> float:
        return entry['alpha'] / (entry['alpha'] + entry['beta'])

    # -- public interface ----------------------------------------------------

    def choose(self, context: dict, candidates: list[dict], seed: int | None = None) -> dict:
        bkt = bucket(context)
        base = str(seed) if seed is not None else '|'.join(arm_id(a) for a in candidates)
        best_arm, best_sample = candidates[0], -1.0
        means: list[float] = []
        for arm in candidates:
            aid = arm_id(arm)
            entry = self._entry(bkt, aid)
            means.append(self._mean(entry))
            # per-arm stream: reseeding per call keeps repeat calls reproducible
            rng = np.random.default_rng(fnv1a(f'{base}|{bkt}|{aid}'))
            sample = float(rng.beta(entry['alpha'], entry['beta']))
            if sample > best_sample:
                best_arm, best_sample = arm, sample
        chosen_mean = self._mean(self._entry(bkt, arm_id(best_arm)))
        explore = chosen_mean < max(means) - 1e-12
        return {
            'arm': dict(best_arm),
            'score': round(best_sample, 4),
            'explore': explore,
            'model': self.model,
        }

    def update(self, context: dict, arm: dict, reward: float) -> dict:
        bkt = bucket(context)
        aid = arm_id(arm)
        r = max(0.0, min(1.0, float(reward)))
        entry = self._entry(bkt, aid)
        entry['alpha'] += r
        entry['beta'] += 1.0 - r
        entry['pulls'] += 1
        self.history.append({
            'bucket': bkt, 'armId': aid, 'reward': r,
            'context': {k: context.get(k, 0) for k in CONTEXT_FIELDS},
        })
        self._save()
        return {
            'bucket': bkt, 'armId': aid,
            'alpha': round(entry['alpha'], 4), 'beta': round(entry['beta'], 4),
            'pulls': entry['pulls'], 'mean': round(self._mean(entry), 4),
        }

    def state_view(self) -> list[dict]:
        rows = []
        for key, entry in self.arms.items():
            bkt, aid = key.split('::', 1)
            rows.append({
                'bucket': bkt, 'armId': aid,
                'alpha': round(entry['alpha'], 4), 'beta': round(entry['beta'], 4),
                'pulls': entry['pulls'], 'mean': round(self._mean(entry), 4),
            })
        rows.sort(key=lambda r: (r['bucket'], r['armId']))
        return rows

    def reset(self) -> None:
        self.arms = {}
        self.history = []
        self._save()


class MabwiserBandit(ThompsonBandit):
    """LinUCB via MABWiser (doc 07 §1d pick), refit from the persisted update history.

    Shares the Thompson posteriors for persistence/state_view; LinUCB only steers choose()
    once at least one outcome exists (LinUCB cannot fit on zero rows -> Thompson cold-start).
    """

    model = 'mabwiser-linucb-v1'

    @staticmethod
    def _features(context: dict) -> list[float]:
        # leadTimeDays/pickup7d are on a ~0-30 scale vs the ~±0.3 pct features:
        # rescale so the LinUCB confidence bound isn't dominated by feature norm
        scale = {'leadTimeDays': 30.0, 'pickup7d': 10.0}
        return [float(context.get(k, 0)) / scale.get(k, 1.0) for k in CONTEXT_FIELDS]

    def choose(self, context: dict, candidates: list[dict], seed: int | None = None) -> dict:
        if not HAS_MABWISER or not self.history:
            choice = super().choose(context, candidates, seed)
            choice['model'] = self.model
            return choice
        cand_ids = {arm_id(a): a for a in candidates}
        arms = sorted(cand_ids.keys() | {h['armId'] for h in self.history})
        mab = MAB(arms=arms, learning_policy=LearningPolicy.LinUCB(alpha=1.0))
        mab.fit(
            decisions=[h['armId'] for h in self.history],
            rewards=[h['reward'] for h in self.history],
            contexts=[self._features(h['context']) for h in self.history],
        )
        exp = mab.predict_expectations([self._features(context)])
        if isinstance(exp, list):
            exp = exp[0]
        best_id = max(cand_ids, key=lambda aid: exp[aid])
        return {
            'arm': dict(cand_ids[best_id]),
            # UCB values are unbounded; clamp to the 0..1 reward scale the TS side expects
            'score': round(max(0.0, min(1.0, float(exp[best_id]))), 4),
            'explore': False,  # UCB exploration lives inside the bound, not a coin flip
            'model': self.model,
        }


def make_bandit(state_path: str | Path = DEFAULT_STATE_PATH,
                backend: str | None = None) -> ThompsonBandit:
    backend = backend if backend is not None else os.environ.get('BANDIT_BACKEND', 'thompson')
    if backend == 'mabwiser' and HAS_MABWISER:
        return MabwiserBandit(state_path)
    return ThompsonBandit(state_path)
