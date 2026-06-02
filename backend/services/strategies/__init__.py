"""
Professional Trading Strategies Module
======================================
Contains multiple trading strategies with explainable AI capabilities.
"""

from typing import Optional

from .base_strategy import BaseStrategy
from .ema_rsi_strategy import EmaRsiStrategy
from .macd_strategy import MacdStrategy
from .bollinger_strategy import BollingerBandsStrategy
from .ichimoku_strategy import IchimokuStrategy
from .rsi_divergence_strategy import RsiDivergenceStrategy
from .ema_trend_continuation import EmaTrendContinuationStrategy
from .price_action_key_levels import PriceActionKeyLevelsStrategy

__all__ = [
    'BaseStrategy',
    'EmaRsiStrategy',
    'MacdStrategy',
    'BollingerBandsStrategy',
    'IchimokuStrategy',
    'RsiDivergenceStrategy',
    'EmaTrendContinuationStrategy',
    'PriceActionKeyLevelsStrategy',
]

AVAILABLE_STRATEGIES = {
    'ema_rsi': EmaRsiStrategy,
    'macd': MacdStrategy,
    'bollinger': BollingerBandsStrategy,
    'ichimoku': IchimokuStrategy,
    'rsi_divergence': RsiDivergenceStrategy,
    'ema_trend_continuation': EmaTrendContinuationStrategy,
    'price_action_key_levels': PriceActionKeyLevelsStrategy,
}

def get_strategy(name: str, param_overrides: Optional[dict] = None) -> BaseStrategy:
    """Instancia estrategia por id, fusionando `param_overrides` sobre los defaults."""
    strategy_class = AVAILABLE_STRATEGIES.get(name.lower())
    if not strategy_class:
        raise ValueError(f"Strategy '{name}' not found. Available: {list(AVAILABLE_STRATEGIES.keys())}")
    proto = strategy_class()
    base = proto.default_params()
    merged = {**base, **(param_overrides or {})}
    for k, v in list(merged.items()):
        if k not in base:
            continue
        if isinstance(base[k], bool):
            merged[k] = bool(v) if isinstance(v, bool) else base[k]
        elif isinstance(base[k], int) and not isinstance(base[k], bool):
            try:
                merged[k] = int(v)
            except (TypeError, ValueError):
                merged[k] = base[k]
        elif isinstance(base[k], float):
            try:
                merged[k] = float(v)
            except (TypeError, ValueError):
                merged[k] = base[k]
    return strategy_class(merged)
