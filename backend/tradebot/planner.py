"""Señal -> plan de operación.

Este módulo lo usan tanto el backtest como el bot en vivo, de modo que
la lógica que se prueba con datos históricos es la misma que se ejecuta.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional

import pandas as pd

from .broker.market_data import frame_to_candles
from .broker.models import BUY, SELL, SymbolSpec
from .broker import timeframes
from .risk import atr, atr_stops, lot_for_risk
from .strategies import get_strategy
from .strategies.base_strategy import BaseStrategy, SignalType, TradingSignal

# Estrategias que necesitan velas de un timeframe superior
STRATEGIES_NEEDING_HTF = {"price_action_key_levels"}
_NEXT_TF = {"M1": "M5", "M5": "M15", "M15": "H1", "M30": "H4", "H1": "H4", "H4": "D1"}


@dataclass
class StrategyParams:
    strategy: str = "ema_rsi"
    strategy_params: dict = field(default_factory=dict)
    timeframe: str = "M15"
    htf_timeframe: Optional[str] = None
    min_confidence: float = 0.0       # % mínimo de confianza de la señal
    atr_period: int = 14
    sl_atr_mult: float = 1.5
    tp_atr_mult: float = 2.5          # 0 = sin TP (sale por SL o por tiempo)
    min_sl_spread_mult: float = 5.0   # el SL nunca más cerca que N veces el spread (0 = sin mínimo)
    max_bars_in_trade: int = 0        # 0 = sin cierre por tiempo
    lookback: int = 300               # velas que recibe la estrategia
    ml_model: str = ""                # id del modelo que filtra señales ("" = sin filtro ML)
    ml_threshold: float = 0.5         # probabilidad mínima de éxito estimada por el modelo

    def __post_init__(self):
        self.timeframe = timeframes.normalize(self.timeframe)
        if self.htf_timeframe:
            self.htf_timeframe = timeframes.normalize(self.htf_timeframe)
        elif self.strategy in STRATEGIES_NEEDING_HTF:
            self.htf_timeframe = _NEXT_TF.get(self.timeframe)
        if self.strategy == "asian_range_breakout":
            self.lookback = max(self.lookback, 5000)

    def build_strategy(self) -> BaseStrategy:
        return get_strategy(self.strategy, self.strategy_params)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class TradePlan:
    symbol: str
    side: str
    entry: float
    sl: float
    tp: float
    volume: float
    risk_money: float
    atr: float
    confidence: float
    strategy: str
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def generate_signal(
    strategy: BaseStrategy,
    df: pd.DataFrame,
    htf_df: Optional[pd.DataFrame] = None,
    symbol: str = "",
) -> TradingSignal:
    """Ejecuta la estrategia sobre velas cerradas."""
    candles = frame_to_candles(df)
    candles_htf = frame_to_candles(htf_df) if htf_df is not None else None
    return strategy.analyze(candles, candles_htf, asset=symbol)


def ml_probability(model, df: pd.DataFrame, signal: TradingSignal, spread_points: float, point: float) -> float:
    """Probabilidad de éxito que el modelo asigna a la señal, con velas cerradas hasta la señal."""
    from .ml.features import features_at_last_bar

    side = BUY if signal.signal == SignalType.BUY else SELL
    feats = features_at_last_bar(df, side, float(signal.confidence), spread_points * point)
    return float(model.predict_proba_one(feats))


def current_atr(df: pd.DataFrame, period: int) -> float:
    """ATR de la última vela cerrada (0.0 si no hay suficientes velas)."""
    series = atr(df, period)
    value = float(series.iloc[-1]) if len(series) else 0.0
    return value if value == value else 0.0  # NaN -> 0


def build_plan(
    signal: TradingSignal,
    atr_value: float,
    spec: SymbolSpec,
    balance: float,
    entry_price: float,
    params: StrategyParams,
    risk_pct: float,
    symbol: str = "",
    spread_points: Optional[float] = None,
) -> tuple[Optional[TradePlan], str]:
    """Convierte la señal en un plan. Devuelve (None, motivo) si no se debe operar.

    spread_points: spread en el momento de la entrada (por defecto el de `spec`).
    """
    if signal.signal == SignalType.NONE:
        return None, "sin señal"
    if signal.confidence < params.min_confidence:
        return None, f"confianza {signal.confidence:.0f}% < mínimo {params.min_confidence:.0f}%"

    side = BUY if signal.signal == SignalType.BUY else SELL
    spread = spec.spread if spread_points is None else spread_points
    min_sl = params.min_sl_spread_mult * spread * spec.point
    ind = signal.indicators or {}
    if ind.get("entry_price"):
        entry_price = float(ind["entry_price"])
    own_sl = ind.get("sl")
    if own_sl:
        sl = round(float(own_sl), spec.digits)
        tp = round(float(ind["tp"]), spec.digits) if ind.get("tp") else 0.0
        if abs(entry_price - sl) <= 0:
            return None, "SL de la estrategia inválido"
    else:
        if atr_value <= 0:
            return None, "ATR no disponible (pocas velas)"
        sl, tp = atr_stops(side, entry_price, atr_value, params.sl_atr_mult, params.tp_atr_mult, spec, min_sl)
    sizing = lot_for_risk(balance, risk_pct, abs(entry_price - sl), spec)
    if sizing.volume <= 0:
        return None, f"tamaño de lote: {sizing.reason}"

    return TradePlan(
        symbol=symbol or spec.name,
        side=side,
        entry=entry_price,
        sl=sl,
        tp=tp,
        volume=sizing.volume,
        risk_money=sizing.risk_money,
        atr=atr_value,
        confidence=float(signal.confidence),
        strategy=params.strategy,
        reasons=[r.condition for r in signal.reasons if r.met],
    ), ""
