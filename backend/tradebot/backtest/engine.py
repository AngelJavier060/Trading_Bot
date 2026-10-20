"""Backtest bar a bar para forex/CFD con datos de MT5.

Modelo de ejecución (conservador a propósito):
- La señal se calcula con velas CERRADAS hasta i-1 y se entra en la apertura de la vela i.
- Los precios OHLC de MT5 son BID. Compras entran al ASK (bid + spread) y salen al BID;
  ventas entran al BID y salen al ASK.
- SL/TP se revisan con el máximo/mínimo de cada vela. Si en la misma vela se tocan
  ambos, se asume que saltó el SL (no se puede saber el orden dentro de la vela).
- Si el precio abre más allá del SL (gap), la salida es en la apertura, no en el SL.
- Cierre por tiempo (max_bars_in_trade) en la apertura de la vela correspondiente.
- Se aplican los mismos límites de riesgo diarios que en vivo.

Limitación conocida: el valor del tick se toma de la especificación actual del
símbolo; en pares cruzados varía un poco con el tiempo.
"""

from __future__ import annotations

import logging
import math
from collections import Counter
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ..broker import timeframes
from ..broker.market_data import epoch_seconds, frame_to_candles
from ..broker.models import BUY, SELL, SymbolSpec
from ..ml.features import bar_features, signal_features
from ..ml.model import SignalModel
from ..ml.registry import load_model
from ..planner import build_plan
from ..risk import RiskContext, atr, check
from ..strategies.base_strategy import SignalType
from .metrics import compute_metrics
from .models import BacktestConfig, BacktestResult, BacktestTrade

logger = logging.getLogger(__name__)

MAX_EQUITY_POINTS = 1500


