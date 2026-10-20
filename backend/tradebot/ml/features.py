"""Variables (features) que describen el contexto de mercado en el momento de una señal.

Todas se calculan solo con velas cerradas hasta la señal (causales): la fila k
usa datos hasta la vela k. Las que dependen de la dirección se orientan según
el lado de la operación, de modo que "a favor de la tendencia" sea positivo
tanto para compras como para ventas.

- bar_features(df): versión vectorizada para toda la serie (backtest, entrenamiento).
- features_at_last_bar(df, ...): la misma cuenta para la última vela (bot en vivo).
Los tests verifican que ambas den el mismo resultado.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..broker.models import BUY
from ..risk.stops import atr as atr_series

# Velas mínimas para que las features más largas (EMA 100, rangos de 100) se estabilicen
MIN_BARS = 500

BAR_FEATURES = [
    "atr_pct", "atr_ratio", "rsi14", "ema20_slope", "dist_ema50", "dist_ema100",
    "ret_1", "ret_4", "ret_12", "range_pos_50", "bb_width", "body_ratio", "adx14",
    "hour_sin", "hour_cos", "dow",
]
# Features que se invierten para las ventas (miden "a favor de la operación")
DIRECTIONAL = ["ema20_slope", "dist_ema50", "dist_ema100", "ret_1", "ret_4", "ret_12"]
FEATURE_NAMES = BAR_FEATURES + ["side", "confidence", "spread_atr"]


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


def _adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    atr = atr_series(df, period)
    alpha = 1 / period
    plus_di = 100 * pd.Series(plus_dm, index=df.index).ewm(alpha=alpha, adjust=False).mean() / atr
    minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(alpha=alpha, adjust=False).mean() / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.ewm(alpha=alpha, adjust=False).mean()


def bar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Features de mercado por vela (sin depender de la dirección de la operación)."""
    close, high, low, open_ = df["close"], df["high"], df["low"], df["open"]
    atr = atr_series(df, 14)
    safe_atr = atr.replace(0, np.nan)
    ema20 = close.ewm(span=20, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()
    ema100 = close.ewm(span=100, adjust=False).mean()
    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    hi50, lo50 = high.rolling(50).max(), low.rolling(50).min()
    hours = pd.to_datetime(df["time"], utc=True).dt.hour if "time" in df.columns else pd.Series(0, index=df.index)
    dow = pd.to_datetime(df["time"], utc=True).dt.dayofweek if "time" in df.columns else pd.Series(0, index=df.index)

    f = pd.DataFrame(index=df.index)
    f["atr_pct"] = atr / close * 100
    f["atr_ratio"] = atr / atr.rolling(100, min_periods=20).mean()
    f["rsi14"] = _rsi(close, 14)
    f["ema20_slope"] = (ema20 - ema20.shift(5)) / safe_atr
    f["dist_ema50"] = (close - ema50) / safe_atr
    f["dist_ema100"] = (close - ema100) / safe_atr
    f["ret_1"] = (close - close.shift(1)) / safe_atr
    f["ret_4"] = (close - close.shift(4)) / safe_atr
    f["ret_12"] = (close - close.shift(12)) / safe_atr
    f["range_pos_50"] = (close - lo50) / (hi50 - lo50).replace(0, np.nan)
    f["bb_width"] = 4 * std20 / sma20 * 100
    f["body_ratio"] = (close - open_).abs() / (high - low).replace(0, np.nan)
    f["adx14"] = _adx(df, 14)
    f["hour_sin"] = np.sin(2 * np.pi * hours / 24)
    f["hour_cos"] = np.cos(2 * np.pi * hours / 24)
    f["dow"] = dow.astype(float)
    f["_atr"] = atr  # auxiliar (no es feature): para normalizar el spread
    return f


def signal_features(row, side: str, confidence: float, spread_price: float) -> dict:
    """Features de una señal concreta a partir de la fila de bar_features de la última vela cerrada."""
    sign = 1.0 if side == BUY else -1.0
    out = {}
    for name in BAR_FEATURES:
        v = float(row[name]) if row[name] == row[name] else np.nan  # NaN se conserva
        if name in DIRECTIONAL:
            v *= sign
        elif name == "rsi14" and sign < 0:
            v = 100 - v
        elif name == "range_pos_50" and sign < 0:
            v = 1 - v
        out[name] = v
    atr = float(row["_atr"]) if row["_atr"] == row["_atr"] else np.nan
    out["side"] = sign
    out["confidence"] = float(confidence)
    out["spread_atr"] = spread_price / atr if atr and atr == atr else np.nan
    return out


def features_at_last_bar(df: pd.DataFrame, side: str, confidence: float, spread_price: float) -> dict:
    return signal_features(bar_features(df).iloc[-1], side, confidence, spread_price)
