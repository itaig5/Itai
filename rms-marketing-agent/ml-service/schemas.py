# Pydantic v2 request/response models. Field names are camelCase on purpose:
# they mirror mvp/src/types.ts (BanditContext/BanditArm/BanditChoice) so the TS
# backend and this service exchange JSON with zero mapping.
from typing import Literal

from pydantic import BaseModel, Field

MoveType = Literal[
    'last_minute', 'weekly_los', 'basic_deal', 'early_booker',
    'remove_discounts', 'new_listing', 'none',
]


class BanditContext(BaseModel):
    occupancyDeviation: float
    paceVsStlyPct: float
    compGapPct: float
    leadTimeDays: float
    pickup7d: float
    visibilityDrop: Literal[0, 1] = 0


class BanditArm(BaseModel):
    type: MoveType
    depthPct: float


class ChooseRequest(BaseModel):
    context: BanditContext
    candidates: list[BanditArm] = Field(min_length=1)
    seed: int | None = None


class ChooseResponse(BaseModel):
    arm: BanditArm
    score: float
    explore: bool
    model: str


class UpdateRequest(BaseModel):
    context: BanditContext
    arm: BanditArm
    reward: float


class StateArm(BaseModel):
    bucket: str
    armId: str
    alpha: float
    beta: float
    pulls: int
    mean: float


class StateResponse(BaseModel):
    model: str
    arms: list[StateArm]


class SeriesPoint(BaseModel):
    ds: str  # ISO date YYYY-MM-DD
    y: float


class ForecastRequest(BaseModel):
    series: list[SeriesPoint] = Field(min_length=1)
    horizon: int = Field(ge=1, le=365)
    useTimegpt: bool = False


class ForecastPoint(BaseModel):
    ds: str
    yhat: float


class ForecastResponse(BaseModel):
    model: str
    points: list[ForecastPoint]


class BacktestRequest(BaseModel):
    series: list[SeriesPoint] = Field(min_length=3)
    holdoutDays: int = Field(ge=1)


class BacktestMetrics(BaseModel):
    mape: float | None = None
    bias: float | None = None
    confidentlyWrong: float | None = None


class BacktestResponse(BaseModel):
    champion: str
    challenger: str | None = None
    promoted: bool = False
    holdoutDays: int
    # model name -> held-out metrics (docs 12 §3: champion/challenger eval)
    metrics: dict[str, BacktestMetrics]


class BackendInfo(BaseModel):
    bandit: str  # 'thompson' | 'mabwiser'
    mabwiser: bool
    statsforecast: bool
    timegpt: bool


class HealthResponse(BaseModel):
    status: str
    backends: BackendInfo
