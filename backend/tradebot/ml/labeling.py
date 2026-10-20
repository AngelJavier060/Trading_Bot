"""Construye el conjunto de entrenamiento: cada señal histórica con su resultado.

A diferencia del backtest (que solo opera si no hay posición abierta), aquí se
simula CADA señal por separado con las mismas reglas que el bot:
entrada en la apertura de la vela siguiente, SL/TP por ATR (con el mínimo por
spread), cierre por tiempo y el mismo tratamiento de spread y gaps.

Etiqueta = 1 si la operación terminó con beneficio (en R, neto de spread).
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from ..broker.market_data import epoch_seconds
from ..broker.models import BUY, SELL, SymbolSpec
from ..planner import StrategyParams
from ..risk import atr as atr_series
from ..risk import atr_stops
from ..strategies.base_strategy import SignalType
from .features import FEATURE_NAMES, bar_features, signal_features

DEFAULT_HORIZON = 500  # velas máximas para resolver una señal


def build_signal_dataset(
    df: pd.DataFrame,
    spec: SymbolSpec,
    params: StrategyParams,
    htf_df: Optional[pd.DataFrame] = None,
    trade_from: Optional[datetime] = None,
    trade_to: Optional[datetime] = None,
    spread_points: Optional[int] = None,
    horizon: int = DEFAULT_HORIZON,
    signals: Optional[list] = None,
) -> pd.DataFrame:
    """Una fila por señal: FEATURE_NAMES + time, symbol, side, r, exit_reason, bars, label.

    signals: resultado de backtest.engine.compute_signals() para el mismo df (opcional).
    """
    from ..backtest.engine import _check_stops, compute_signals  # import tardío: evita ciclo

    df = df.sort_values("time").reset_index(drop=True)
    n = len(df)
    if signals is None:
        signals = compute_signals(params.build_strategy(), df, params, spec.name, htf_df)

    t_epoch = epoch_seconds(df["time"]).to_numpy()
    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    if spread_points is not None:
        spreads = np.full(n, float(spread_points)) * spec.point
    else:
        spreads = df["spread"].to_numpy(float) * spec.point if "spread" in df.columns else np.zeros(n)
    atr_values = atr_series(df, params.atr_period).to_numpy(float)
    feats = bar_features(df)

    lo = epoch_seconds(pd.Series([trade_from])).iloc[0] if trade_from is not None else None
    hi = epoch_seconds(pd.Series([trade_to])).iloc[0] if trade_to is not None else None
    rows = []
    for i in range(1, n - 1):
        if (lo is not None and t_epoch[i] < lo) or (hi is not None and t_epoch[i] >= hi):
            continue
        signal = signals[i]
        if signal is None or signal.signal == SignalType.NONE or signal.confidence < params.min_confidence:
            continue
        atr_prev = atr_values[i - 1]
        if math.isnan(atr_prev) or atr_prev <= 0:
            continue

        side = BUY if signal.signal == SignalType.BUY else SELL
        spr = spreads[i]
        entry = o[i] + spr if side == BUY else o[i]
        min_sl = params.min_sl_spread_mult * spr
        sl, tp = atr_stops(side, entry, float(atr_prev), params.sl_atr_mult, params.tp_atr_mult, spec, min_sl)
        risk = abs(entry - sl)

        pos = {"side": side, "sl": sl, "tp": tp, "entry_idx": i}
        exit_price, reason, j = None, "", i
        last = min(n - 1, i + horizon)
        for j in range(i, last + 1):
            if params.max_bars_in_trade and j - i >= params.max_bars_in_trade:
                exit_price, reason = (o[j], "time") if side == BUY else (o[j] + spreads[j], "time")
                break
            price, why = _check_stops(pos, j, o, h, l, spreads[j], 0.0)
            if why:
                exit_price, reason = price, why
                break
        if exit_price is None:  # sin resolver dentro del horizonte: valorar al cierre
            exit_price = c[last] if side == BUY else c[last] + spreads[last]
            reason, j = "horizon", last

        r = ((exit_price - entry) if side == BUY else (entry - exit_price)) / risk
        row = signal_features(feats.iloc[i - 1], side, float(signal.confidence), spr)
        row.update(time=df["time"].iloc[i], symbol=spec.name, side_name=side, r=round(r, 4),
                   exit_reason=reason, bars=j - i, label=int(r > 0))
        rows.append(row)

    columns = FEATURE_NAMES + ["time", "symbol", "side_name", "r", "exit_reason", "bars", "label"]
    return pd.DataFrame(rows, columns=columns)
