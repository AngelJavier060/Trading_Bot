"""
Data Providers for Multiple Platforms
=====================================
Abstract data provider with implementations for IQ Option and MT5.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import logging
import time

logger = logging.getLogger(__name__)


class DataProvider(ABC):
    """Abstract base class for data providers."""
    
    platform_name: str = "base"
    
    @abstractmethod
    def connect(self, credentials: Dict) -> bool:
        """Connect to the platform."""
        pass
    
    @abstractmethod
    def disconnect(self) -> bool:
        """Disconnect from the platform."""
        pass
    
    @abstractmethod
    def is_connected(self) -> bool:
        """Check if connected."""
        pass
    
    @abstractmethod
    def get_candles(
        self, 
        symbol: str, 
        timeframe: str, 
        count: int,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """
        Get historical candles.
        
        Returns DataFrame with columns: open, high, low, close, volume, timestamp
        """
        pass
    
    @abstractmethod
    def get_available_symbols(self) -> List[str]:
        """Get list of available trading symbols."""
        pass
    
    @abstractmethod
    def get_current_price(self, symbol: str) -> float:
        """Get current price for a symbol."""
        pass
    
    def normalize_timeframe(self, timeframe: str) -> int:
        """Convert timeframe string to seconds."""
        timeframe_map = {
            '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
            '1h': 3600, '4h': 14400, '1d': 86400,
            'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
            'H1': 3600, 'H4': 14400, 'D1': 86400,
        }
        return timeframe_map.get(timeframe, 300)
    
    def candles_to_dataframe(self, candles: List[Dict]) -> pd.DataFrame:
        """Convert candle list to normalized DataFrame."""
        if not candles:
            return pd.DataFrame()
        
        df = pd.DataFrame(candles)
        
        # Normalize column names
        column_mapping = {
            'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume',
            'max': 'high', 'min': 'low',
            'Open': 'open', 'High': 'high', 'Low': 'low', 'Close': 'close', 
            'Volume': 'volume', 'from': 'timestamp', 'at': 'timestamp',
            'time': 'timestamp', 'tick_volume': 'volume'
        }
        df.rename(columns=column_mapping, inplace=True)
        
        # Ensure required columns
        required = ['open', 'high', 'low', 'close']
        for col in required:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Add volume if missing
        if 'volume' not in df.columns:
            df['volume'] = 0
        
        # Convert to numeric
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        return df


class IQOptionDataProvider(DataProvider):
    """Data provider for IQ Option platform."""
    
    platform_name = "iqoption"
    
    def __init__(self):
        self.api = None
        self._connected = False

    def attach_session(self, api, account_type: Optional[str] = None) -> bool:
        try:
            self.api = api
            self._connected = bool(self.api and self.api.check_connect())
            if self._connected and account_type:
                try:
                    self.api.change_balance(account_type)
                except Exception:
                    pass
            return self._connected
        except Exception as e:
            logger.error(f"IQ Option attach session error: {e}")
            self.api = None
            self._connected = False
            return False
    
    def connect(self, credentials: Dict) -> bool:
        """Connect to IQ Option."""
        try:
            from iqoptionapi.stable_api import IQ_Option
            
            email = credentials.get('email') or credentials.get('username')
            password = credentials.get('password')
            
            self.api = IQ_Option(email, password)
            check, reason = self.api.connect()
            
            if check:
                self._connected = True
                account_type = credentials.get('account_type', 'PRACTICE')
                self.api.change_balance(account_type)
                logger.info(f"IQ Option connected: {account_type}")
                return True
            else:
                logger.error(f"IQ Option connection failed: {reason}")
                return False
                
        except Exception as e:
            logger.error(f"IQ Option connection error: {e}")
            return False
    
    def disconnect(self) -> bool:
        """Disconnect from IQ Option."""
        try:
            if self.api:
                self.api.api.close()
            self._connected = False
            return True
        except Exception as e:
            logger.error(f"IQ Option disconnect error: {e}")
            return False
    
    def is_connected(self) -> bool:
        """Check connection status."""
        if not self.api:
            return False
        try:
            return self.api.check_connect()
        except:
            return False
    
    def get_candles(
        self, 
        symbol: str, 
        timeframe: str, 
        count: int,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get candles from IQ Option."""
        if not self.is_connected():
            raise ConnectionError("Not connected to IQ Option")
        
        try:
            interval = self.normalize_timeframe(timeframe)
            end_from = end_time.timestamp() if end_time else time.time()
            
            candles = self.api.get_candles(symbol, interval, count, end_from)
            
            if not candles:
                return pd.DataFrame()
            
            return self.candles_to_dataframe(candles)
            
        except Exception as e:
            logger.error(f"Error getting IQ Option candles: {e}")
            return pd.DataFrame()
    
    def get_available_symbols(self) -> List[str]:
        """Get available assets from IQ Option."""
        if not self.is_connected():
            return []
        
        try:
            all_assets = self.api.get_all_open_time()
            symbols = []
            
            for asset_type in ['binary', 'turbo', 'digital']:
                if asset_type in all_assets:
                    for asset, data in all_assets[asset_type].items():
                        if data.get('open'):
                            symbols.append(asset)
            
            return list(set(symbols))
        except Exception as e:
            logger.error(f"Error getting IQ Option symbols: {e}")
            return []
    
    def get_current_price(self, symbol: str) -> float:
        """Get current price from IQ Option."""
        if not self.is_connected():
            return 0.0
        
        try:
            candles = self.api.get_candles(symbol, 60, 1, time.time())
            if candles:
                return candles[-1].get('close', candles[-1].get('c', 0))
            return 0.0
        except Exception as e:
            logger.error(f"Error getting IQ Option price: {e}")
            return 0.0


