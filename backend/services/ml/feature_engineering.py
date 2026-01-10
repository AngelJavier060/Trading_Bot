"""
Feature Engineering for Trading ML
===================================
Comprehensive feature extraction for machine learning models.
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class FeatureConfig:
    """Configuration for feature engineering."""
    # Price features
    use_returns: bool = True
    use_log_returns: bool = True
    return_periods: List[int] = None
    
    # Moving averages
    use_sma: bool = True
    use_ema: bool = True
    ma_periods: List[int] = None
    
    # Momentum indicators
    use_rsi: bool = True
    use_macd: bool = True
    use_stochastic: bool = True
    
    # Volatility indicators
    use_atr: bool = True
    use_bollinger: bool = True
    
    # Volume features
    use_volume_features: bool = True
    
    # Time features
    use_time_features: bool = True
    
    # Lag features
    use_lag_features: bool = True
    lag_periods: List[int] = None
    
    # Target configuration
    target_periods: int = 1
    target_type: str = 'direction'  # 'direction', 'returns', 'price'
    
    def __post_init__(self):
        if self.return_periods is None:
            self.return_periods = [1, 2, 3, 5, 10]
        if self.ma_periods is None:
            self.ma_periods = [5, 10, 20, 50, 100]
        if self.lag_periods is None:
            self.lag_periods = [1, 2, 3, 5]


class FeatureEngineer:
    """
    Professional feature engineering for trading ML models.
    
    Creates 100+ technical features from OHLCV data.
    """
    
    def __init__(self, config: Optional[FeatureConfig] = None):
        self.config = config or FeatureConfig()
        self.feature_names: List[str] = []
        self.scaler = None
    
    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create all features from OHLCV data.
        
        Args:
            df: DataFrame with columns: open, high, low, close, volume
            
        Returns:
            DataFrame with all features added
        """
        df = df.copy()
        
        # Ensure required columns
        required = ['open', 'high', 'low', 'close']
        for col in required:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Add volume if missing
        if 'volume' not in df.columns:
            df['volume'] = 0
        
        # Create features
        if self.config.use_returns:
            df = self._add_return_features(df)
        
        if self.config.use_sma or self.config.use_ema:
            df = self._add_ma_features(df)
        
        if self.config.use_rsi:
            df = self._add_rsi_features(df)
        
        if self.config.use_macd:
            df = self._add_macd_features(df)
        
        if self.config.use_stochastic:
            df = self._add_stochastic_features(df)
        
        if self.config.use_atr:
            df = self._add_atr_features(df)
        
        if self.config.use_bollinger:
            df = self._add_bollinger_features(df)
        
        if self.config.use_volume_features:
            df = self._add_volume_features(df)
        
        if self.config.use_time_features:
            df = self._add_time_features(df)
        
        if self.config.use_lag_features:
            df = self._add_lag_features(df)
        
        # Add candlestick patterns
        df = self._add_candlestick_patterns(df)
        
        # Add price action features
        df = self._add_price_action_features(df)
        
        # Store feature names
        self.feature_names = [col for col in df.columns 
                             if col not in ['open', 'high', 'low', 'close', 'volume', 'timestamp', 'target']]
        
        return df
    
    def create_target(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create target variable for ML training."""
        df = df.copy()
        
        if self.config.target_type == 'direction':
            # Binary classification: 1 if price goes up, 0 if down
            df['target'] = (df['close'].shift(-self.config.target_periods) > df['close']).astype(int)
        
        elif self.config.target_type == 'returns':
            # Regression: future returns
            df['target'] = df['close'].pct_change(self.config.target_periods).shift(-self.config.target_periods)
        
        elif self.config.target_type == 'price':
            # Regression: future price
            df['target'] = df['close'].shift(-self.config.target_periods)
        
        return df
    
    def prepare_ml_data(
        self, 
        df: pd.DataFrame,
        train_ratio: float = 0.8,
        scale: bool = True
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, List[str]]:
        """
        Prepare data for ML training.
        
        Returns:
            X_train, X_test, y_train, y_test, feature_names
        """
        # Create features and target
        df = self.create_features(df)
        df = self.create_target(df)
        
        # Drop NaN rows
        df = df.dropna()
        
        # Get feature columns
        feature_cols = self.feature_names
        
        # Split features and target
        X = df[feature_cols].values
        y = df['target'].values
        
        # Train/test split
        split_idx = int(len(X) * train_ratio)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]
        
        # Scale features
        if scale:
            from sklearn.preprocessing import StandardScaler
            self.scaler = StandardScaler()
            X_train = self.scaler.fit_transform(X_train)
            X_test = self.scaler.transform(X_test)
        
        return X_train, X_test, y_train, y_test, feature_cols
    
    def prepare_prediction_data(self, df: pd.DataFrame) -> np.ndarray:
        """Prepare data for prediction (no target needed)."""
        df = self.create_features(df)
        df = df.dropna()
        
        X = df[self.feature_names].values
        
        if self.scaler:
            X = self.scaler.transform(X)
        
        return X
    
    def _add_return_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add return-based features."""
        for period in self.config.return_periods:
            df[f'return_{period}'] = df['close'].pct_change(period)
            
            if self.config.use_log_returns:
                df[f'log_return_{period}'] = np.log(df['close'] / df['close'].shift(period))
        
        # Cumulative returns
        df['cum_return_5'] = df['close'].pct_change(5).rolling(5).sum()
        df['cum_return_10'] = df['close'].pct_change(10).rolling(10).sum()
        
        return df
    
    def _add_ma_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add moving average features."""
        for period in self.config.ma_periods:
            if self.config.use_sma:
                df[f'sma_{period}'] = df['close'].rolling(window=period).mean()
                df[f'sma_{period}_dist'] = (df['close'] - df[f'sma_{period}']) / df['close']
            
            if self.config.use_ema:
                df[f'ema_{period}'] = df['close'].ewm(span=period, adjust=False).mean()
                df[f'ema_{period}_dist'] = (df['close'] - df[f'ema_{period}']) / df['close']
        
        # MA crossovers
        if len(self.config.ma_periods) >= 2:
            short_ma = self.config.ma_periods[0]
            long_ma = self.config.ma_periods[-1]
            df['ma_cross'] = (df[f'sma_{short_ma}'] > df[f'sma_{long_ma}']).astype(int)
            df['ma_diff'] = df[f'sma_{short_ma}'] - df[f'sma_{long_ma}']
        
        return df
    
    def _add_rsi_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add RSI features."""
        for period in [7, 14, 21]:
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / loss
            df[f'rsi_{period}'] = 100 - (100 / (1 + rs))
        
        # RSI zones
        df['rsi_14_oversold'] = (df['rsi_14'] < 30).astype(int)
        df['rsi_14_overbought'] = (df['rsi_14'] > 70).astype(int)
        df['rsi_14_momentum'] = df['rsi_14'].diff(3)
        
        return df
    
    def _add_macd_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add MACD features."""
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']
        
        # MACD signals
        df['macd_cross'] = (df['macd'] > df['macd_signal']).astype(int)
        df['macd_above_zero'] = (df['macd'] > 0).astype(int)
        df['macd_momentum'] = df['macd_histogram'].diff(3)
        
        return df
    
    def _add_stochastic_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add Stochastic Oscillator features."""
        for period in [14, 21]:
            lowest_low = df['low'].rolling(window=period).min()
            highest_high = df['high'].rolling(window=period).max()
            
            df[f'stoch_k_{period}'] = 100 * ((df['close'] - lowest_low) / (highest_high - lowest_low))
            df[f'stoch_d_{period}'] = df[f'stoch_k_{period}'].rolling(window=3).mean()
        
        # Stochastic signals
        df['stoch_oversold'] = (df['stoch_k_14'] < 20).astype(int)
        df['stoch_overbought'] = (df['stoch_k_14'] > 80).astype(int)
        
        return df
    
    def _add_atr_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add ATR (Average True Range) features."""
        for period in [7, 14, 21]:
            high_low = df['high'] - df['low']
            high_close = np.abs(df['high'] - df['close'].shift())
            low_close = np.abs(df['low'] - df['close'].shift())
            
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            df[f'atr_{period}'] = tr.rolling(window=period).mean()
        
        # Normalized ATR
        df['atr_pct'] = df['atr_14'] / df['close'] * 100
        
        return df
    
    def _add_bollinger_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add Bollinger Bands features."""
        for period in [20]:
            sma = df['close'].rolling(window=period).mean()
            std = df['close'].rolling(window=period).std()
            
            df[f'bb_upper_{period}'] = sma + (std * 2)
            df[f'bb_lower_{period}'] = sma - (std * 2)
            df[f'bb_middle_{period}'] = sma
            df[f'bb_width_{period}'] = (df[f'bb_upper_{period}'] - df[f'bb_lower_{period}']) / sma
            df[f'bb_position_{period}'] = (df['close'] - df[f'bb_lower_{period}']) / (df[f'bb_upper_{period}'] - df[f'bb_lower_{period}'])
        
        # BB signals
        df['bb_squeeze'] = (df['bb_width_20'] < df['bb_width_20'].rolling(20).mean()).astype(int)
        
        return df
    
    def _add_volume_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add volume-based features."""
        if df['volume'].sum() == 0:
            # If no volume data, use simulated volume
            df['volume'] = np.random.randint(1000, 10000, len(df))
        
        # Volume moving averages
        df['volume_sma_10'] = df['volume'].rolling(window=10).mean()
        df['volume_sma_20'] = df['volume'].rolling(window=20).mean()
        
        # Volume ratio
        df['volume_ratio'] = df['volume'] / df['volume_sma_20']
        
        # On Balance Volume
        df['obv'] = (np.sign(df['close'].diff()) * df['volume']).cumsum()
        df['obv_sma'] = df['obv'].rolling(window=20).mean()
        
        # Volume Price Trend
        df['vpt'] = (df['close'].pct_change() * df['volume']).cumsum()
        
        return df
    
    def _add_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add time-based features."""
        if 'timestamp' in df.columns:
            try:
                if df['timestamp'].dtype in ['int64', 'float64']:
                    dt = pd.to_datetime(df['timestamp'], unit='s')
                else:
                    dt = pd.to_datetime(df['timestamp'])
                
                df['hour'] = dt.dt.hour
                df['day_of_week'] = dt.dt.dayofweek
                df['is_london_session'] = ((df['hour'] >= 8) & (df['hour'] < 16)).astype(int)
                df['is_ny_session'] = ((df['hour'] >= 13) & (df['hour'] < 21)).astype(int)
                df['is_overlap'] = ((df['hour'] >= 13) & (df['hour'] < 16)).astype(int)
            except:
                pass
        
        return df
    
    def _add_lag_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add lagged features."""
        for lag in self.config.lag_periods:
            df[f'close_lag_{lag}'] = df['close'].shift(lag)
            df[f'return_lag_{lag}'] = df['close'].pct_change().shift(lag)
            df[f'rsi_lag_{lag}'] = df.get('rsi_14', df['close']).shift(lag)
        
        return df
    
    def _add_candlestick_patterns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add candlestick pattern features."""
        # Candle body and wicks
        df['candle_body'] = df['close'] - df['open']
        df['candle_body_pct'] = df['candle_body'] / df['open'] * 100
        df['upper_wick'] = df['high'] - df[['open', 'close']].max(axis=1)
        df['lower_wick'] = df[['open', 'close']].min(axis=1) - df['low']
        df['candle_range'] = df['high'] - df['low']
        
        # Candle direction
        df['is_bullish'] = (df['close'] > df['open']).astype(int)
        
        # Doji pattern
        df['is_doji'] = (np.abs(df['candle_body']) < df['candle_range'] * 0.1).astype(int)
        
        # Hammer pattern
        df['is_hammer'] = (
            (df['lower_wick'] > df['candle_body'].abs() * 2) &
            (df['upper_wick'] < df['candle_body'].abs() * 0.5)
        ).astype(int)
        
        # Engulfing pattern
        prev_body = df['candle_body'].shift(1)
        df['is_bullish_engulfing'] = (
            (df['is_bullish'] == 1) &
            (prev_body < 0) &
            (df['candle_body'] > prev_body.abs())
        ).astype(int)
        
        df['is_bearish_engulfing'] = (
            (df['is_bullish'] == 0) &
            (prev_body > 0) &
            (df['candle_body'].abs() > prev_body)
        ).astype(int)
        
        return df
    
    def _add_price_action_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add price action features."""
        # Higher highs / Lower lows
        df['higher_high'] = (df['high'] > df['high'].shift(1)).astype(int)
        df['lower_low'] = (df['low'] < df['low'].shift(1)).astype(int)
        
        # Consecutive patterns
        df['consecutive_up'] = df['is_bullish'].rolling(3).sum()
        df['consecutive_down'] = (1 - df['is_bullish']).rolling(3).sum()
        
        # Support/Resistance levels
        df['near_high_20'] = (df['high'].rolling(20).max() - df['close']) / df['close'] * 100
        df['near_low_20'] = (df['close'] - df['low'].rolling(20).min()) / df['close'] * 100
        
        # Price momentum
        df['momentum_5'] = df['close'] - df['close'].shift(5)
        df['momentum_10'] = df['close'] - df['close'].shift(10)
        
        # Rate of change
        df['roc_5'] = (df['close'] - df['close'].shift(5)) / df['close'].shift(5) * 100
        df['roc_10'] = (df['close'] - df['close'].shift(10)) / df['close'].shift(10) * 100
        
        return df
    
    def get_feature_importance_names(self, importance_values: np.ndarray) -> List[Dict]:
        """Get feature names with their importance values."""
        importance_list = []
        for name, value in zip(self.feature_names, importance_values):
            importance_list.append({
                'feature': name,
                'importance': float(value)
            })
        
        return sorted(importance_list, key=lambda x: x['importance'], reverse=True)
