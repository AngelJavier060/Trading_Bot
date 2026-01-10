"""
Database Module - Trading Bot
Sistema de persistencia con SQLAlchemy para historial de operaciones,
estrategias, señales y configuración del robot de trading.
"""

from .connection import db, init_db, get_db_session
from .models import (
    Trade,
    Signal,
    Strategy,
    StrategyVersion,
    IndicatorConfig,
    MarketCondition,
    RobotConfig,
    PerformanceMetrics
)

__all__ = [
    'db',
    'init_db',
    'get_db_session',
    'Trade',
    'Signal',
    'Strategy',
    'StrategyVersion',
    'IndicatorConfig',
    'MarketCondition',
    'RobotConfig',
    'PerformanceMetrics'
]
