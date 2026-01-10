"""
Base Strategy Class
====================
Abstract base class for all trading strategies with XAI support.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import pandas as pd
import numpy as np
from datetime import datetime


class SignalType(Enum):
    CALL = "call"
    PUT = "put"
    NONE = "none"


@dataclass
class IndicatorValue:
    """Represents a calculated indicator value."""
    name: str
    value: float
    description: str = ""


@dataclass
class SignalReason:
    """Explains why a signal was generated."""
    indicator: str
    condition: str
    value: float
    threshold: float
    met: bool
    weight: float = 1.0
    
    def to_dict(self) -> Dict:
        return {
            'indicator': self.indicator,
            'condition': self.condition,
            'value': round(self.value, 4),
            'threshold': round(self.threshold, 4),
            'met': self.met,
            'weight': self.weight
        }


@dataclass
class TradingSignal:
    """Complete trading signal with explainability."""
    signal: SignalType
    confidence: float
    indicators: Dict[str, float]
    reasons: List[SignalReason]
    timestamp: datetime = field(default_factory=datetime.now)
    strategy_name: str = ""
    asset: str = ""
    timeframe: str = ""
    
    def to_dict(self) -> Dict:
        return {
            'signal': self.signal.value,
            'confidence': round(self.confidence, 2),
            'indicators': {k: round(v, 4) if isinstance(v, float) else v 
                          for k, v in self.indicators.items()},
            'reasons': [r.to_dict() for r in self.reasons],
            'timestamp': self.timestamp.isoformat(),
            'strategy_name': self.strategy_name,
            'asset': self.asset,
            'timeframe': self.timeframe,
            'explanation': self.generate_explanation()
        }
    
    def generate_explanation(self) -> str:
        """Generate human-readable explanation of the signal."""
        if self.signal == SignalType.NONE:
            return "No hay señal clara. Condiciones del mercado inciertas."
        
        direction = "COMPRA (CALL)" if self.signal == SignalType.CALL else "VENTA (PUT)"
        met_reasons = [r for r in self.reasons if r.met]
        
        explanation_parts = [f"Señal de {direction} con {self.confidence}% de confianza."]
        explanation_parts.append(f"Estrategia: {self.strategy_name}")
        explanation_parts.append("Razones:")
        
        for reason in met_reasons:
            explanation_parts.append(f"  • {reason.indicator}: {reason.condition}")
        
        return "\n".join(explanation_parts)


class BaseStrategy(ABC):
    """
    Abstract base class for trading strategies.
    All strategies must implement analyze() method.
    """
    
    name: str = "base"
    description: str = "Base strategy"
    version: str = "1.0.0"
    min_candles: int = 50
    
    def __init__(self, params: Optional[Dict] = None):
        self.params = params or self.default_params()
        self._validate_params()
    
    @abstractmethod
    def default_params(self) -> Dict:
        """Return default parameters for the strategy."""
        pass
    
    @abstractmethod
    def analyze(self, candles: List[Dict]) -> TradingSignal:
        """
        Analyze candles and generate trading signal.
        
        Args:
            candles: List of OHLCV candles
            
        Returns:
            TradingSignal with signal, confidence, and explanations
        """
        pass
    
    def _validate_params(self):
        """Validate strategy parameters."""
        pass
    
    def candles_to_df(self, candles: List[Dict]) -> pd.DataFrame:
        """Convert candles list to pandas DataFrame."""
        df = pd.DataFrame(candles)
        
        # Normalize column names
        column_mapping = {
            'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume',
            'Open': 'open', 'High': 'high', 'Low': 'low', 'Close': 'close', 'Volume': 'volume'
        }
        df.rename(columns=column_mapping, inplace=True)
        
        # Ensure required columns exist
        for col in ['open', 'high', 'low', 'close']:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Convert to numeric
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        return df
    
    def calculate_ema(self, series: pd.Series, period: int) -> pd.Series:
        """Calculate Exponential Moving Average."""
        return series.ewm(span=period, adjust=False).mean()
    
    def calculate_sma(self, series: pd.Series, period: int) -> pd.Series:
        """Calculate Simple Moving Average."""
        return series.rolling(window=period).mean()
    
    def calculate_rsi(self, series: pd.Series, period: int = 14) -> pd.Series:
        """Calculate Relative Strength Index."""
        delta = series.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def calculate_macd(self, series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, pd.Series]:
        """Calculate MACD indicator."""
        ema_fast = self.calculate_ema(series, fast)
        ema_slow = self.calculate_ema(series, slow)
        macd_line = ema_fast - ema_slow
        signal_line = self.calculate_ema(macd_line, signal)
        histogram = macd_line - signal_line
        
        return {
            'macd': macd_line,
            'signal': signal_line,
            'histogram': histogram
        }
    
    def calculate_bollinger_bands(self, series: pd.Series, period: int = 20, std_dev: float = 2.0) -> Dict[str, pd.Series]:
        """Calculate Bollinger Bands."""
        sma = self.calculate_sma(series, period)
        std = series.rolling(window=period).std()
        
        return {
            'middle': sma,
            'upper': sma + (std * std_dev),
            'lower': sma - (std * std_dev),
            'bandwidth': ((sma + (std * std_dev)) - (sma - (std * std_dev))) / sma * 100
        }
    
    def calculate_atr(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        """Calculate Average True Range."""
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        atr = tr.rolling(window=period).mean()
        return atr
    
    def calculate_stochastic(self, df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> Dict[str, pd.Series]:
        """Calculate Stochastic Oscillator."""
        lowest_low = df['low'].rolling(window=k_period).min()
        highest_high = df['high'].rolling(window=k_period).max()
        
        k = 100 * ((df['close'] - lowest_low) / (highest_high - lowest_low))
        d = k.rolling(window=d_period).mean()
        
        return {'k': k, 'd': d}
    
    def get_info(self) -> Dict:
        """Get strategy information."""
        return {
            'name': self.name,
            'description': self.description,
            'version': self.version,
            'min_candles': self.min_candles,
            'params': self.params
        }
