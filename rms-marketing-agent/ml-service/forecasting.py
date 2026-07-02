# Forecast backend ladder (docs 07 §1b + 12 §3): pickup arithmetic first, statsforecast
# once history accrues, TimeGPT only as the zero-shot COLD-START (short history + API key).
# Every backend is import-guarded so the service runs on the pickup baseline with zero deps/env.
import importlib.util
import os
from datetime import date, timedelta

PICKUP_MODEL = 'pickup-baseline'
MIN_STATS_POINTS = 28  # doc-12 cold-start policy: graduate to statsforecast at ~4 weeks

HAS_STATSFORECAST = importlib.util.find_spec('statsforecast') is not None
HAS_NIXTLA = importlib.util.find_spec('nixtla') is not None


def timegpt_ready() -> bool:
    return HAS_NIXTLA and bool(os.environ.get('NIXTLA_API_KEY'))


def _future_dates(last_ds: str, horizon: int) -> list[str]:
    start = date.fromisoformat(last_ds)
    return [(start + timedelta(days=h)).isoformat() for h in range(1, horizon + 1)]


def pickup_baseline(series: list[dict], horizon: int) -> list[dict]:
    """Avg daily delta over the last up-to-14 points, projected from the last value (floor 0)."""
    tail = series[-14:]
    if len(tail) >= 2:
        delta = (tail[-1]['y'] - tail[0]['y']) / (len(tail) - 1)
    else:
        delta = 0.0
    last_y = float(series[-1]['y'])
    return [
        {'ds': ds, 'yhat': round(max(0.0, last_y + delta * (h + 1)), 4)}
        for h, ds in enumerate(_future_dates(series[-1]['ds'], horizon))
    ]


def statsforecast_forecast(series: list[dict], horizon: int) -> tuple[str, list[dict]]:
    """AutoETS(season_length=7) with Naive fallback; final fallback = pickup baseline."""
    import pandas as pd
    from statsforecast import StatsForecast
    from statsforecast.models import AutoETS, Naive

    df = pd.DataFrame({
        'unique_id': ['s'] * len(series),
        'ds': pd.to_datetime([p['ds'] for p in series]),
        'y': [float(p['y']) for p in series],
    })
    for model, name in ((AutoETS(season_length=7), 'statsforecast-autoets'),
                        (Naive(), 'statsforecast-naive')):
        try:
            fc = StatsForecast(models=[model], freq='D').forecast(df=df, h=horizon)
            col = [c for c in fc.columns if c not in ('unique_id', 'ds')][0]
            points = [
                {'ds': ds.strftime('%Y-%m-%d'), 'yhat': round(max(0.0, float(v)), 4)}
                for ds, v in zip(fc['ds'], fc[col])
            ]
            return name, points
        except Exception:
            continue
    return PICKUP_MODEL, pickup_baseline(series, horizon)


def timegpt(series: list[dict], horizon: int) -> list[dict]:
    """Nixtla TimeGPT zero-shot. Only reachable via select_backend when the key is set."""
    api_key = os.environ.get('NIXTLA_API_KEY')
    if not api_key:
        raise RuntimeError('NIXTLA_API_KEY not set')
    import pandas as pd
    from nixtla import NixtlaClient

    client = NixtlaClient(api_key=api_key)
    df = pd.DataFrame({
        'ds': pd.to_datetime([p['ds'] for p in series]),
        'y': [float(p['y']) for p in series],
    })
    fc = client.forecast(df=df, h=horizon, freq='D', time_col='ds', target_col='y')
    return [
        {'ds': pd.Timestamp(ds).strftime('%Y-%m-%d'), 'yhat': round(max(0.0, float(v)), 4)}
        for ds, v in zip(fc['ds'], fc['TimeGPT'])
    ]


def select_backend(n_points: int, use_timegpt_flag: bool) -> str:
    if use_timegpt_flag and timegpt_ready() and n_points < MIN_STATS_POINTS:
        return 'timegpt'  # zero-shot cold-start only — long history goes statistical (doc 12)
    if n_points >= MIN_STATS_POINTS and HAS_STATSFORECAST:
        return 'statsforecast'
    return 'pickup'


def forecast(series: list[dict], horizon: int, use_timegpt: bool = False) -> tuple[str, list[dict]]:
    backend = select_backend(len(series), use_timegpt)
    if backend == 'timegpt':
        try:
            return 'timegpt', timegpt(series, horizon)
        except Exception:
            return PICKUP_MODEL, pickup_baseline(series, horizon)
    if backend == 'statsforecast':
        return statsforecast_forecast(series, horizon)
    return PICKUP_MODEL, pickup_baseline(series, horizon)
