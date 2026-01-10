"""
Bollinger Bands Strategy
========================
Professional Bollinger Bands implementation with squeeze detection and mean reversion.
"""

from typing import Dict, List
from .base_strategy import BaseStrategy, TradingSignal, SignalType, SignalReason


class BollingerBandsStrategy(BaseStrategy):
    """
    Bollinger Bands Strategy with Squeeze Detection.
    
    Signals:
    - CALL: Price touches/breaks lower band + squeeze release upward
    - PUT: Price touches/breaks upper band + squeeze release downward
    
    Enhanced with:
    - Bandwidth squeeze detection (volatility contraction)
    - Mean reversion probability
    - %B indicator analysis
    """
    
    name = "bollinger"
    description = "Bollinger Bands Strategy - Volatility and mean reversion"
    version = "2.0.0"
    min_candles = 25
    
    def default_params(self) -> Dict:
        return {
            'period': 20,
            'std_dev': 2.0,
            'squeeze_threshold': 4.0,  # Bandwidth below this = squeeze
            'oversold_b': 0.2,  # %B below this = oversold
            'overbought_b': 0.8,  # %B above this = overbought
        }
    
    def calculate_percent_b(self, close: float, upper: float, lower: float) -> float:
        """Calculate %B indicator (position within bands)."""
        if upper == lower:
            return 0.5
        return (close - lower) / (upper - lower)
    
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
        
        # Calculate Bollinger Bands
        bb = self.calculate_bollinger_bands(
            df['close'],
            self.params['period'],
            self.params['std_dev']
        )
        
        df['bb_upper'] = bb['upper']
        df['bb_middle'] = bb['middle']
        df['bb_lower'] = bb['lower']
        df['bb_bandwidth'] = bb['bandwidth']
        
        # Get current and previous values
        current = df.iloc[-1]
        prev1 = df.iloc[-2]
        prev2 = df.iloc[-3]
        
        close = current['close']
        upper = current['bb_upper']
        middle = current['bb_middle']
        lower = current['bb_lower']
        bandwidth = current['bb_bandwidth']
        
        prev_close = prev1['close']
        prev_bandwidth = prev1['bb_bandwidth']
        prev2_bandwidth = prev2['bb_bandwidth']
        
        # Calculate %B
        percent_b = self.calculate_percent_b(close, upper, lower)
        prev_percent_b = self.calculate_percent_b(prev_close, prev1['bb_upper'], prev1['bb_lower'])
        
        # Distance from bands
        dist_to_upper = (upper - close) / close * 100
        dist_to_lower = (close - lower) / close * 100
        dist_to_middle = (close - middle) / middle * 100
        
        # Squeeze detection
        is_squeeze = bandwidth < self.params['squeeze_threshold']
        squeeze_releasing = prev_bandwidth < bandwidth and prev2_bandwidth < prev_bandwidth
        
        # Build reasons
        reasons = []
        call_score = 0
        put_score = 0
        
        # 1. Band Touch Analysis
        touching_lower = close <= lower * 1.002  # Within 0.2% of lower band
        touching_upper = close >= upper * 0.998  # Within 0.2% of upper band
        
        if touching_lower:
            reasons.append(SignalReason(
                indicator="Bollinger Touch",
                condition="Precio tocando/debajo banda inferior",
                value=close,
                threshold=lower,
                met=True,
                weight=2.0
            ))
            call_score += 2
        elif touching_upper:
            reasons.append(SignalReason(
                indicator="Bollinger Touch",
                condition="Precio tocando/arriba banda superior",
                value=close,
                threshold=upper,
                met=True,
                weight=2.0
            ))
            put_score += 2
        
        # 2. %B Analysis
        if percent_b < self.params['oversold_b']:
            reasons.append(SignalReason(
                indicator="%B Indicator",
                condition=f"%B sobreventa (<{self.params['oversold_b']})",
                value=percent_b,
                threshold=self.params['oversold_b'],
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif percent_b > self.params['overbought_b']:
            reasons.append(SignalReason(
                indicator="%B Indicator",
                condition=f"%B sobrecompra (>{self.params['overbought_b']})",
                value=percent_b,
                threshold=self.params['overbought_b'],
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # 3. %B Reversal Detection
        b_reversing_up = prev_percent_b < percent_b and percent_b < 0.5
        b_reversing_down = prev_percent_b > percent_b and percent_b > 0.5
        
        if b_reversing_up and percent_b < 0.3:
            reasons.append(SignalReason(
                indicator="%B Reversal",
                condition="%B girando al alza desde zona baja",
                value=percent_b,
                threshold=prev_percent_b,
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif b_reversing_down and percent_b > 0.7:
            reasons.append(SignalReason(
                indicator="%B Reversal",
                condition="%B girando a la baja desde zona alta",
                value=percent_b,
                threshold=prev_percent_b,
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # 4. Squeeze Analysis
        if is_squeeze:
            reasons.append(SignalReason(
                indicator="BB Squeeze",
                condition=f"Volatilidad comprimida (BW={bandwidth:.2f}%)",
                value=bandwidth,
                threshold=self.params['squeeze_threshold'],
                met=True,
                weight=0.5
            ))
            
            if squeeze_releasing:
                # Squeeze releasing - potential breakout
                if close > middle:
                    reasons.append(SignalReason(
                        indicator="Squeeze Release",
                        condition="Squeeze liberándose al alza",
                        value=close,
                        threshold=middle,
                        met=True,
                        weight=2.0
                    ))
                    call_score += 2
                else:
                    reasons.append(SignalReason(
                        indicator="Squeeze Release",
                        condition="Squeeze liberándose a la baja",
                        value=close,
                        threshold=middle,
                        met=True,
                        weight=2.0
                    ))
                    put_score += 2
        
        # 5. Mean Reversion Probability
        if percent_b < 0.1:
            reasons.append(SignalReason(
                indicator="Mean Reversion",
                condition="Alta probabilidad de reversión al alza",
                value=percent_b,
                threshold=0.1,
                met=True,
                weight=1.0
            ))
            call_score += 1
        elif percent_b > 0.9:
            reasons.append(SignalReason(
                indicator="Mean Reversion",
                condition="Alta probabilidad de reversión a la baja",
                value=percent_b,
                threshold=0.9,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # 6. Price vs Middle Band (Trend)
        if close > middle:
            reasons.append(SignalReason(
                indicator="Trend",
                condition="Precio sobre media móvil (tendencia alcista)",
                value=dist_to_middle,
                threshold=0,
                met=True,
                weight=0.5
            ))
            call_score += 0.5
        else:
            reasons.append(SignalReason(
                indicator="Trend",
                condition="Precio bajo media móvil (tendencia bajista)",
                value=dist_to_middle,
                threshold=0,
                met=True,
                weight=0.5
            ))
            put_score += 0.5
        
        # Determine signal
        max_score = 8
        
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
                'bb_upper': upper,
                'bb_middle': middle,
                'bb_lower': lower,
                'bandwidth': bandwidth,
                'percent_b': percent_b,
                'is_squeeze': is_squeeze,
                'close': close
            },
            reasons=reasons,
            strategy_name=self.name
        )
