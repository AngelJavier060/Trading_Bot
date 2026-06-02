"""
Trading Services
================
Services for live trading operations, auto-connection, and multi-platform management.
"""

from .live_trading_service import LiveTradingService, live_trading_service
from .auto_connector import AutoConnector, auto_connector
from .platform_manager import PlatformManager, platform_manager, PlatformConfig, BotInstance

__all__ = [
    'LiveTradingService',
    'live_trading_service',
    'AutoConnector',
    'auto_connector',
    'PlatformManager',
    'platform_manager',
    'PlatformConfig',
    'BotInstance',
]
