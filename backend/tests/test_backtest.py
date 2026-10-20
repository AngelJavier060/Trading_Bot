import numpy as np
import pandas as pd
import pytest

from conftest import frame
from tradebot.backtest import BacktestConfig, BacktestEngine, resample
from tradebot.planner import StrategyParams
from tradebot.risk import RiskLimits
from tradebot.strategies import AVAILABLE_STRATEGIES
from tradebot.strategies.base_strategy import BaseStrategy, SignalType, TradingSignal


class AlwaysSignal(BaseStrategy):
    """Estrategia de prueba: emite siempre la misma señal y guarda la última vela vista."""

    name = "always"
    min_candles = 20
    seen: list = []

    def default_params(self):
        return {"side": "buy"}

    def analyze(self, candles, candles_htf=None, *, asset=""):
        AlwaysSignal.seen.append(candles[-1]["time"])
        sig = SignalType.BUY if self.params["side"] == "buy" else SignalType.SELL
        return TradingSignal(signal=sig, confidence=80, indicators={}, reasons=[], strategy_name=self.name)


@pytest.fixture(autouse=True)
def register_test_strategy(monkeypatch):
    monkeypatch.setitem(AVAILABLE_STRATEGIES, "always", AlwaysSignal)
    AlwaysSignal.seen = []


def flat(n=60, price=1.1000, wick=0.0005):
    """Velas planas: ATR = 2*wick = 0.0010."""
    return frame([price] * n, wick=wick)


def run(df, spec, side="buy", risk=1.0, tp=2.5, sl=1.5, max_bars=0, limits=None, **kw):
    cfg = BacktestConfig(
        symbol="EURUSD-T",
        params=StrategyParams(strategy="always", strategy_params={"side": side}, timeframe="M15",
                              sl_atr_mult=sl, tp_atr_mult=tp, max_bars_in_trade=max_bars),
        limits=limits or RiskLimits(risk_per_trade_pct=risk, max_trades_per_day=100, max_daily_loss_pct=100),
        initial_balance=10_000,
        **kw,
    )
    return BacktestEngine(cfg, spec).run(df)


def test_take_profit_hit(eurusd_spec):
    df = flat()
    df.loc[22, "high"] = 1.1030
    res = run(df, eurusd_spec)
    t = res.trades[0]
    # entrada al ask: 1.1000 + 10 pts de spread
    assert t.entry_price == pytest.approx(1.1001)
    assert t.sl == pytest.approx(1.0986) and t.tp == pytest.approx(1.1026)
    assert t.exit_reason == "tp" and t.exit_price == pytest.approx(1.1026)
    assert t.volume == 0.66
    assert t.net_profit == pytest.approx(0.0025 * 0.66 * 100_000, abs=0.01)
    assert t.r_multiple > 1.6


def test_stop_loss_hit(eurusd_spec):
    df = flat()
    df.loc[23, "low"] = 1.0980
    t = run(df, eurusd_spec).trades[0]
    assert t.exit_reason == "sl" and t.exit_price == pytest.approx(1.0986)
    assert t.net_profit == pytest.approx(-99.0, abs=0.01)
    assert t.r_multiple == pytest.approx(-1.0, abs=0.01)


def test_sl_and_tp_in_same_bar_counts_as_loss(eurusd_spec):
    df = flat()
    df.loc[22, ["high", "low"]] = [1.1030, 1.0980]
    assert run(df, eurusd_spec).trades[0].exit_reason == "sl"


def test_gap_through_stop_exits_at_open(eurusd_spec):
    df = flat()
    df.loc[22, ["open", "high", "low", "close"]] = [1.0970, 1.0975, 1.0965, 1.0970]
    t = run(df, eurusd_spec).trades[0]
    assert t.exit_reason == "sl" and t.exit_price == pytest.approx(1.0970)
    assert t.r_multiple < -1.0  # el gap cuesta más que 1R


