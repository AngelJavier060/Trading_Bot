"""Ruptura del rango asiático: 1 disparo por día y SL del propio rango."""

import pandas as pd

from tradebot.backtest.engine import BacktestEngine
from tradebot.backtest.models import BacktestConfig
from tradebot.planner import StrategyParams, build_plan
from tradebot.strategies import get_strategy
from tradebot.strategies.base_strategy import SignalType
from tradebot.strategies.catalog import CATALOG


def _m5_asian(weekdays: int = 18, breakout_from: int = 15) -> pd.DataFrame:
    times, o, h, l, c, spr = [], [], [], [], [], []
    start = pd.Timestamp("2024-01-08 00:00", tz="UTC")
    wd = 0
    for d in range(40):
        day = start + pd.Timedelta(days=d)
        if day.weekday() >= 5:
            continue
        wd += 1
        if wd > weekdays:
            break
        for b in range(288):
            ts = day + pd.Timedelta(minutes=5 * b)
            hour = ts.hour
            if hour < 9:
                oo, hh, ll, cc = 1.1000, 1.1008, 1.0992, 1.1000
            elif wd >= breakout_from and b == 10 * 12:
                oo, hh, ll, cc = 1.1008, 1.1038, 1.1006, 1.1032
            elif hour < 15:
                oo, hh, ll, cc = 1.1002, 1.1006, 1.0994, 1.1002
            else:
                oo, hh, ll, cc = 1.1020, 1.1080, 1.0940, 1.1020
            times.append(ts)
            o.append(oo); h.append(hh); l.append(ll); c.append(cc); spr.append(10)
    return pd.DataFrame({"time": times, "open": o, "high": h, "low": l, "close": c,
                         "tick_volume": 100, "spread": spr})


def test_catalog_and_defaults():
    assert "asian_range_breakout" in CATALOG
    s = get_strategy("asian_range_breakout")
    assert s.params["range_end"] == 9
    assert s.params["rr"] == 1.5


def test_breakout_emits_buy_after_asia(eurusd_spec):
    df = _m5_asian()
    cfg = BacktestConfig(
        symbol=eurusd_spec.name,
        params=StrategyParams(strategy="asian_range_breakout", timeframe="M5", min_confidence=0),
        initial_balance=10_000,
    )
    result = BacktestEngine(cfg, eurusd_spec).run(df)
    assert result.metrics["total_trades"] >= 1
    assert result.metrics["longs"] >= 1
    sides_by_day = {}
    for t in result.trades:
        day = t.entry_time[:10]
        sides_by_day.setdefault(day, []).append(t.side)
    assert all(len(v) == 1 for v in sides_by_day.values())
    last = result.trades[-1]
    assert last.sl < last.entry_price


def test_plan_uses_range_stops(eurusd_spec):
    from tradebot.strategies.base_strategy import SignalReason, TradingSignal
    sig = TradingSignal(
        signal=SignalType.BUY, confidence=70,
        indicators={"entry_price": 1.10100, "sl": 1.09920, "tp": 1.10370},
        reasons=[SignalReason("rango", "ruptura", 1.101, 1.0992, True, 1)],
        strategy_name="asian_range_breakout",
    )
    params = StrategyParams(strategy="asian_range_breakout", timeframe="M5")
    plan, reason = build_plan(sig, 0.0, eurusd_spec, 10_000, 1.10, params, 0.5, eurusd_spec.name)
    assert plan, reason
    assert plan.sl == 1.09920
    assert plan.entry == 1.10100
