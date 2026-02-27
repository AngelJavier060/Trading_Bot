"""
Unified Data Service
====================
Provides a unified interface for data access across multiple trading platforms.
"""

from typing import Dict, List, Optional, Union
from datetime import datetime
import pandas as pd
import logging

from .data_provider import (
    DataProvider, 
    IQOptionDataProvider, 
    MT5DataProvider, 
    DemoDataProvider
)

logger = logging.getLogger(__name__)


class UnifiedDataService:
    """
    Unified service for accessing market data from multiple platforms.
    
    Supports:
    - IQ Option
    - MetaTrader 5
    - Demo mode for testing
    """
    
    PROVIDERS = {
        'iqoption': IQOptionDataProvider,
        'mt5': MT5DataProvider,
        'demo': DemoDataProvider,
    }
    
    def __init__(self):
        self._providers: Dict[str, DataProvider] = {}
        self._active_provider: Optional[str] = None

    def sync_from_trading_service(self) -> None:
        """Attach to already-connected broker sessions (prevents parallel/simulated providers)."""
        try:
            from services.trading_service import trading_service
        except Exception:
            return

        try:
            iq = trading_service.get_iq_option()
        except Exception:
            iq = None

        if iq and getattr(iq, 'check_connect', None):
            try:
                if iq.check_connect():
                    if 'iqoption' not in self._providers:
                        self._providers['iqoption'] = self.PROVIDERS['iqoption']()
                    provider = self._providers['iqoption']
                    if hasattr(provider, 'attach_session'):
                        provider.attach_session(iq)
                        self._active_provider = 'iqoption'
            except Exception:
                pass
    
    def connect(self, platform: str, credentials: Dict) -> Dict:
        """
        Connect to a trading platform.
        
        Args:
            platform: Platform name ('iqoption', 'mt5', 'demo')
            credentials: Platform-specific credentials
            
        Returns:
            Connection result dict
        """
        platform = platform.lower()
        
        if platform not in self.PROVIDERS:
            return {
                'status': 'error',
                'message': f'Unknown platform: {platform}. Available: {list(self.PROVIDERS.keys())}'
            }
        
        try:
            # Create provider if not exists
            if platform not in self._providers:
                self._providers[platform] = self.PROVIDERS[platform]()
            
            provider = self._providers[platform]
            
            # Connect
            success = provider.connect(credentials)
            
            if success:
                self._active_provider = platform
                return {
                    'status': 'success',
                    'platform': platform,
                    'message': f'Connected to {platform}'
                }
            else:
                return {
                    'status': 'error',
                    'message': f'Failed to connect to {platform}'
                }
                
        except Exception as e:
            logger.error(f"Connection error for {platform}: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def disconnect(self, platform: Optional[str] = None) -> Dict:
        """Disconnect from a platform or all platforms."""
        platforms_to_disconnect = [platform] if platform else list(self._providers.keys())
        
        results = {}
        for p in platforms_to_disconnect:
            if p in self._providers:
                try:
                    self._providers[p].disconnect()
                    results[p] = 'disconnected'
                except Exception as e:
                    results[p] = f'error: {e}'
        
        if platform == self._active_provider or platform is None:
            self._active_provider = None
        
        return {'status': 'success', 'results': results}
    
    def get_active_platform(self) -> Optional[str]:
        """Get the currently active platform."""
        return self._active_provider
    
    def is_connected(self, platform: Optional[str] = None) -> bool:
        """Check if connected to a platform."""
        # Prefer real broker sessions if available
        self.sync_from_trading_service()
        p = platform or self._active_provider
        if p and p in self._providers:
            return self._providers[p].is_connected()
        return False
    
    def get_candles(
        self,
        symbol: str,
        timeframe: str = '5m',
        count: int = 100,
        platform: Optional[str] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """
        Get historical candles from a platform.
        
        Args:
            symbol: Trading symbol (e.g., 'EURUSD')
            timeframe: Candle timeframe ('1m', '5m', '15m', '1h', etc.)
            count: Number of candles to retrieve
            platform: Platform to use (defaults to active)
            end_time: End time for historical data
            
        Returns:
            DataFrame with OHLCV data
        """
        p = platform or self._active_provider
        
        if not p or p not in self._providers:
            raise ValueError(f"No active platform. Connect first.")
        
        provider = self._providers[p]
        
        if not provider.is_connected():
            raise ConnectionError(f"Not connected to {p}")
        
        return provider.get_candles(symbol, timeframe, count, end_time)
    
    def get_candles_multi_platform(
        self,
        symbol: str,
        timeframe: str = '5m',
        count: int = 100
    ) -> Dict[str, pd.DataFrame]:
        """
        Get candles from all connected platforms.
        
        Returns:
            Dict mapping platform name to DataFrame
        """
        results = {}
        
        for platform, provider in self._providers.items():
            if provider.is_connected():
                try:
                    df = provider.get_candles(symbol, timeframe, count)
                    if not df.empty:
                        results[platform] = df
                except Exception as e:
                    logger.error(f"Error getting candles from {platform}: {e}")
        
        return results
    
    def get_symbols(self, platform: Optional[str] = None) -> List[str]:
        """Get available symbols from a platform."""
        self.sync_from_trading_service()
        p = platform or self._active_provider
        
        if not p or p not in self._providers:
            return []
        
        return self._providers[p].get_available_symbols()
    
    def get_current_price(self, symbol: str, platform: Optional[str] = None) -> float:
        """Get current price for a symbol."""
        self.sync_from_trading_service()
        p = platform or self._active_provider
        
        if not p or p not in self._providers:
            return 0.0
        
        return self._providers[p].get_current_price(symbol)
    
    def get_connection_status(self) -> Dict:
        """Get connection status for all platforms."""
        self.sync_from_trading_service()
        status = {}
        
        for platform, provider in self._providers.items():
            status[platform] = {
                'connected': provider.is_connected(),
                'platform_name': provider.platform_name
            }
        
        return {
            'active_platform': self._active_provider,
            'platforms': status
        }
    
    def prepare_ml_data(
        self,
        symbol: str,
        timeframe: str = '5m',
        count: int = 1000,
        platform: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Get data prepared for ML training/prediction.
        
        Returns DataFrame with OHLCV and basic technical indicators.
        """
        df = self.get_candles(symbol, timeframe, count, platform)
        
        if df.empty:
            return df
        
        # Add basic features for ML
        df = self._add_basic_features(df)
        
        return df
    
    def _add_basic_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add basic technical features to DataFrame."""
        # Returns
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        # Moving averages
        for period in [5, 10, 20, 50]:
            df[f'sma_{period}'] = df['close'].rolling(window=period).mean()
            df[f'ema_{period}'] = df['close'].ewm(span=period, adjust=False).mean()
        
        # Volatility
        df['volatility'] = df['returns'].rolling(window=20).std()
        
        # Price position
        df['high_low_range'] = df['high'] - df['low']
        df['close_open_range'] = df['close'] - df['open']
        
        # RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']
        
        # Bollinger Bands
        sma20 = df['close'].rolling(window=20).mean()
        std20 = df['close'].rolling(window=20).std()
        df['bb_upper'] = sma20 + (std20 * 2)
        df['bb_lower'] = sma20 - (std20 * 2)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / sma20
        df['bb_position'] = (df['close'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
        
        return df


# Import numpy for _add_basic_features
import numpy as np


# Singleton instance
unified_data_service = UnifiedDataService()
