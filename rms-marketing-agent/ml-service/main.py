# RevPilot ML microservice (BUILD_PROMPT: "ML lives in a Python/FastAPI microservice the
# TS backend calls"). Runs with ZERO env vars: thompson bandit + pickup/statsforecast
# forecasting; TimeGPT and the mabwiser backend are opt-in (NIXTLA_API_KEY / BANDIT_BACKEND).
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import bandit as bandit_mod
import forecasting
from bandit import MabwiserBandit, make_bandit
from evaluation import backtest
from registry import ModelRegistry
from schemas import (
    BackendInfo, BacktestRequest, BacktestResponse, ChooseRequest, ChooseResponse,
    ForecastRequest, ForecastResponse, HealthResponse, StateArm, StateResponse,
    UpdateRequest,
)

STATE_DIR = Path(__file__).resolve().parent / '.state'

app = FastAPI(title='RevPilot ML')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'], allow_methods=['*'], allow_headers=['*'],
)

bandit = make_bandit(STATE_DIR / 'bandit.json')
registry = ModelRegistry(STATE_DIR / 'registry.json')


def reset_for_tests(tmpdir: str | Path) -> None:
    """Repoint bandit/registry state at a throwaway dir (tests only)."""
    global bandit, registry
    base = Path(tmpdir)
    bandit = make_bandit(base / 'bandit.json')
    registry = ModelRegistry(base / 'registry.json')


@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status='ok', backends=BackendInfo(
        bandit='mabwiser' if isinstance(bandit, MabwiserBandit) else 'thompson',
        mabwiser=bandit_mod.HAS_MABWISER,
        statsforecast=forecasting.HAS_STATSFORECAST,
        timegpt=forecasting.timegpt_ready(),
    ))


@app.post('/bandit/choose', response_model=ChooseResponse)
def bandit_choose(req: ChooseRequest) -> ChooseResponse:
    choice = bandit.choose(
        req.context.model_dump(),
        [a.model_dump() for a in req.candidates],
        req.seed,
    )
    return ChooseResponse(**choice)


@app.post('/bandit/update', response_model=StateArm)
def bandit_update(req: UpdateRequest) -> StateArm:
    row = bandit.update(req.context.model_dump(), req.arm.model_dump(), req.reward)
    return StateArm(**row)


@app.get('/bandit/state', response_model=StateResponse)
def bandit_state() -> StateResponse:
    return StateResponse(model=bandit.model,
                         arms=[StateArm(**r) for r in bandit.state_view()])


@app.post('/bandit/reset')
def bandit_reset() -> dict:
    bandit.reset()  # demo reset: wipes posteriors + history in the state file
    return {'status': 'reset'}


@app.post('/forecast', response_model=ForecastResponse)
def forecast_endpoint(req: ForecastRequest) -> ForecastResponse:
    model, points = forecasting.forecast(
        [p.model_dump() for p in req.series], req.horizon, req.useTimegpt)
    return ForecastResponse(model=model, points=points)


@app.post('/eval/backtest', response_model=BacktestResponse)
def eval_backtest(req: BacktestRequest) -> BacktestResponse:
    if len(req.series) < req.holdoutDays + 2:
        raise HTTPException(status_code=422,
                            detail='series must exceed holdoutDays by at least 2 points')
    result = backtest([p.model_dump() for p in req.series], req.holdoutDays, registry)
    return BacktestResponse(**result)


@app.get('/models')
def list_models(task: str | None = None) -> list[dict]:
    return registry.list_models(task)
