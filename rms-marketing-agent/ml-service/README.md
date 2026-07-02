# RevPilot ML microservice

Python/FastAPI service for the learning loop (docs 07 §1b/1d, 12 §3): a contextual
bandit choosing promo type + depth, forecasting (pickup → statsforecast → TimeGPT
cold-start), and a model registry + eval harness (backtest, champion/challenger,
"confidently wrong").

## Run

```bash
cd rms-marketing-agent/ml-service
python3 -m uvicorn main:app --port 8787
```

Works with **zero env vars set** — thompson bandit + pickup/statsforecast forecasting.
State persists as JSON under `ml-service/.state/` (auto-created).

## Endpoints

| Method | Path             | Purpose |
|--------|------------------|---------|
| GET    | `/health`        | `{status, backends: {bandit, mabwiser, statsforecast, timegpt}}` |
| POST   | `/bandit/choose` | `{context, candidates, seed?}` → `{arm, score, explore, model}` |
| POST   | `/bandit/update` | `{context, arm, reward}` → updated posterior row |
| GET    | `/bandit/state`  | All Beta posteriors per (context bucket, arm), with means |
| POST   | `/bandit/reset`  | Clear the bandit state file (used by the demo reset) |
| POST   | `/forecast`      | `{series, horizon, useTimegpt?}` → `{model, points}` |
| POST   | `/eval/backtest` | `{series, holdoutDays}` → champion/challenger + per-model mape/bias/confidentlyWrong |
| GET    | `/models?task=`  | Registry entries (tasks: `forecast`, `promo_policy`) |

JSON field names are camelCase and mirror `mvp/src/types.ts` (`BanditContext`,
`BanditArm`, `BanditChoice`) — no mapping layer on the TS side.

## Env flags

| Var | Effect |
|-----|--------|
| `NIXTLA_API_KEY` | Enables TimeGPT zero-shot cold-start (`useTimegpt: true` + history < 28 points) |
| `BANDIT_BACKEND` | `mabwiser` → LinUCB via MABWiser (falls back to thompson if lib absent); default `thompson` |

## TS fallback

The dashboard works **without** this service: the TS backend runs an in-process
Thompson bandit with the same arm catalog, context buckets, and Beta-posterior math
(`ML_SERVICE_URL` unreachable → fallback). When this service is up, it takes over
`choose`/`update` and adds statsforecast/TimeGPT forecasting plus the registry/backtest
endpoints.

## Tests

```bash
cd rms-marketing-agent/ml-service
python3 -m pytest tests/ -q
```