class MT5DataProvider(DataProvider):
    """Data provider for MetaTrader 5 platform."""
    
    platform_name = "mt5"
    
    # MT5 Timeframe mapping
    TIMEFRAMES = {
        '1m': 1, 'M1': 1,
        '5m': 5, 'M5': 5,
        '15m': 15, 'M15': 15,
        '30m': 30, 'M30': 30,
        '1h': 16385, 'H1': 16385,
        '4h': 16388, 'H4': 16388,
        '1d': 16408, 'D1': 16408,
    }
    
    def __init__(self):
        self.mt5 = None
        self._connected = False
    
    def connect(self, credentials: Dict) -> bool:
        """Connect to MetaTrader 5."""
        try:
            import MetaTrader5 as mt5
            self.mt5 = mt5
            
            # Initialize MT5
            if not mt5.initialize():
                logger.error("MT5 initialization failed")
                return False
            
            login = int(credentials.get('login', 0))
            password = credentials.get('password', '')
            server = credentials.get('server', '')
            
            if login and password and server:
                authorized = mt5.login(login, password=password, server=server)
                if not authorized:
                    logger.error(f"MT5 login failed: {mt5.last_error()}")
                    return False
            
            self._connected = True
            logger.info("MT5 connected successfully")
            return True
            
        except ImportError:
            logger.error("MetaTrader5 module not installed")
            return False
        except Exception as e:
            logger.error(f"MT5 connection error: {e}")
            return False
    
    def disconnect(self) -> bool:
        """Disconnect from MT5."""
        try:
            if self.mt5:
                self.mt5.shutdown()
            self._connected = False
            return True
        except Exception as e:
            logger.error(f"MT5 disconnect error: {e}")
            return False
    
    def is_connected(self) -> bool:
        """Check MT5 connection."""
        if not self.mt5 or not self._connected:
            return False
        try:
            info = self.mt5.terminal_info()
            return info is not None
        except:
            return False
    
    def get_candles(
        self, 
        symbol: str, 
        timeframe: str, 
        count: int,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get candles from MT5."""
        if not self.is_connected():
            raise ConnectionError("Not connected to MT5")
        
        try:
            tf = self.TIMEFRAMES.get(timeframe, 5)
            
            if end_time:
                rates = self.mt5.copy_rates_from(symbol, tf, end_time, count)
            else:
                rates = self.mt5.copy_rates_from_pos(symbol, tf, 0, count)
            
            if rates is None or len(rates) == 0:
                return pd.DataFrame()
            
            df = pd.DataFrame(rates)
            df['timestamp'] = pd.to_datetime(df['time'], unit='s')
            
            return self.candles_to_dataframe(df.to_dict('records'))
            
        except Exception as e:
            logger.error(f"Error getting MT5 candles: {e}")
            return pd.DataFrame()
    
    def get_available_symbols(self) -> List[str]:
        """Get available symbols from MT5."""
        if not self.is_connected():
            return []
        
        try:
            symbols = self.mt5.symbols_get()
            if symbols:
                return [s.name for s in symbols if s.visible]
            return []
        except Exception as e:
            logger.error(f"Error getting MT5 symbols: {e}")
            return []
    
    def get_current_price(self, symbol: str) -> float:
        """Get current price from MT5."""
        if not self.is_connected():
            return 0.0
        
        try:
            tick = self.mt5.symbol_info_tick(symbol)
            if tick:
                return tick.ask
            return 0.0
        except Exception as e:
            logger.error(f"Error getting MT5 price: {e}")
            return 0.0


class DemoDataProvider(DataProvider):
    """Demo data provider for testing without real connections."""
    
    platform_name = "demo"
    
    def __init__(self):
        self._connected = False
        self._base_price = 1.1000
    
    def connect(self, credentials: Dict) -> bool:
        self._connected = True
        return True
    
    def disconnect(self) -> bool:
        self._connected = False
        return True
    
    def is_connected(self) -> bool:
        return self._connected
    
    def get_candles(
        self, 
        symbol: str, 
        timeframe: str, 
        count: int,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Generate demo candles."""
        import random
        
        candles = []
        price = self._base_price
        interval = self.normalize_timeframe(timeframe)
        
        end = end_time or datetime.now()
        
        for i in range(count):
            timestamp = end - timedelta(seconds=interval * (count - i))
            
            change = random.gauss(0.0001, 0.002)
            open_price = price
            close_price = price + change
            high_price = max(open_price, close_price) + abs(random.gauss(0, 0.001))
            low_price = min(open_price, close_price) - abs(random.gauss(0, 0.001))
            volume = random.randint(1000, 10000)
            
            candles.append({
                'open': round(open_price, 5),
                'high': round(high_price, 5),
                'low': round(low_price, 5),
                'close': round(close_price, 5),
                'volume': volume,
                'timestamp': int(timestamp.timestamp())
            })
            
            price = close_price
        
        return self.candles_to_dataframe(candles)
    
    def get_available_symbols(self) -> List[str]:
        return [
            'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
            'EURJPY', 'GBPJPY', 'EURGBP', 'NZDUSD', 'USDCHF'
        ]
    
    def get_current_price(self, symbol: str) -> float:
        return self._base_price + np.random.normal(0, 0.001)
