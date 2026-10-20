import pytest

from tradebot.broker.models import BUY, SELL
from tradebot.risk import RiskContext, RiskLimits, atr_stops, check, lot_for_risk


def test_lot_for_risk_eurusd(eurusd_spec):
    # 1% de 10.000 = 100 USD; SL de 15 pips = 150 USD por lote -> 0.66 lotes
    r = lot_for_risk(10_000, 1.0, 0.0015, eurusd_spec)
    assert r.volume == 0.66
    assert r.risk_money == pytest.approx(99.0)
    assert r.risk_money <= 100


def test_lot_rounds_down_never_over_risk(eurusd_spec):
    r = lot_for_risk(10_000, 0.5, 0.0013, eurusd_spec)  # 50 / 130 = 0.3846
    assert r.volume == 0.38
    assert r.risk_money <= 50


def test_lot_below_minimum_returns_zero(eurusd_spec):
    r = lot_for_risk(100, 0.5, 0.0050, eurusd_spec)  # 0.5 USD de riesgo, mínimo arriesga 5 USD
    assert r.volume == 0
    assert "mínimo" in r.reason


@pytest.mark.parametrize("bad", [(0, 1, 0.001), (1000, 0, 0.001), (1000, 1, 0)])
def test_lot_invalid_inputs(eurusd_spec, bad):
    assert lot_for_risk(*bad, eurusd_spec).volume == 0


def test_atr_stops_buy_and_sell(eurusd_spec):
    sl, tp = atr_stops(BUY, 1.10000, 0.0010, 1.5, 2.5, eurusd_spec)
    assert sl == pytest.approx(1.09850) and tp == pytest.approx(1.10250)
    sl, tp = atr_stops(SELL, 1.10000, 0.0010, 1.5, 2.5, eurusd_spec)
    assert sl == pytest.approx(1.10150) and tp == pytest.approx(1.09750)


def test_atr_stops_without_tp(eurusd_spec):
    _, tp = atr_stops(BUY, 1.1, 0.001, 1.5, 0, eurusd_spec)
    assert tp == 0


def test_atr_stops_respects_broker_minimum(eurusd_spec):
    eurusd_spec.stops_level = 100  # 100 puntos + 10 de spread = 0.0011
    sl, _ = atr_stops(BUY, 1.10000, 0.0001, 1.0, 1.0, eurusd_spec)
    assert 1.10000 - sl == pytest.approx(0.0011)


def test_guard_daily_loss():
    ok, reason = check(RiskLimits(max_daily_loss_pct=3), RiskContext(equity=9_690, day_start_equity=10_000), "X")
    assert not ok and "pérdida diaria" in reason


def test_guard_limits():
    limits = RiskLimits(max_open_positions=2, max_trades_per_day=3, max_spread_points=20)
    base = dict(equity=10_000, day_start_equity=10_000)
    assert check(limits, RiskContext(**base), "A") == (True, "")
    assert not check(limits, RiskContext(**base, open_symbols=["A", "B"]), "C")[0]
    assert not check(limits, RiskContext(**base, open_symbols=["A"]), "A")[0]
    assert not check(limits, RiskContext(**base, trades_today=3), "A")[0]
    assert not check(limits, RiskContext(**base, spread_points=25), "A")[0]


def test_min_sl_distance_widens_sl_and_tp_proportionally(eurusd_spec):
    # ATR diminuto (madrugada): 1.5 ATR = 3 pips, pero el mínimo es 5 pips -> TP escala igual
    sl, tp = atr_stops(BUY, 1.10000, 0.0002, 1.5, 2.5, eurusd_spec, min_sl_distance=0.0005)
    assert 1.10000 - sl == pytest.approx(0.0005)
    assert tp - 1.10000 == pytest.approx(0.0005 * 2.5 / 1.5, abs=1e-5)


def test_planner_applies_min_sl_from_spread(eurusd_spec):
    from tradebot.planner import StrategyParams, build_plan
    from tradebot.strategies.base_strategy import SignalType, TradingSignal

    signal = TradingSignal(signal=SignalType.BUY, confidence=80, indicators={}, reasons=[])
    params = StrategyParams(strategy="macd", min_sl_spread_mult=5)
    plan, _ = build_plan(signal, 0.0001, eurusd_spec, 10_000, 1.1, params, 1.0, spread_points=20)
    assert 1.1 - plan.sl == pytest.approx(5 * 20 * 0.00001)  # 10 pips, no 1.5 pips
    assert plan.volume == 1.0  # 100 USD / (10 pips * 10 USD/pip)
