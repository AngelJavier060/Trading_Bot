import numpy as np
import pandas as pd
import pytest

from conftest import frame
from tradebot.backtest import BacktestConfig, BacktestEngine
from tradebot.live.engine import check_model_matches
from tradebot.ml.features import FEATURE_NAMES, MIN_BARS, bar_features, features_at_last_bar, signal_features
from tradebot.ml.labeling import build_signal_dataset
from tradebot.ml.model import SignalModel
from tradebot.ml.registry import list_models, load_model
from tradebot.ml.train import train_model
from tradebot.planner import StrategyParams
from tradebot.risk import RiskLimits
from tradebot.strategies import AVAILABLE_STRATEGIES
from tradebot.strategies.base_strategy import BaseStrategy, SignalType, TradingSignal


class AlwaysBuy(BaseStrategy):
    name = "always_buy"
    min_candles = 20

    def default_params(self):
        return {"x": 1}

    def analyze(self, candles, candles_htf=None, *, asset=""):
        return TradingSignal(signal=SignalType.BUY, confidence=70, indicators={}, reasons=[])


@pytest.fixture(autouse=True)
def register(monkeypatch):
    monkeypatch.setitem(AVAILABLE_STRATEGIES, "always_buy", AlwaysBuy)


def walk(n=1500, seed=3):
    rng = np.random.default_rng(seed)
    return frame(list(1.10 + np.cumsum(rng.normal(0, 0.0008, n))))


def test_features_are_causal():
    """La fila k solo depende de velas <= k: calcular con la serie cortada da lo mismo."""
    df = walk(800)
    full = bar_features(df)
    for k in (300, 550, 799):
        cut = bar_features(df.iloc[:k + 1])
        pd.testing.assert_series_equal(full.iloc[k], cut.iloc[k], check_names=False)


def test_live_window_matches_backtest_features():
    """En vivo se calculan con las últimas MIN_BARS velas; en el backtest con toda la historia."""
    df = walk(1500)
    full = signal_features(bar_features(df).iloc[-1], "buy", 70, 0.0001)
    live = features_at_last_bar(df.tail(MIN_BARS).reset_index(drop=True), "buy", 70, 0.0001)
    for name in FEATURE_NAMES:
        assert live[name] == pytest.approx(full[name], rel=1e-3, abs=1e-6), name


def test_directional_features_flip_for_sells():
    row = bar_features(walk(600)).iloc[-1]
    buy, sell = signal_features(row, "buy", 50, 0.0), signal_features(row, "sell", 50, 0.0)
    assert sell["dist_ema50"] == pytest.approx(-buy["dist_ema50"])
    assert sell["rsi14"] == pytest.approx(100 - buy["rsi14"])
    assert sell["range_pos_50"] == pytest.approx(1 - buy["range_pos_50"])
    assert buy["side"] == 1 and sell["side"] == -1
    assert sell["atr_pct"] == buy["atr_pct"]


def test_labeling_uses_same_exit_rules(eurusd_spec):
    df = frame([1.1000] * 60, wick=0.0005)
    df.loc[22, "high"] = 1.1030   # la señal de la vela 20 llega al TP
    params = StrategyParams(strategy="always_buy", timeframe="M15")
    data = build_signal_dataset(df, eurusd_spec, params)
    first = data.iloc[0]
    assert first["exit_reason"] == "tp" and first["label"] == 1
    assert first["r"] == pytest.approx(0.0025 / 0.0015, rel=1e-3)
    assert list(data.columns[:len(FEATURE_NAMES)]) == FEATURE_NAMES


def synthetic_dataset(n=1200, seed=1):
    """La etiqueta depende de dist_ema50: el modelo debe aprenderlo."""
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(rng.normal(size=(n, len(FEATURE_NAMES))), columns=FEATURE_NAMES)
    X["label"] = ((X["dist_ema50"] + rng.normal(0, 0.5, n)) > 0).astype(int)
    X["time"] = pd.date_range("2025-01-01", periods=n, freq="h", tz="UTC")
    return X


def test_model_learns_and_roundtrips(tmp_path):
    data = synthetic_dataset()
    model = train_model(data, StrategyParams(strategy="macd", timeframe="H1"), ["EURUSD-T"])
    assert model.info.validation["auc"] > 0.8
    model.save(tmp_path)
    loaded = load_model(tmp_path, model.info.id)
    row = data.iloc[0][FEATURE_NAMES].to_dict()
    assert loaded.predict_proba_one(row) == pytest.approx(model.predict_proba_one(row))
    assert list_models(tmp_path)[0]["id"] == model.info.id


def test_model_needs_enough_data():
    with pytest.raises(ValueError, match="al menos"):
        train_model(synthetic_dataset(50), StrategyParams(), ["X"])


def test_ml_filter_in_backtest(eurusd_spec):
    df = walk(900)
    data = synthetic_dataset()
    model = SignalModel().fit(data, data["label"])
    base = dict(symbol="EURUSD-T", limits=RiskLimits(max_trades_per_day=100, max_daily_loss_pct=100))

    def run(threshold):
        params = StrategyParams(strategy="always_buy", timeframe="M15", ml_threshold=threshold, max_bars_in_trade=3)
        return BacktestEngine(BacktestConfig(params=params, **base), eurusd_spec, model=model).run(df)

    none_pass = run(1.01)
    all_pass = run(0.0)
    plain = BacktestEngine(BacktestConfig(params=StrategyParams(strategy="always_buy", timeframe="M15",
                                                                max_bars_in_trade=3), **base), eurusd_spec).run(df)
    assert none_pass.metrics["total_trades"] == 0 and none_pass.blocked["filtro ML"] > 0
    assert all_pass.metrics["total_trades"] == plain.metrics["total_trades"]
    assert all(t.ml_prob is not None for t in all_pass.trades)


def test_bot_refuses_model_trained_for_other_settings():
    data = synthetic_dataset()
    model = train_model(data, StrategyParams(strategy="macd", timeframe="H1", sl_atr_mult=1.5), ["X"])
    check_model_matches(model, StrategyParams(strategy="macd", timeframe="H1", sl_atr_mult=1.5))
    with pytest.raises(RuntimeError, match="sl_atr_mult"):
        check_model_matches(model, StrategyParams(strategy="macd", timeframe="H1", sl_atr_mult=2.0))
