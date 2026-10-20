"""Stop loss y take profit basados en ATR."""

from __future__ import annotations

from typing import Optional

import pandas as pd

from ..broker.models import BUY, SymbolSpec


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average True Range con suavizado de Wilder (igual que MT5)."""
    prev_close = df["close"].shift()
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()


def atr_stops(
    side: str,
    entry: float,
    atr_value: float,
    sl_mult: float,
    tp_mult: float,
    spec: Optional[SymbolSpec] = None,
    min_sl_distance: float = 0.0,
) -> tuple[float, float]:
    """(sl, tp) a `sl_mult`/`tp_mult` ATRs del precio de entrada.

    Respeta la distancia mínima del broker (stops_level) más el spread y,
    si se da, `min_sl_distance`. Si el SL se amplía, el TP se amplía en la
    misma proporción para mantener la relación riesgo/beneficio.
    tp_mult <= 0 significa sin take profit (devuelve tp=0).
    """
    if atr_value <= 0 or sl_mult <= 0:
        raise ValueError("ATR y sl_mult deben ser positivos")
    sl_dist = atr_value * sl_mult
    tp_dist = atr_value * tp_mult if tp_mult > 0 else 0.0
    if min_sl_distance > sl_dist:
        tp_dist *= min_sl_distance / sl_dist
        sl_dist = min_sl_distance
    if spec is not None:
        min_dist = (spec.stops_level + spec.spread) * spec.point
        sl_dist = max(sl_dist, min_dist)
        if tp_dist:
            tp_dist = max(tp_dist, min_dist)

    if side == BUY:
        sl, tp = entry - sl_dist, (entry + tp_dist if tp_dist else 0.0)
    else:
        sl, tp = entry + sl_dist, (entry - tp_dist if tp_dist else 0.0)
    if spec is not None:
        sl = spec.round_price(sl)
        tp = spec.round_price(tp) if tp else 0.0
    return sl, tp
