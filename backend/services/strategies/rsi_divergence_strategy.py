"""
RSI Divergence Strategy
=======================
Professional RSI divergence detection with price action confirmation.
"""

from typing import Dict, List, Tuple, Optional
import pandas as pd
import numpy as np
from .base_strategy import BaseStrategy, TradingSignal, SignalType, SignalReason


class RsiDivergenceStrategy(BaseStrategy):
    """
    RSI Divergence Strategy.
    
    Detects:
    - Bullish Divergence: Price makes lower low, RSI makes higher low
    - Bearish Divergence: Price makes higher high, RSI makes lower high
    - Hidden Divergences for trend continuation
    
    Enhanced with:
    - Multi-period divergence scanning
    - Strength classification
    - Price action confirmation
    """
    
    name = "rsi_divergence"
    description = "RSI Divergence Strategy - Reversal detection with divergence analysis"
    version = "2.0.0"
    min_candles = 50
    
    def default_params(self) -> Dict:
        return {
            'rsi_period': 14,
            'lookback_periods': 20,  # How far back to look for divergences
            'min_divergence_bars': 5,  # Minimum bars between pivots
            'rsi_overbought': 70,
            'rsi_oversold': 30,
            'pivot_threshold': 0.001,  # 0.1% threshold for pivot detection
        }
    
    def find_pivots(self, series: pd.Series, window: int = 5) -> Tuple[List[int], List[int]]:
        """Find pivot highs and lows in a series."""
        pivot_highs = []
        pivot_lows = []
        
        for i in range(window, len(series) - window):
            # Check for pivot high
            if all(series.iloc[i] > series.iloc[i-j] for j in range(1, window+1)) and \
               all(series.iloc[i] > series.iloc[i+j] for j in range(1, window+1)):
                pivot_highs.append(i)
            
            # Check for pivot low
            if all(series.iloc[i] < series.iloc[i-j] for j in range(1, window+1)) and \
               all(series.iloc[i] < series.iloc[i+j] for j in range(1, window+1)):
                pivot_lows.append(i)
        
        return pivot_highs, pivot_lows
    
    def detect_bullish_divergence(self, df: pd.DataFrame, pivot_lows: List[int]) -> Optional[Dict]:
        """Detect bullish divergence (price lower low, RSI higher low)."""
        if len(pivot_lows) < 2:
            return None
        
        # Get the two most recent pivot lows
        recent_pivots = pivot_lows[-2:]
        idx1, idx2 = recent_pivots[0], recent_pivots[1]
        
        # Check minimum distance
        if idx2 - idx1 < self.params['min_divergence_bars']:
            return None
        
        price1, price2 = df['close'].iloc[idx1], df['close'].iloc[idx2]
        rsi1, rsi2 = df['rsi'].iloc[idx1], df['rsi'].iloc[idx2]
        
        # Bullish divergence: price makes lower low, RSI makes higher low
        if price2 < price1 and rsi2 > rsi1:
            strength = abs(rsi2 - rsi1) / rsi1 * 100
            return {
                'type': 'bullish',
                'price_pivot1': price1,
                'price_pivot2': price2,
                'rsi_pivot1': rsi1,
                'rsi_pivot2': rsi2,
                'bars_apart': idx2 - idx1,
                'strength': strength
            }
        
        return None
    
    def detect_bearish_divergence(self, df: pd.DataFrame, pivot_highs: List[int]) -> Optional[Dict]:
        """Detect bearish divergence (price higher high, RSI lower high)."""
        if len(pivot_highs) < 2:
            return None
        
        # Get the two most recent pivot highs
        recent_pivots = pivot_highs[-2:]
        idx1, idx2 = recent_pivots[0], recent_pivots[1]
        
        # Check minimum distance
        if idx2 - idx1 < self.params['min_divergence_bars']:
            return None
        
        price1, price2 = df['close'].iloc[idx1], df['close'].iloc[idx2]
        rsi1, rsi2 = df['rsi'].iloc[idx1], df['rsi'].iloc[idx2]
        
        # Bearish divergence: price makes higher high, RSI makes lower high
        if price2 > price1 and rsi2 < rsi1:
            strength = abs(rsi1 - rsi2) / rsi1 * 100
            return {
                'type': 'bearish',
                'price_pivot1': price1,
                'price_pivot2': price2,
                'rsi_pivot1': rsi1,
                'rsi_pivot2': rsi2,
                'bars_apart': idx2 - idx1,
                'strength': strength
            }
        
        return None
    
    def detect_hidden_bullish(self, df: pd.DataFrame, pivot_lows: List[int]) -> Optional[Dict]:
        """Detect hidden bullish divergence (trend continuation)."""
        if len(pivot_lows) < 2:
            return None
        
        recent_pivots = pivot_lows[-2:]
        idx1, idx2 = recent_pivots[0], recent_pivots[1]
        
        if idx2 - idx1 < self.params['min_divergence_bars']:
            return None
        
        price1, price2 = df['close'].iloc[idx1], df['close'].iloc[idx2]
        rsi1, rsi2 = df['rsi'].iloc[idx1], df['rsi'].iloc[idx2]
        
        # Hidden bullish: price makes higher low, RSI makes lower low
        if price2 > price1 and rsi2 < rsi1:
            return {
                'type': 'hidden_bullish',
                'price_pivot1': price1,
                'price_pivot2': price2,
                'rsi_pivot1': rsi1,
                'rsi_pivot2': rsi2,
                'bars_apart': idx2 - idx1,
                'strength': abs(rsi1 - rsi2) / rsi1 * 100
            }
        
        return None
    
    def detect_hidden_bearish(self, df: pd.DataFrame, pivot_highs: List[int]) -> Optional[Dict]:
        """Detect hidden bearish divergence (trend continuation)."""
        if len(pivot_highs) < 2:
            return None
        
        recent_pivots = pivot_highs[-2:]
        idx1, idx2 = recent_pivots[0], recent_pivots[1]
        
        if idx2 - idx1 < self.params['min_divergence_bars']:
            return None
        
        price1, price2 = df['close'].iloc[idx1], df['close'].iloc[idx2]
        rsi1, rsi2 = df['rsi'].iloc[idx1], df['rsi'].iloc[idx2]
        
        # Hidden bearish: price makes lower high, RSI makes higher high
        if price2 < price1 and rsi2 > rsi1:
            return {
                'type': 'hidden_bearish',
                'price_pivot1': price1,
                'price_pivot2': price2,
                'rsi_pivot1': rsi1,
                'rsi_pivot2': rsi2,
                'bars_apart': idx2 - idx1,
                'strength': abs(rsi2 - rsi1) / rsi1 * 100
            }
        
        return None
    
    def analyze(self, candles: List[Dict]) -> TradingSignal:
        df = self.candles_to_df(candles)
        
        if len(df) < self.min_candles:
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={},
                reasons=[],
                strategy_name=self.name
            )
        
        # Calculate RSI
        df['rsi'] = self.calculate_rsi(df['close'], self.params['rsi_period'])
        
        # Find pivots in recent data
        lookback = min(self.params['lookback_periods'], len(df) - 10)
        df_recent = df.iloc[-lookback:].copy()
        df_recent = df_recent.reset_index(drop=True)
        
        price_pivot_highs, price_pivot_lows = self.find_pivots(df_recent['close'], window=3)
        rsi_pivot_highs, rsi_pivot_lows = self.find_pivots(df_recent['rsi'], window=3)
        
        # Current values
        current = df.iloc[-1]
        rsi = current['rsi']
        close = current['close']
        
        # Build reasons
        reasons = []
        call_score = 0
        put_score = 0
        
        divergence_found = None
        
        # 1. Check for regular divergences
        bullish_div = self.detect_bullish_divergence(df_recent, price_pivot_lows)
        bearish_div = self.detect_bearish_divergence(df_recent, price_pivot_highs)
        
        if bullish_div:
            divergence_found = bullish_div
            strength_weight = min(2.5, 1 + bullish_div['strength'] / 10)
            reasons.append(SignalReason(
                indicator="Divergencia Alcista",
                condition=f"Precio hace mínimo más bajo, RSI hace mínimo más alto",
                value=bullish_div['rsi_pivot2'],
                threshold=bullish_div['rsi_pivot1'],
                met=True,
                weight=strength_weight
            ))
            call_score += strength_weight
        
        if bearish_div:
            divergence_found = bearish_div
            strength_weight = min(2.5, 1 + bearish_div['strength'] / 10)
            reasons.append(SignalReason(
                indicator="Divergencia Bajista",
                condition=f"Precio hace máximo más alto, RSI hace máximo más bajo",
                value=bearish_div['rsi_pivot2'],
                threshold=bearish_div['rsi_pivot1'],
                met=True,
                weight=strength_weight
            ))
            put_score += strength_weight
        
        # 2. Check for hidden divergences
        hidden_bull = self.detect_hidden_bullish(df_recent, price_pivot_lows)
        hidden_bear = self.detect_hidden_bearish(df_recent, price_pivot_highs)
        
        if hidden_bull and not bullish_div:
            reasons.append(SignalReason(
                indicator="Divergencia Oculta Alcista",
                condition="Continuación de tendencia alcista",
                value=hidden_bull['rsi_pivot2'],
                threshold=hidden_bull['rsi_pivot1'],
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        
        if hidden_bear and not bearish_div:
            reasons.append(SignalReason(
                indicator="Divergencia Oculta Bajista",
                condition="Continuación de tendencia bajista",
                value=hidden_bear['rsi_pivot2'],
                threshold=hidden_bear['rsi_pivot1'],
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # 3. RSI Zone Analysis
        if rsi < self.params['rsi_oversold']:
            reasons.append(SignalReason(
                indicator="RSI Zona",
                condition=f"RSI en sobreventa ({rsi:.1f})",
                value=rsi,
                threshold=self.params['rsi_oversold'],
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif rsi > self.params['rsi_overbought']:
            reasons.append(SignalReason(
                indicator="RSI Zona",
                condition=f"RSI en sobrecompra ({rsi:.1f})",
                value=rsi,
                threshold=self.params['rsi_overbought'],
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # 4. RSI Momentum
        rsi_prev = df.iloc[-2]['rsi']
        rsi_prev2 = df.iloc[-3]['rsi']
        
        rsi_rising = rsi > rsi_prev > rsi_prev2
        rsi_falling = rsi < rsi_prev < rsi_prev2
        
        if rsi_rising and rsi < 60:
            reasons.append(SignalReason(
                indicator="RSI Momentum",
                condition="RSI subiendo (momentum alcista)",
                value=rsi,
                threshold=rsi_prev,
                met=True,
                weight=1.0
            ))
            call_score += 1
        elif rsi_falling and rsi > 40:
            reasons.append(SignalReason(
                indicator="RSI Momentum",
                condition="RSI bajando (momentum bajista)",
                value=rsi,
                threshold=rsi_prev,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # 5. Price confirmation
        price_rising = close > df.iloc[-2]['close'] > df.iloc[-3]['close']
        price_falling = close < df.iloc[-2]['close'] < df.iloc[-3]['close']
        
        if price_rising and call_score > put_score:
            reasons.append(SignalReason(
                indicator="Confirmación Precio",
                condition="Precio subiendo confirma señal alcista",
                value=close,
                threshold=df.iloc[-2]['close'],
                met=True,
                weight=1.0
            ))
            call_score += 1
        elif price_falling and put_score > call_score:
            reasons.append(SignalReason(
                indicator="Confirmación Precio",
                condition="Precio bajando confirma señal bajista",
                value=close,
                threshold=df.iloc[-2]['close'],
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # Determine signal
        max_score = 7
        
        # Require divergence for strong signal
        if divergence_found:
            if call_score > put_score and call_score >= 2:
                signal = SignalType.CALL
                confidence = min(95, (call_score / max_score) * 100)
            elif put_score > call_score and put_score >= 2:
                signal = SignalType.PUT
                confidence = min(95, (put_score / max_score) * 100)
            else:
                signal = SignalType.NONE
                confidence = 0
        else:
            # Without divergence, need stronger signals
            if call_score > put_score and call_score >= 3:
                signal = SignalType.CALL
                confidence = min(85, (call_score / max_score) * 100)
            elif put_score > call_score and put_score >= 3:
                signal = SignalType.PUT
                confidence = min(85, (put_score / max_score) * 100)
            else:
                signal = SignalType.NONE
                confidence = 0
        
        if confidence < 40:
            signal = SignalType.NONE
            confidence = 0
        
        return TradingSignal(
            signal=signal,
            confidence=round(confidence, 1),
            indicators={
                'rsi': rsi,
                'rsi_prev': rsi_prev,
                'divergence_detected': divergence_found is not None,
                'divergence_type': divergence_found['type'] if divergence_found else None,
                'close': close
            },
            reasons=reasons,
            strategy_name=self.name
        )
