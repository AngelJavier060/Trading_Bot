"""
EMA + RSI Strategy
==================
Professional implementation of EMA crossover with RSI confirmation.
"""

from typing import Dict, List
from .base_strategy import BaseStrategy, TradingSignal, SignalType, SignalReason


class EmaRsiStrategy(BaseStrategy):
    """
    EMA Crossover Strategy with RSI Confirmation.
    
    Signals:
    - CALL: EMA fast > EMA slow AND RSI < 70 (not overbought)
    - PUT: EMA fast < EMA slow AND RSI > 30 (not oversold)
    
    Confidence based on:
    - EMA separation strength
    - RSI position relative to neutral (50)
    - Trend consistency
    """
    
    name = "ema_rsi"
    description = "EMA Crossover with RSI Confirmation - Trend following strategy"
    version = "2.0.0"
    min_candles = 30
    
    def default_params(self) -> Dict:
        return {
            'ema_fast': 9,
            'ema_slow': 21,
            'rsi_period': 14,
            'rsi_overbought': 70,
            'rsi_oversold': 30,
            'min_ema_separation': 0.0005,  # 0.05% minimum separation
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
        
        # Calculate indicators
        df['ema_fast'] = self.calculate_ema(df['close'], self.params['ema_fast'])
        df['ema_slow'] = self.calculate_ema(df['close'], self.params['ema_slow'])
        df['rsi'] = self.calculate_rsi(df['close'], self.params['rsi_period'])
        
        # Get latest values
        current = df.iloc[-1]
        previous = df.iloc[-2]
        
        ema_fast = current['ema_fast']
        ema_slow = current['ema_slow']
        rsi = current['rsi']
        close = current['close']
        
        # Calculate EMA separation percentage
        ema_separation = (ema_fast - ema_slow) / ema_slow * 100
        
        # Trend detection
        prev_ema_fast = previous['ema_fast']
        prev_ema_slow = previous['ema_slow']
        ema_crossover_up = prev_ema_fast <= prev_ema_slow and ema_fast > ema_slow
        ema_crossover_down = prev_ema_fast >= prev_ema_slow and ema_fast < ema_slow
        
        # Build reasons
        reasons = []
        call_score = 0
        put_score = 0
        
        # EMA Trend Analysis
        if ema_fast > ema_slow:
            reasons.append(SignalReason(
                indicator="EMA",
                condition=f"EMA rápida ({self.params['ema_fast']}) > EMA lenta ({self.params['ema_slow']})",
                value=ema_separation,
                threshold=self.params['min_ema_separation'] * 100,
                met=True,
                weight=2.0
            ))
            call_score += 2
        else:
            reasons.append(SignalReason(
                indicator="EMA",
                condition=f"EMA rápida ({self.params['ema_fast']}) < EMA lenta ({self.params['ema_slow']})",
                value=abs(ema_separation),
                threshold=self.params['min_ema_separation'] * 100,
                met=True,
                weight=2.0
            ))
            put_score += 2
        
        # EMA Crossover (recent)
        if ema_crossover_up:
            reasons.append(SignalReason(
                indicator="EMA Crossover",
                condition="Cruce alcista reciente",
                value=1,
                threshold=1,
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif ema_crossover_down:
            reasons.append(SignalReason(
                indicator="EMA Crossover",
                condition="Cruce bajista reciente",
                value=1,
                threshold=1,
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # RSI Analysis
        if rsi < self.params['rsi_oversold']:
            reasons.append(SignalReason(
                indicator="RSI",
                condition=f"Sobreventa (RSI < {self.params['rsi_oversold']})",
                value=rsi,
                threshold=self.params['rsi_oversold'],
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif rsi > self.params['rsi_overbought']:
            reasons.append(SignalReason(
                indicator="RSI",
                condition=f"Sobrecompra (RSI > {self.params['rsi_overbought']})",
                value=rsi,
                threshold=self.params['rsi_overbought'],
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        elif 40 <= rsi <= 60:
            reasons.append(SignalReason(
                indicator="RSI",
                condition="RSI en zona neutral (40-60)",
                value=rsi,
                threshold=50,
                met=True,
                weight=0.5
            ))
        
        # RSI momentum
        if rsi > 50 and ema_fast > ema_slow:
            reasons.append(SignalReason(
                indicator="RSI Momentum",
                condition="RSI > 50 confirma tendencia alcista",
                value=rsi,
                threshold=50,
                met=True,
                weight=1.0
            ))
            call_score += 1
        elif rsi < 50 and ema_fast < ema_slow:
            reasons.append(SignalReason(
                indicator="RSI Momentum",
                condition="RSI < 50 confirma tendencia bajista",
                value=rsi,
                threshold=50,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # Determine signal
        max_score = 6  # Maximum possible score
        
        if call_score > put_score and call_score >= 2:
            signal = SignalType.CALL
            confidence = min(95, (call_score / max_score) * 100)
        elif put_score > call_score and put_score >= 2:
            signal = SignalType.PUT
            confidence = min(95, (put_score / max_score) * 100)
        else:
            signal = SignalType.NONE
            confidence = 0
        
        # Filter weak signals
        if confidence < 40:
            signal = SignalType.NONE
            confidence = 0
        
        return TradingSignal(
            signal=signal,
            confidence=round(confidence, 1),
            indicators={
                'ema_fast': ema_fast,
                'ema_slow': ema_slow,
                'ema_separation': ema_separation,
                'rsi': rsi,
                'close': close
            },
            reasons=reasons,
            strategy_name=self.name
        )