def test_sell_stops_use_ask(eurusd_spec):
    df = flat()
    # SL de la venta = 1.1000 + 0.0015 = 1.1015. El bid llega a 1.1014: el ASK (1.1015) lo toca.
    df.loc[22, "high"] = 1.1014
    t = run(df, eurusd_spec, side="sell").trades[0]
    assert t.entry_price == pytest.approx(1.1000)
    assert t.exit_reason == "sl" and t.exit_price == pytest.approx(1.1015)


def test_time_exit(eurusd_spec):
    t = run(flat(), eurusd_spec, max_bars=3).trades[0]
    assert t.exit_reason == "time" and t.bars_held == 3
    # sale al bid de la apertura: pierde exactamente el spread
    assert t.net_profit == pytest.approx(-0.0001 * 0.66 * 100_000, abs=0.01)


def test_open_position_closed_at_end(eurusd_spec):
    res = run(flat(30), eurusd_spec)
    assert res.trades[-1].exit_reason == "end"


def test_signal_uses_only_closed_candles(eurusd_spec):
    df = flat()
    res = run(df, eurusd_spec, max_bars=2)
    entry_ts = pd.Timestamp(res.trades[0].entry_time).timestamp()
    # la estrategia vio como última vela la anterior a la de entrada
    assert AlwaysSignal.seen[0] == entry_ts - 15 * 60


def test_commission_and_balance_consistency(eurusd_spec):
    res = run(flat(), eurusd_spec, max_bars=2, commission_per_lot=3.5)
    assert all(t.commission == pytest.approx(t.volume * 7) for t in res.trades)
    assert res.metrics["final_balance"] == pytest.approx(10_000 + sum(t.net_profit for t in res.trades), abs=0.05)
    assert res.trades[-1].balance_after == pytest.approx(res.metrics["final_balance"], abs=0.05)


def test_max_trades_per_day(eurusd_spec):
    limits = RiskLimits(risk_per_trade_pct=1, max_trades_per_day=2, max_daily_loss_pct=100)
    res = run(flat(90), eurusd_spec, max_bars=1, limits=limits)  # 90 velas de 15m = un solo día
    assert len(res.trades) == 2
    assert res.blocked.get("máximo de operaciones", 0) > 0


def test_daily_loss_limit_stops_trading(eurusd_spec):
    # Precio que cae sin parar: cada compra pierde 1% -> con límite 3% no hay más de 3 pérdidas en el día
    closes = 1.1000 - np.arange(90) * 0.0006
    df = frame(closes, wick=0.0005)
    limits = RiskLimits(risk_per_trade_pct=1, max_trades_per_day=100, max_daily_loss_pct=3)
    res = run(df, eurusd_spec, limits=limits)
    assert len(res.trades) <= 4
    assert res.blocked.get("pérdida diaria", 0) > 0


def test_resample_to_higher_timeframe():
    df = frame(list(np.linspace(1.10, 1.11, 8)))
    h1 = resample(df, "H1")
    assert len(h1) == 2
    assert h1["open"].iloc[0] == df["open"].iloc[0]
    assert h1["close"].iloc[0] == df["close"].iloc[3]
    assert h1["high"].iloc[0] == df["high"].iloc[:4].max()


@pytest.mark.parametrize("name", [n for n in AVAILABLE_STRATEGIES if n != "always"])
def test_every_strategy_runs_on_random_data(name, eurusd_spec):
    rng = np.random.default_rng(7)
    df = frame(list(1.10 + np.cumsum(rng.normal(0, 0.0008, 800))))
    cfg = BacktestConfig(symbol="EURUSD-T", params=StrategyParams(strategy=name, timeframe="M5"))
    res = BacktestEngine(cfg, eurusd_spec).run(df)
    m = res.metrics
    assert m["total_trades"] == m["wins"] + m["losses"] + sum(1 for t in res.trades if t.net_profit == 0)
    assert m["final_balance"] == pytest.approx(10_000 + sum(t.net_profit for t in res.trades), abs=0.05)
    assert 0 <= m["max_drawdown_pct"] <= 100
