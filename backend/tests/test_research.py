from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from conftest import frame
from tradebot.backtest import BacktestConfig, BacktestEngine
from tradebot.live import BotConfig
from tradebot.live.engine import SymbolState
from tradebot.planner import StrategyParams
from tradebot.research.evaluation import Criteria, bootstrap_r, verdict
from tradebot.research.experiments import record_walkforward
from tradebot.research.reconcile import reconcile
from tradebot.research.walkforward import make_folds, parse_grid, run_walkforward
from tradebot.risk import RiskLimits

UTC = timezone.utc


def test_make_folds():
    folds = make_folds(datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 12, 31, tzinfo=UTC), 180, 60)
    assert len(folds) == 3
    assert folds[0].train_end == folds[0].train_start + pd.Timedelta(days=180)
    assert all(a.test_end == b.train_end for a, b in zip(folds, folds[1:]))  # ventanas de prueba contiguas
    anchored = make_folds(datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 12, 31, tzinfo=UTC), 180, 60, anchored=True)
    assert all(f.train_start == anchored[0].train_start for f in anchored)
    with pytest.raises(ValueError):
        make_folds(datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 2, 1, tzinfo=UTC), 180, 60)


def test_parse_grid():
    assert parse_grid("sl_atr_mult=1,1.5;max_bars_in_trade=0,8") == {"sl_atr_mult": [1, 1.5], "max_bars_in_trade": [0, 8]}


def test_bootstrap():
    assert bootstrap_r([1.0, 0.5, 2.0, 0.2])["prob_edge"] == 1.0
    b = bootstrap_r([-1, 1.5, -1, 1.5, -1, -1, 1.5, -1])
    assert 0 < b["prob_edge"] < 1 and b["ci95_low"] < b["mean_r"] < b["ci95_high"]


def test_verdict():
    good = {"total_trades": 80, "profit_factor": 1.4, "avg_r": 0.2, "max_drawdown_pct": 8, "bootstrap": {"prob_edge": 0.95}}
    base = {"total_trades": 90, "profit_factor": 1.1, "avg_r": 0.05, "max_drawdown_pct": 9}
    assert verdict(good, base)["passed"]
    worse_dd = {**good, "max_drawdown_pct": 20}
    v = verdict(worse_dd, base)
    assert not v["passed"] and any(c["check"] == "drawdown controlado" and not c["passed"] for c in v["checks"])
    few = {**good, "total_trades": 5}
    assert not verdict(few, base, Criteria(min_trades=30))["passed"]


def trending(n=3000, seed=11):
    rng = np.random.default_rng(seed)
    closes = 1.10 + np.cumsum(rng.normal(0.00005, 0.0008, n))
    return frame(list(closes), start="2025-01-01", freq="1h")


def test_walkforward_fixed_matches_backtest_on_test_windows(eurusd_spec):
    df = trending()
    base = BacktestConfig(symbol="EURUSD-T", params=StrategyParams(strategy="macd", timeframe="H1"),
                          limits=RiskLimits(max_trades_per_day=100, max_daily_loss_pct=100))
    folds = make_folds(df["time"].iloc[0].to_pydatetime(), df["time"].iloc[-1].to_pydatetime(), 40, 20)
    res = run_walkforward(df, eurusd_spec, base, folds, mode="fixed")
    assert res.candidate["total_trades"] == res.baseline["total_trades"] > 0
    # cada operación cae dentro de alguna ventana de prueba
    starts = [pd.Timestamp(f["train_end"]) for f in res.folds]
    assert all(pd.Timestamp(t.entry_time) >= starts[0] for t in res.candidate_trades)


def test_walkforward_optimize_picks_from_grid(eurusd_spec):
    df = trending()
    base = BacktestConfig(symbol="EURUSD-T", params=StrategyParams(strategy="macd", timeframe="H1"),
                          limits=RiskLimits(max_trades_per_day=100, max_daily_loss_pct=100))
    folds = make_folds(df["time"].iloc[0].to_pydatetime(), df["time"].iloc[-1].to_pydatetime(), 40, 20)
    res = run_walkforward(df, eurusd_spec, base, folds, mode="optimize",
                          grid={"tp_atr_mult": [1.0, 4.0]}, min_trades_train=3)
    assert all(f["chosen"].get("tp_atr_mult") in (1.0, 4.0) for f in res.folds if f["chosen"])


def test_walkforward_ml_runs_and_records(eurusd_spec, system):
    df = trending(4000)
    base = BacktestConfig(symbol="EURUSD-T", params=StrategyParams(strategy="ema_rsi", timeframe="H1"),
                          limits=RiskLimits(max_trades_per_day=100, max_daily_loss_pct=100))
    folds = make_folds(df["time"].iloc[0].to_pydatetime(), df["time"].iloc[-1].to_pydatetime(), 80, 40)
    res = run_walkforward(df, eurusd_spec, base, folds, mode="ml", ml_threshold=0.5)
    trained = [f for f in res.folds if "train_samples" in f and "skipped" not in f]
    assert trained and all(f["train_samples"] >= 100 for f in trained)
    assert res.candidate["total_trades"] <= res.baseline["total_trades"]
    exp_id, v = record_walkforward(system.store, "test ml", {"mode": "ml"}, res, ("a", "b"))
    exp = system.store.experiment(exp_id)
    assert exp["kind"] == "walkforward_ml" and exp["verdict"]["checks"]
    assert exp["status"] in ("candidate", "rejected")


def test_reconcile_live_signals_match_backtest(system):
    """El bot en vivo (dry run) y el backtest deben ver la misma señal en la misma vela."""
    config = BotConfig(symbols=["EURUSD"], params=StrategyParams(strategy="macd", timeframe="M15"), dry_run=True)
    bot = system.bot
    bot._preflight(config)
    bot.config = config
    bot._strategies = {"EURUSD": config.params.build_strategy()}
    bot._symbols = {"EURUSD": SymbolState()}
    bot._load_day_state()
    # recorrer las últimas velas como si el bot hubiera estado vivo
    fake = system.ctx.client.api
    full = fake.rates["EURUSD-T"]
    for end in range(len(full) - 120, len(full) + 1):
        fake.rates["EURUSD-T"] = full[:end]
        bot.run_once()
    fake.rates["EURUSD-T"] = full
    assert system.store.signals(), "el escenario debería generar alguna señal"
    t0 = datetime.fromtimestamp(int(full["time"][0]), tz=UTC)
    t1 = datetime.fromtimestamp(int(full["time"][-1]) + 900, tz=UTC)
    report = reconcile(system.ctx, system.store, config, t0, t1)
    sig = report["symbols"]["EURUSD-T"]["signals"]
    assert sig["live"] > 0 and sig["agreement_pct"] == 100.0, sig["mismatches"]
