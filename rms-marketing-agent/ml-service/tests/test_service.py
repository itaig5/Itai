from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import main

CONTEXT = {
    'occupancyDeviation': -0.12,
    'paceVsStlyPct': -0.18,   # deficit 0.18 -> d2
    'compGapPct': 0.10,       # >= 0.08 -> c1
    'leadTimeDays': 21,
    'pickup7d': 2,
    'visibilityDrop': 1,      # -> v1
}
ARM_LM_10 = {'type': 'last_minute', 'depthPct': 0.10}
ARM_WK_15 = {'type': 'weekly_los', 'depthPct': 0.15}


@pytest.fixture()
def client(tmp_path):
    main.reset_for_tests(tmp_path)
    return TestClient(main.app)


def series(values, start='2026-01-01'):
    d0 = date.fromisoformat(start)
    return [{'ds': (d0 + timedelta(days=i)).isoformat(), 'y': float(v)}
            for i, v in enumerate(values)]


def test_health(client):
    res = client.get('/health')
    assert res.status_code == 200
    body = res.json()
    assert body['status'] == 'ok'
    backends = body['backends']
    assert backends['bandit'] in ('thompson', 'mabwiser')
    assert set(backends) == {'bandit', 'mabwiser', 'statsforecast', 'timegpt'}
    assert backends['timegpt'] is False  # no NIXTLA_API_KEY in the test env


def test_choose_deterministic_with_seed(client):
    req = {'context': CONTEXT, 'candidates': [ARM_LM_10, ARM_WK_15], 'seed': 42}
    first = client.post('/bandit/choose', json=req).json()
    second = client.post('/bandit/choose', json=req).json()
    assert first == second
    assert first['model'] in ('thompson-v1', 'mabwiser-linucb-v1')
    assert 0.0 <= first['score'] <= 1.0


def test_choose_returns_only_candidate_arms(client):
    candidates = [ARM_LM_10, ARM_WK_15]
    for seed in range(10):
        res = client.post('/bandit/choose', json={
            'context': CONTEXT, 'candidates': candidates, 'seed': seed})
        assert res.status_code == 200
        assert res.json()['arm'] in candidates


def test_update_then_state_shows_posterior_moved(client):
    res = client.post('/bandit/update', json={
        'context': CONTEXT, 'arm': ARM_LM_10, 'reward': 1.0})
    assert res.status_code == 200
    row = res.json()
    assert row['bucket'] == 'd2|v1|c1'
    assert row['armId'] == 'last_minute@0.10'

    state = client.get('/bandit/state').json()
    match = [a for a in state['arms']
             if a['bucket'] == 'd2|v1|c1' and a['armId'] == 'last_minute@0.10']
    assert len(match) == 1
    assert match[0]['alpha'] == 2.0  # 1 + reward
    assert match[0]['beta'] == 1.0
    assert match[0]['pulls'] == 1
    assert match[0]['mean'] == pytest.approx(2 / 3, abs=1e-3)


def test_forecast_pickup_exact_values(client):
    res = client.post('/forecast', json={
        'series': series([10, 12, 14]), 'horizon': 2})
    body = res.json()
    assert body['model'] == 'pickup-baseline'  # 3 points < 28 and no TimeGPT key
    assert body['points'] == [
        {'ds': '2026-01-04', 'yhat': 16.0},
        {'ds': '2026-01-05', 'yhat': 18.0},
    ]

    # declining series floors at 0
    res = client.post('/forecast', json={'series': series([5, 3, 1]), 'horizon': 2})
    assert [p['yhat'] for p in res.json()['points']] == [0.0, 0.0]


def test_backtest_scores_both_models_and_registers_them(client):
    # 42 points with weekly seasonality + trend: head of 35 >= 28 -> statsforecast runs
    values = [20 + 0.5 * i + 3 * (i % 7 == 5) for i in range(42)]
    res = client.post('/eval/backtest', json={'series': series(values), 'holdoutDays': 7})
    assert res.status_code == 200
    body = res.json()
    names = set(body['metrics'])
    assert 'pickup-baseline' in names
    assert any(n.startswith('statsforecast') for n in names)
    for m in body['metrics'].values():
        assert m['mape'] is not None and m['mape'] >= 0
        assert 0.0 <= m['confidentlyWrong'] <= 1.0
    assert body['champion'] in names
    assert body['holdoutDays'] == 7

    registered = {m['name'] for m in client.get('/models', params={'task': 'forecast'}).json()}
    assert names <= registered
    roles = {m['name']: m['role'] for m in client.get('/models').json()}
    assert roles['thompson-v1'] == 'champion'  # seeded promo_policy champion untouched


def test_reset_clears_bandit_state(client):
    client.post('/bandit/update', json={
        'context': CONTEXT, 'arm': ARM_WK_15, 'reward': 0.5})
    assert client.get('/bandit/state').json()['arms'] != []
    assert client.post('/bandit/reset').status_code == 200
    assert client.get('/bandit/state').json()['arms'] == []