def resample(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """Agrega velas a un timeframe superior (para estrategias que usan HTF)."""
    rule = f"{timeframes.minutes(timeframe)}min"
    g = df.set_index("time").resample(rule, label="left", closed="left")
    out = pd.DataFrame({
        "open": g["open"].first(),
        "high": g["high"].max(),
        "low": g["low"].min(),
        "close": g["close"].last(),
        "tick_volume": g["tick_volume"].sum() if "tick_volume" in df.columns else 0,
        "spread": g["spread"].max() if "spread" in df.columns else 0,
    }).dropna(subset=["open"])
    return out.reset_index()


def compute_signals(strategy, df: pd.DataFrame, params, symbol: str = "",
                    htf_df: Optional[pd.DataFrame] = None) -> list:
    """Señal de la estrategia para CADA vela i (calculada con velas cerradas hasta i-1).

    Se calcula una vez y se reutiliza al probar distintos SL/TP, riesgo o
    umbrales de ML (la señal no depende de esos parámetros). None antes del calentamiento.
    """
    df = df.sort_values("time").reset_index(drop=True)
    n = len(df)
    if params.htf_timeframe and htf_df is None:
        htf_df = resample(df, params.htf_timeframe)
    htf_candles = frame_to_candles(htf_df) if htf_df is not None else None
    htf_close = None
    if htf_df is not None:
        htf_close = epoch_seconds(htf_df["time"]).to_numpy() + timeframes.minutes(params.htf_timeframe) * 60
    candles = frame_to_candles(df)
    t_epoch = epoch_seconds(df["time"]).to_numpy()
    warmup = max(strategy.min_candles, params.atr_period + 1, 2)
    lookback = max(params.lookback, warmup)
    out: list = [None] * n
    for i in range(warmup, n):
        htf_window = None
        if htf_candles is not None:
            k = int(np.searchsorted(htf_close, t_epoch[i], side="right"))
            htf_window = htf_candles[max(0, k - lookback):k]
        out[i] = strategy.analyze(candles[max(0, i - lookback):i], htf_window, asset=symbol)
    return out


class BacktestEngine:
    def __init__(self, config: BacktestConfig, spec: SymbolSpec, models_dir: Optional[Path] = None,
                 model: Optional[SignalModel] = None):
        self.config = config
        self.spec = spec
        self.params = config.params
        self.strategy = self.params.build_strategy()
        self.model = model
        if self.model is None and self.params.ml_model:
            if models_dir is None:
                raise ValueError("Para usar ml_model en el backtest hace falta models_dir")
            self.model = load_model(models_dir, self.params.ml_model)

    def run(self, df: pd.DataFrame, htf_df: Optional[pd.DataFrame] = None,
            signals: Optional[list] = None) -> BacktestResult:
        """signals: resultado de compute_signals() para el mismo df (opcional, acelera)."""
        cfg, spec, params = self.config, self.spec, self.params
        df = df.sort_values("time").reset_index(drop=True)
        n = len(df)
        if n == 0:
            raise ValueError("No hay velas para el backtest")

        # Igual que el bot en vivo, la estrategia se evalúa en cada vela nueva (también con
        # posición abierta): importa para estrategias con estado interno.
        if signals is None:
            signals = compute_signals(self.strategy, df, params, cfg.symbol, htf_df)
        if len(signals) != n:
            raise ValueError("signals no corresponde a las velas del backtest")

        times = df["time"]
        t_epoch = epoch_seconds(times).to_numpy()
        o = df["open"].to_numpy(float)
        h = df["high"].to_numpy(float)
        l = df["low"].to_numpy(float)
        c = df["close"].to_numpy(float)
        if cfg.spread_points is not None:
            spreads = np.full(n, float(cfg.spread_points)) * spec.point
        else:
            spreads = df["spread"].to_numpy(float) * spec.point if "spread" in df.columns else np.zeros(n)
        slip = cfg.slippage_points * spec.point
        atr_values = atr(df, params.atr_period).to_numpy(float)

        warmup = max(self.strategy.min_candles, params.atr_period + 1, 2)
        feats = bar_features(df) if self.model is not None else None
        trade_from = epoch_seconds(pd.Series([cfg.trade_from])).iloc[0] if cfg.trade_from is not None else None
        trade_to = epoch_seconds(pd.Series([cfg.trade_to])).iloc[0] if cfg.trade_to is not None else None

        balance = cfg.initial_balance
        position: Optional[dict] = None
        trades: list[BacktestTrade] = []
        equity_t: list = []
        equity_v: list[float] = []
        blocked: Counter = Counter()
        signal_count = 0
        current_day = None
        day_start_equity = balance
        trades_today = 0

        def close(pos: dict, j: int, price: float, reason: str) -> None:
            nonlocal balance
            gross = spec.pnl(pos["side"], pos["entry"], price, pos["volume"])
            commission = cfg.commission_per_lot * pos["volume"] * 2
            net = gross - commission
            balance += net
            t: BacktestTrade = pos["trade"]
            t.exit_time = times.iloc[j].isoformat()
            t.exit_price = round(price, spec.digits)
            t.exit_reason = reason
            t.bars_held = j - pos["entry_idx"]
            t.gross_profit = round(gross, 2)
            t.commission = round(commission, 2)
            t.net_profit = round(net, 2)
            t.r_multiple = round(net / t.risk_money, 3) if t.risk_money else 0.0
            t.balance_after = round(balance, 2)
            trades.append(t)

        for i in range(warmup, n):
            spr = spreads[i]
            day = times.iloc[i].date()
            if day != current_day:
                current_day = day
                day_start_equity = equity_v[-1] if equity_v else balance
                trades_today = 0

            # 1) Cierre por tiempo en la apertura de la vela
            if position and params.max_bars_in_trade and i - position["entry_idx"] >= params.max_bars_in_trade:
                exit_price = (o[i] - slip) if position["side"] == BUY else (o[i] + spr + slip)
                close(position, i, exit_price, "time")
                position = None

            close_hour = int((params.strategy_params or {}).get("close_hour") or 0)
            if position and close_hour > 0:
                hour = pd.Timestamp(times.iloc[i]).hour
                if hour >= close_hour:
                    exit_price = (o[i] - slip) if position["side"] == BUY else (o[i] + spr + slip)
                    close(position, i, exit_price, "time")
                    position = None

            # 2) Entrada en la apertura de la vela i con señal de velas cerradas hasta i-1
            in_window = (trade_from is None or t_epoch[i] >= trade_from) and (trade_to is None or t_epoch[i] < trade_to)
            if position is None and in_window:
                signal = signals[i]
                if signal is not None and signal.confidence < params.min_confidence:
                    signal = None
                ml_prob = None
                if signal is not None and signal.signal != SignalType.NONE and feats is not None:
                    side = BUY if signal.signal == SignalType.BUY else SELL
                    ml_prob = self.model.predict_proba_one(
                        signal_features(feats.iloc[i - 1], side, float(signal.confidence), spr))
                    if ml_prob < params.ml_threshold:
                        signal_count += 1
                        blocked["filtro ML"] += 1
                        signal = None
                if signal is not None and signal.signal != SignalType.NONE:
                    signal_count += 1
                    ok, reason = check(
                        cfg.limits,
                        RiskContext(
                            equity=balance,
                            day_start_equity=day_start_equity,
                            trades_today=trades_today,
                            spread_points=int(round(spr / spec.point)) if spec.point else 0,
                        ),
                        cfg.symbol,
                    )
                    if ok:
                        side_is_buy = signal.signal == SignalType.BUY
                        entry = (o[i] + spr + slip) if side_is_buy else (o[i] - slip)
                        if signal.indicators and signal.indicators.get("entry_price"):
                            entry = float(signal.indicators["entry_price"])
                        atr_prev = atr_values[i - 1]
                        plan, reason = build_plan(
                            signal, 0.0 if math.isnan(atr_prev) else float(atr_prev),
                            spec, balance, entry, params, cfg.limits.risk_per_trade_pct, cfg.symbol,
                            spread_points=spr / spec.point if spec.point else 0,
                        )
                        if plan:
                            trades_today += 1
                            position = {
                                "side": plan.side,
                                "entry": entry,
                                "sl": plan.sl,
                                "tp": plan.tp,
                                "volume": plan.volume,
                                "entry_idx": i,
                                "trade": BacktestTrade(
                                    side=plan.side,
                                    entry_time=times.iloc[i].isoformat(),
                                    entry_price=round(entry, spec.digits),
                                    sl=plan.sl,
                                    tp=plan.tp,
                                    volume=plan.volume,
                                    risk_money=plan.risk_money,
                                    confidence=plan.confidence,
                                    ml_prob=round(ml_prob, 4) if ml_prob is not None else None,
                                ),
                            }
                    if not ok or position is None:
                        blocked[_short_reason(reason)] += 1

            # 3) SL / TP durante la vela
            if position:
                exit_price, reason = _check_stops(position, i, o, h, l, spr, slip)
                if reason:
                    close(position, i, exit_price, reason)
                    position = None

            # 4) Equity al cierre de la vela (con la posición valorada a mercado)
            equity = balance
            if position:
                mark = c[i] if position["side"] == BUY else c[i] + spr
                equity += spec.pnl(position["side"], position["entry"], mark, position["volume"])
            equity_t.append(times.iloc[i])
            equity_v.append(equity)

        if position:
            last = n - 1
            exit_price = c[last] if position["side"] == BUY else c[last] + spreads[last]
            close(position, last, exit_price, "end")
            equity_v[-1] = balance

        equity_series = pd.Series(equity_v, index=pd.DatetimeIndex(equity_t))
        metrics = compute_metrics(trades, cfg.initial_balance, equity_series)
        step = max(1, math.ceil(len(equity_v) / MAX_EQUITY_POINTS))
        curve = [
            {"time": equity_t[k].isoformat(), "equity": round(equity_v[k], 2)}
            for k in range(0, len(equity_v), step)
        ]
        return BacktestResult(
            config=cfg,
            metrics=metrics,
            trades=trades,
            equity_curve=curve,
            bars=n,
            period_start=times.iloc[0].isoformat(),
            period_end=times.iloc[-1].isoformat(),
            signals=signal_count,
            blocked=dict(blocked),
        )


def _check_stops(pos: dict, i: int, o, h, l, spr: float, slip: float) -> tuple[float, str]:
    """(precio de salida, motivo) si la vela i toca SL o TP; ('', '') si no."""
    sl, tp = pos["sl"], pos["tp"]
    first_bar = i == pos["entry_idx"]  # en la vela de entrada no hay gap: se entró en la apertura
    if pos["side"] == BUY:
        if not first_bar and o[i] <= sl:
            return o[i] - slip, "sl"
        if not first_bar and tp and o[i] >= tp:
            return o[i], "tp"
        if l[i] <= sl:
            return sl - slip, "sl"
        if tp and h[i] >= tp:
            return tp, "tp"
    else:
        ask_open, ask_high, ask_low = o[i] + spr, h[i] + spr, l[i] + spr
        if not first_bar and ask_open >= sl:
            return ask_open + slip, "sl"
        if not first_bar and tp and ask_open <= tp:
            return ask_open, "tp"
        if ask_high >= sl:
            return sl + slip, "sl"
        if tp and ask_low <= tp:
            return tp, "tp"
    return 0.0, ""


def _short_reason(reason: str) -> str:
    """Agrupa motivos de bloqueo para el resumen (sin números concretos)."""
    for key in ("pérdida diaria", "máximo de operaciones", "spread", "confianza", "tamaño de lote", "ATR"):
        if key in reason:
            return key
    return reason or "otro"
