"""
Unified Data Service
====================
Provides unified data access for multiple trading platforms (IQ Option, MT5).
"""

from .unified_data_service import UnifiedDataService, unified_data_service
from .data_provider import DataProvider, IQOptionDataProvider, MT5DataProvider, DemoDataProvider

__all__ = [
    'UnifiedDataService',
    'unified_data_service',
    'DataProvider',
    'IQOptionDataProvider',
    'MT5DataProvider',
    'DemoDataProvider',
]
