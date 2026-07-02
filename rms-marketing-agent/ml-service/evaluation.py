# Eval harness (docs 08 + 12 §3): backtest on a holdout, score mape/bias plus the
# "confidently wrong" metric (docs 08 — NIST framing: high stated confidence, big miss),
# then run champion/challenger through the registry.
import math

from forecasting import (
    HAS_STATSFORECAST, MIN_STATS_POINTS, PICKUP_MODEL,
    pickup_baseline, statsforecast_forecast,
)
from registry import ModelRegistry


def mape(actual: list[float], pred: list[float]) -> float | None:
    errs = [abs(a - p) / abs(a) for a, p in zip(actual, pred) if a != 0]
    return round(sum(errs) / len(errs), 4) if errs else None


def bias(actual: list[float], pred: list[float]) -> float | None:
    if not actual:
        return None
    return round(sum(p - a for a, p in zip(actual, pred)) / len(actual), 4)


def confidently_wrong(preds: list[dict], actuals: list[float],
                      err_threshold: float = 0.25) -> float:
    """Fraction of points where confidence >= 0.7 AND relative error > err_threshold."""
    if not preds:
        return 0.0
    hits = 0
    for p, a in zip(preds, actuals):
        rel = abs(p['yhat'] - a) / abs(a) if a != 0 else (math.inf if p['yhat'] != 0 else 0.0)
        if p['confidence'] >= 0.7 and rel > err_threshold:
            hits += 1
    return round(hits / len(preds), 4)


def _score(points: list[dict], actual: list[float], confidence: float) -> dict:
    pred = [p['yhat'] for p in points]
    return {
        'mape': mape(actual, pred),
        'bias': bias(actual, pred),
        'confidentlyWrong': confidently_wrong(
            [{'yhat': y, 'confidence': confidence} for y in pred], actual),
    }


def backtest(series: list[dict], holdout_days: int, registry: ModelRegistry) -> dict:
    """Train on the head, score on the tail, register both models, auto-promote the winner."""
    head, tail = series[:-holdout_days], series[-holdout_days:]
    actual = [float(p['y']) for p in tail]

    # documented heuristic: statistical model states 0.8 confidence, pickup arithmetic 0.6
    results: dict[str, dict] = {
        PICKUP_MODEL: _score(pickup_baseline(head, holdout_days), actual, confidence=0.6),
    }
    if HAS_STATSFORECAST and len(head) >= MIN_STATS_POINTS:
        name, points = statsforecast_forecast(head, holdout_days)
        if name != PICKUP_MODEL:  # statsforecast_forecast's last-resort fallback is pickup
            results[name] = _score(points, actual, confidence=0.8)

    for name, metrics in results.items():
        existing = next((m for m in registry.list_models('forecast') if m['name'] == name), None)
        version = existing['version'] + 1 if existing else 1
        registry.register('forecast', name, version, {'holdoutDays': holdout_days}, metrics)

    promoted = registry.promote('forecast')
    champion = registry.get_champion('forecast')
    challenger = registry.get_challenger('forecast')
    return {
        'champion': champion['name'] if champion else PICKUP_MODEL,
        'challenger': challenger['name'] if challenger else None,
        'promoted': promoted,
        'holdoutDays': holdout_days,
        'metrics': results,
    }
