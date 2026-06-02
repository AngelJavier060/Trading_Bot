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
        self._training_feature_names: List[str] = []  # Saved from last training for consistency
    
    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create all features from OHLCV data.
        
        Uses pd.concat to build features to avoid fragmentation PerformanceWarning.
        
        Args:
            df: DataFrame with columns: open, high, low, close, volume
            
        Returns:
            DataFrame with all features added
        """
        # Ensure required columns
        required = ['open', 'high', 'low', 'close']
        for col in required:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")
        
        # Build all feature columns as a list of Series, then concat at the end
        feature_series = {}
        
        # Add volume if missing
        if 'volume' not in df.columns:
            df_copy = df.copy()
            df_copy['volume'] = 0
        else:
            df_copy = df.copy()
        
        # Create features
        if self.config.use_returns:
            feature_series.update(self._add_return_features(df_copy))
        
        if self.config.use_sma or self.config.use_ema:
            feature_series.update(self._add_ma_features(df_copy))
        
        if self.config.use_rsi:
            feature_series.update(self._add_rsi_features(df_copy))
        
        if self.config.use_macd:
            feature_series.update(self._add_macd_features(df_copy))
        
        if self.config.use_stochastic:
            feature_series.update(self._add_stochastic_features(df_copy))
        
        if self.config.use_atr:
            feature_series.update(self._add_atr_features(df_copy))
        
        if self.config.use_bollinger:
            feature_series.update(self._add_bollinger_features(df_copy))
        
        if self.config.use_volume_features:
            feature_series.update(self._add_volume_features(df_copy))
        
        if self.config.use_time_features:
            feature_series.update(self._add_time_features(df_copy))
        
        if self.config.use_lag_features:
            feature_series.update(self._add_lag_features(df_copy))
        
        # Add candlestick patterns
        feature_series.update(self._add_candlestick_patterns(df_copy))
        
        # Add price action features
        feature_series.update(self._add_price_action_features(df_copy))
        
        # Concat all features at once to avoid fragmentation
        if feature_series:
            features_df = pd.concat(feature_series, axis=1)
            # Avoid duplicate column names
            features_df = features_df.loc[:, ~features_df.columns.duplicated()]
            df_result = pd.concat([df_copy, features_df], axis=1)
        else:
            df_result = df_copy
        
        # Store feature names
        self.feature_names = [col for col in df_result.columns 
                             if col not in ['open', 'high', 'low', 'close', 'volume', 'timestamp', 'target']]
        # Deduplicate
        self.feature_names = list(dict.fromkeys(self.feature_names))
        
        return df_result
    
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
        
        # Save training feature names for prediction use
        self._training_feature_names = list(feature_cols)
        
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
        """Prepare data for prediction (no target needed).

        
        Uses training feature names to ensure column count consistency.
        Missing features are filled with 0.
        """
        df = self.create_features(df)
        
        # Use training feature names for consistency
        use_features = self._training_feature_names if self._training_feature_names else self.feature_names
        
        # Ensure all training features exist in prediction data
        for col in use_features:
            if col not in df.columns:
                df[col] = 0.0
        
        # Remove any extra columns not in training
        extra_cols = [c for c in self.feature_names if c not in use_features]
        if extra_cols:
            df = df.drop(columns=extra_cols)
        
        df = df.dropna()
        
        if len(df) == 0:
            return np.array([]).reshape(0, len(use_features))
        
        X = df[use_features].values
        
        if self.scaler:
            X = self.scaler.transform(X)
        
        return X
    
    def _add_return_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add return-based features."""

        result = {}
        for period in self.config.return_periods:
            result[f'return_{period}'] = df['close'].pct_change(period)
            
            if self.config.use_log_returns:
                result[f'log_return_{period}'] = np.log(df['close'] / df['close'].shift(period))
        
        # Cumulative returns
        result['cum_return_5'] = df['close'].pct_change(5).rolling(5).sum()
        result['cum_return_10'] = df['close'].pct_change(10).rolling(10).sum()
        
        return result
    
    def _add_ma_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add moving average features."""

        result = {}
        for period in self.config.ma_periods:
            if self.config.use_sma:
                sma_series = df['close'].rolling(window=period).mean()
                result[f'sma_{period}'] = sma_series
                result[f'sma_{period}_dist'] = (df['close'] - sma_series) / df['close']
            
            if self.config.use_ema:
                ema_series = df['close'].ewm(span=period, adjust=False).mean()
                result[f'ema_{period}'] = ema_series
                result[f'ema_{period}_dist'] = (df['close'] - ema_series) / df['close']
        
        # MA crossovers
        if len(self.config.ma_periods) >= 2:
            short_ma = self.config.ma_periods[0]
            long_ma = self.config.ma_periods[-1]
            sma_short = df['close'].rolling(window=short_ma).mean()
            sma_long = df['close'].rolling(window=long_ma).mean()
            result['ma_cross'] = (sma_short > sma_long).astype(int)
            result['ma_diff'] = sma_short - sma_long
        
        return result
    
    def _add_rsi_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add RSI features."""

        result = {}
        rsi_series = {}
        for period in [7, 14, 21]:
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / loss.replace(0, np.nan)
            rsi = 100 - (100 / (1 + rs))
            rsi_name = f'rsi_{period}'
            result[rsi_name] = rsi
            rsi_series[period] = rsi
        
        # RSI zones (use rsi_14 if available, else rsi_7)
        rsi_main = rsi_series.get(14, rsi_series.get(7, rsi_series.get(21, pd.Series(index=df.index, dtype=float))))
        result['rsi_14_oversold'] = (rsi_main < 30).astype(int)
        result['rsi_14_overbought'] = (rsi_main > 70).astype(int)
        result['rsi_14_momentum'] = rsi_main.diff(3)
        
        return result
    
    def _add_macd_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add MACD features."""

        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        
        result = {}
        result['macd'] = ema12 - ema26
        result['macd_signal'] = result['macd'].ewm(span=9, adjust=False).mean()
        result['macd_histogram'] = result['macd'] - result['macd_signal']
        
        # MACD signals
        result['macd_cross'] = (result['macd'] > result['macd_signal']).astype(int)
        result['macd_above_zero'] = (result['macd'] > 0).astype(int)
        result['macd_momentum'] = result['macd_histogram'].diff(3)
        
        return result
    
    def _add_stochastic_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add Stochastic Oscillator features."""

        result = {}
        for period in [14, 21]:
            lowest_low = df['low'].rolling(window=period).min()
            highest_high = df['high'].rolling(window=period).max()
            
            k_line = 100 * ((df['close'] - lowest_low) / (highest_high - lowest_low))
            result[f'stoch_k_{period}'] = k_line
            result[f'stoch_d_{period}'] = k_line.rolling(window=3).mean()
        
        # Stochastic signals
        stoch_k_14 = result.get('stoch_k_14', pd.Series(index=df.index, dtype=float))
        result['stoch_oversold'] = (stoch_k_14 < 20).astype(int)
        result['stoch_overbought'] = (stoch_k_14 > 80).astype(int)
        
        return result
    
    def _add_atr_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add ATR (Average True Range) features."""

        result = {}
        for period in [7, 14, 21]:
            high_low = df['high'] - df['low']
            high_close = np.abs(df['high'] - df['close'].shift())
            low_close = np.abs(df['low'] - df['close'].shift())
            
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            result[f'atr_{period}'] = tr.rolling(window=period).mean()
        
        # Normalized ATR
        atr_14 = result.get('atr_14', pd.Series(index=df.index, dtype=float))
        result['atr_pct'] = atr_14 / df['close'] * 100
        
        return result
    
    def _add_bollinger_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add Bollinger Bands features."""

        result = {}
        for period in [20]:
            sma = df['close'].rolling(window=period).mean()
            std = df['close'].rolling(window=period).std()
            
            result[f'bb_upper_{period}'] = sma + (std * 2)
            result[f'bb_lower_{period}'] = sma - (std * 2)
            result[f'bb_middle_{period}'] = sma
            result[f'bb_width_{period}'] = (result[f'bb_upper_{period}'] - result[f'bb_lower_{period}']) / sma
            result[f'bb_position_{period}'] = (df['close'] - result[f'bb_lower_{period}']) / (result[f'bb_upper_{period}'] - result[f'bb_lower_{period}'])
        
        # BB signals
        bb_width = result.get('bb_width_20', pd.Series(index=df.index, dtype=float))
        result['bb_squeeze'] = (bb_width < bb_width.rolling(20).mean()).astype(int)
        
        return result
    
    def _add_volume_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add volume-based features."""

        result = {}
        vol = df['volume'].copy()
        if vol.sum() == 0:
            # If no volume data, use simulated volume (deterministic)
            np.random.seed(42)
            vol = pd.Series(np.random.randint(1000, 10000, len(df)), index=df.index)
        
        # Volume moving averages
        result['volume_sma_10'] = vol.rolling(window=10).mean()
        result['volume_sma_20'] = vol.rolling(window=20).mean()
        
        # Volume ratio
        vol_sma_20 = result['volume_sma_20']
        result['volume_ratio'] = vol / vol_sma_20.replace(0, np.nan)
        
        # On Balance Volume
        obv = (np.sign(df['close'].diff()) * vol).cumsum()
        result['obv'] = obv
        result['obv_sma'] = obv.rolling(window=20).mean()
        
        # Volume Price Trend
        result['vpt'] = (df['close'].pct_change() * vol).cumsum()
        
        return result
    
    def _add_time_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add time-based features."""

        result = {}
        if 'timestamp' in df.columns:
            try:
                if df['timestamp'].dtype in ['int64', 'float64']:
                    dt = pd.to_datetime(df['timestamp'], unit='s')
                else:
                    dt = pd.to_datetime(df['timestamp'])
                
                result['hour'] = dt.dt.hour
                result['day_of_week'] = dt.dt.dayofweek
                result['is_london_session'] = ((dt.dt.hour >= 8) & (dt.dt.hour < 16)).astype(int)
                result['is_ny_session'] = ((dt.dt.hour >= 13) & (dt.dt.hour < 21)).astype(int)
                result['is_overlap'] = ((dt.dt.hour >= 13) & (dt.dt.hour < 16)).astype(int)
            except Exception:
                pass
        
        return result
    
    def _add_lag_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add lagged features."""

        result = {}
        close = df['close']
        
        # Compute rsi_14 directly if needed for lag features
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi_14 = 100 - (100 / (1 + rs))
        
        for lag in self.config.lag_periods:
            result[f'close_lag_{lag}'] = close.shift(lag)
            result[f'return_lag_{lag}'] = close.pct_change().shift(lag)
            result[f'rsi_lag_{lag}'] = rsi_14.shift(lag)
        
        return result
    
    def _add_candlestick_patterns(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add candlestick pattern features."""

        result = {}
        open_p = df['open']
        close_p = df['close']
        high_p = df['high']
        low_p = df['low']
        
        # Candle body and wicks
        candle_body = close_p - open_p
        result['candle_body'] = candle_body
        result['candle_body_pct'] = candle_body / open_p * 100
        result['upper_wick'] = high_p - pd.concat([open_p, close_p], axis=1).max(axis=1)
        result['lower_wick'] = pd.concat([open_p, close_p], axis=1).min(axis=1) - low_p
        result['candle_range'] = high_p - low_p
        
        # Candle direction
        result['is_bullish'] = (close_p > open_p).astype(int)
        
        # Doji pattern
        result['is_doji'] = (candle_body.abs() < (high_p - low_p) * 0.1).astype(int)
        
        # Hammer pattern
        result['is_hammer'] = (
            (result['lower_wick'] > candle_body.abs() * 2) &
            (result['upper_wick'] < candle_body.abs() * 0.5)
        ).astype(int)
        
        # Engulfing pattern
        prev_body = candle_body.shift(1)
        result['is_bullish_engulfing'] = (
            (result['is_bullish'] == 1) &
            (prev_body < 0) &
            (candle_body > prev_body.abs())
        ).astype(int)
        
        result['is_bearish_engulfing'] = (
            (result['is_bullish'] == 0) &
            (prev_body > 0) &
            (candle_body.abs() > prev_body)
        ).astype(int)
        
        return result
    
    def _add_price_action_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Add price action features."""

        result = {}
        close_p = df['close']
        high_p = df['high']
        low_p = df['low']
        
        # Higher highs / Lower lows
        result['higher_high'] = (high_p > high_p.shift(1)).astype(int)
        result['lower_low'] = (low_p < low_p.shift(1)).astype(int)
        
        # Consecutive patterns
        is_bullish = (close_p > df['open']).astype(int)
        result['consecutive_up'] = is_bullish.rolling(3).sum()
        result['consecutive_down'] = (1 - is_bullish).rolling(3).sum()
        
        # Support/Resistance levels
        result['near_high_20'] = (high_p.rolling(20).max() - close_p) / close_p * 100
        result['near_low_20'] = (close_p - low_p.rolling(20).min()) / close_p * 100
        
        # Price momentum
        result['momentum_5'] = close_p - close_p.shift(5)
        result['momentum_10'] = close_p - close_p.shift(10)
        
        # Rate of change
        result['roc_5'] = (close_p - close_p.shift(5)) / close_p.shift(5) * 100
        result['roc_10'] = (close_p - close_p.shift(10)) / close_p.shift(10) * 100
        
        return result
    
    def get_feature_importance_names(self, importance_values: np.ndarray) -> List[Dict]:
        """Get feature names with their importance values."""
        importance_list = []
        for name, value in zip(self.feature_names, importance_values):
            importance_list.append({
                'feature': name,
                'importance': float(value)
            })
        
        return sorted(importance_list, key=lambda x: x['importance'], reverse=True)
