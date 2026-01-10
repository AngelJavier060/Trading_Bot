"""
Professional Trading Strategies Module
======================================
Contains multiple trading strategies with explainable AI capabilities.
"""

from .base_strategy import BaseStrategy
from .ema_rsi_strategy import EmaRsiStrategy
from .macd_strategy import MacdStrategy
from .bollinger_strategy import BollingerBandsStrategy
from .ichimoku_strategy import IchimokuStrategy
from .rsi_divergence_strategy import RsiDivergenceStrategy

__all__ = [
    'BaseStrategy',
    'EmaRsiStrategy',
    'MacdStrategy',
    'BollingerBandsStrategy',
    'IchimokuStrategy',
    'RsiDivergenceStrategy',
]

AVAILABLE_STRATEGIES = {
    'ema_rsi': EmaRsiStrategy,
    'macd': MacdStrategy,
    'bollinger': BollingerBandsStrategy,
    'ichimoku': IchimokuStrategy,
    'rsi_divergence': RsiDivergenceStrategy,
}

def get_strategy(name: str) -> BaseStrategy:
    """Get strategy instance by name."""
    strategy_class = AVAILABLE_STRATEGIES.get(name.lower())
    if not strategy_class:
        raise ValueError(f"Strategy '{name}' not found. Available: {list(AVAILABLE_STRATEGIES.keys())}")
    return strategy_class()
