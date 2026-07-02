# Model registry (docs 12 §3): versioned models per task with champion/challenger roles.
# Challengers only take over via promote() after beating the champion on the primary
# metric in a backtest — no model influences live recommendations unvetted.
import json
from pathlib import Path

DEFAULT_REGISTRY_PATH = Path(__file__).resolve().parent / '.state' / 'registry.json'

# primary metric per task; mape: lower is better
PRIMARY_METRIC = {'forecast': 'mape', 'promo_policy': 'mape'}


class ModelRegistry:
    def __init__(self, path: str | Path = DEFAULT_REGISTRY_PATH):
        self.path = Path(path)
        self.next_id = 1
        self.models: list[dict] = []
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            raw = json.loads(self.path.read_text())
            self.next_id = raw.get('nextId', 1)
            self.models = raw.get('models', [])
        else:
            # day-1 champions: the rules-era baselines (doc 12 "rules bootstrap v1")
            self.register('forecast', 'pickup-baseline', 1, {}, {})
            self.register('promo_policy', 'thompson-v1', 1, {}, {})

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(
            {'nextId': self.next_id, 'models': self.models}, indent=1))

    def register(self, task: str, name: str, version: int,
                 params: dict, metrics: dict) -> dict:
        existing = next((m for m in self.models
                         if m['task'] == task and m['name'] == name), None)
        if existing:
            existing.update({'version': version, 'params': params, 'metrics': metrics})
            self._save()
            return existing
        entry = {
            'id': self.next_id,
            'task': task,
            'name': name,
            'version': version,
            'params': params,
            'metrics': metrics,
            'role': 'champion' if self.get_champion(task) is None else 'challenger',
        }
        self.next_id += 1
        self.models.append(entry)
        self._save()
        return entry

    def _by_role(self, task: str, role: str) -> dict | None:
        matches = [m for m in self.models if m['task'] == task and m['role'] == role]
        return max(matches, key=lambda m: m['id']) if matches else None

    def get_champion(self, task: str) -> dict | None:
        return self._by_role(task, 'champion')

    def get_challenger(self, task: str) -> dict | None:
        return self._by_role(task, 'challenger')

    def promote(self, task: str) -> bool:
        """Swap challenger -> champion when it beats the champion on the primary metric."""
        champion = self.get_champion(task)
        challenger = self.get_challenger(task)
        if champion is None or challenger is None:
            return False
        metric = PRIMARY_METRIC.get(task, 'mape')
        champ_val = champion.get('metrics', {}).get(metric)
        chall_val = challenger.get('metrics', {}).get(metric)
        if champ_val is None or chall_val is None or not chall_val < champ_val:
            return False
        champion['role'] = 'challenger'
        challenger['role'] = 'champion'
        self._save()
        return True

    def list_models(self, task: str | None = None) -> list[dict]:
        rows = [m for m in self.models if task is None or m['task'] == task]
        return sorted(rows, key=lambda m: m['id'])
