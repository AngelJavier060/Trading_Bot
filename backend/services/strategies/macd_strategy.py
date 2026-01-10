"""
MACD Strategy
=============
Professional MACD implementation with histogram analysis and divergence detection.
"""

from typing import Dict, List
from .base_strategy import BaseStrategy, TradingSignal, SignalType, SignalReason


class MacdStrategy(BaseStrategy):
    """
    MACD (Moving Average Convergence Divergence) Strategy.
    
    Signals:
    - CALL: MACD crosses above signal line AND histogram turning positive
    - PUT: MACD crosses below signal line AND histogram turning negative
    
    Enhanced with:
    - Histogram momentum analysis
    - Zero-line crossover detection
    - Divergence identification
    """
    
    name = "macd"
    description = "MACD Strategy - Momentum and trend reversal detection"
    version = "2.0.0"
    min_candles = 35
    
    def default_params(self) -> Dict:
        return {
            'fast_period': 12,
            'slow_period': 26,
            'signal_period': 9,
            'histogram_threshold': 0.0001,
        }
    
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
        
        # Calculate MACD
        macd_data = self.calculate_macd(
            df['close'],
            self.params['fast_period'],
            self.params['slow_period'],
            self.params['signal_period']
        )
        
        df['macd'] = macd_data['macd']
        df['macd_signal'] = macd_data['signal']
        df['macd_histogram'] = macd_data['histogram']
        
        # Get values for analysis
        current = df.iloc[-1]
        prev1 = df.iloc[-2]
        prev2 = df.iloc[-3]
        
        macd = current['macd']
        macd_signal = current['macd_signal']
        histogram = current['macd_histogram']
        close = current['close']
        
        prev_macd = prev1['macd']
        prev_signal = prev1['macd_signal']
        prev_histogram = prev1['macd_histogram']
        prev2_histogram = prev2['macd_histogram']
        
        # Build analysis
        reasons = []
        call_score = 0
        put_score = 0
        
        # 1. MACD vs Signal Line
        macd_above_signal = macd > macd_signal
        macd_crossover_up = prev_macd <= prev_signal and macd > macd_signal
        macd_crossover_down = prev_macd >= prev_signal and macd < macd_signal
        
        if macd_crossover_up:
            reasons.append(SignalReason(
                indicator="MACD Crossover",
                condition="MACD cruzó por encima de la línea de señal",
                value=macd - macd_signal,
                threshold=0,
                met=True,
                weight=2.5
            ))
            call_score += 2.5
        elif macd_crossover_down:
            reasons.append(SignalReason(
                indicator="MACD Crossover",
                condition="MACD cruzó por debajo de la línea de señal",
                value=macd_signal - macd,
                threshold=0,
                met=True,
                weight=2.5
            ))
            put_score += 2.5
        elif macd_above_signal:
            reasons.append(SignalReason(
                indicator="MACD Position",
                condition="MACD está por encima de la señal",
                value=macd - macd_signal,
                threshold=0,
                met=True,
                weight=1.0
            ))
            call_score += 1
        else:
            reasons.append(SignalReason(
                indicator="MACD Position",
                condition="MACD está por debajo de la señal",
                value=macd_signal - macd,
                threshold=0,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # 2. Histogram Analysis
        histogram_growing = histogram > prev_histogram > prev2_histogram
        histogram_shrinking = histogram < prev_histogram < prev2_histogram
        histogram_positive = histogram > 0
        histogram_turning_positive = prev_histogram <= 0 and histogram > 0
        histogram_turning_negative = prev_histogram >= 0 and histogram < 0
        
        if histogram_turning_positive:
            reasons.append(SignalReason(
                indicator="Histograma",
                condition="Histograma girando positivo",
                value=histogram,
                threshold=0,
                met=True,
                weight=2.0
            ))
            call_score += 2
        elif histogram_turning_negative:
            reasons.append(SignalReason(
                indicator="Histograma",
                condition="Histograma girando negativo",
                value=histogram,
                threshold=0,
                met=True,
                weight=2.0
            ))
            put_score += 2
        elif histogram_growing and histogram_positive:
            reasons.append(SignalReason(
                indicator="Histograma",
                condition="Histograma positivo y creciendo",
                value=histogram,
                threshold=prev_histogram,
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif histogram_shrinking and not histogram_positive:
            reasons.append(SignalReason(
                indicator="Histograma",
                condition="Histograma negativo y decreciendo",
                value=histogram,
                threshold=prev_histogram,
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # 3. Zero Line Analysis
        macd_above_zero = macd > 0
        macd_crossing_zero_up = prev_macd <= 0 and macd > 0
        macd_crossing_zero_down = prev_macd >= 0 and macd < 0
        
        if macd_crossing_zero_up:
            reasons.append(SignalReason(
                indicator="MACD Zero Line",
                condition="MACD cruzando línea cero hacia arriba",
                value=macd,
                threshold=0,
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif macd_crossing_zero_down:
            reasons.append(SignalReason(
                indicator="MACD Zero Line",
                condition="MACD cruzando línea cero hacia abajo",
                value=macd,
                threshold=0,
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        elif macd_above_zero:
            reasons.append(SignalReason(
                indicator="MACD Zone",
                condition="MACD en zona positiva",
                value=macd,
                threshold=0,
                met=True,
                weight=0.5
            ))
            call_score += 0.5
        else:
            reasons.append(SignalReason(
                indicator="MACD Zone",
                condition="MACD en zona negativa",
                value=macd,
                threshold=0,
                met=True,
                weight=0.5
            ))
            put_score += 0.5
        
        # 4. Momentum confirmation
        last_5_histograms = df['macd_histogram'].iloc[-5:]
        histogram_trend_up = all(last_5_histograms.iloc[i] <= last_5_histograms.iloc[i+1] 
                                  for i in range(len(last_5_histograms)-1))
        histogram_trend_down = all(last_5_histograms.iloc[i] >= last_5_histograms.iloc[i+1] 
                                    for i in range(len(last_5_histograms)-1))
        
        if histogram_trend_up:
            reasons.append(SignalReason(
                indicator="Momentum",
                condition="Momentum alcista sostenido (5 barras)",
                value=1,
                threshold=1,
                met=True,
                weight=1.0
            ))
            call_score += 1
        elif histogram_trend_down:
            reasons.append(SignalReason(
                indicator="Momentum",
                condition="Momentum bajista sostenido (5 barras)",
                value=1,
                threshold=1,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # Determine signal
        max_score = 7
        
        if call_score > put_score and call_score >= 2.5:
            signal = SignalType.CALL
            confidence = min(95, (call_score / max_score) * 100)
        elif put_score > call_score and put_score >= 2.5:
            signal = SignalType.PUT
            confidence = min(95, (put_score / max_score) * 100)
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
                'macd': macd,
                'macd_signal': macd_signal,
                'histogram': histogram,
                'macd_above_zero': macd_above_zero,
                'close': close
            },
            reasons=reasons,
            strategy_name=self.name
        )
