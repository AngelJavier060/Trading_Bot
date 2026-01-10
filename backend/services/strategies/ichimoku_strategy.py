"""
Ichimoku Cloud Strategy
=======================
Professional Ichimoku Kinko Hyo implementation with cloud analysis.
"""

from typing import Dict, List
import pandas as pd
from .base_strategy import BaseStrategy, TradingSignal, SignalType, SignalReason


class IchimokuStrategy(BaseStrategy):
    """
    Ichimoku Cloud Strategy.
    
    Components:
    - Tenkan-sen (Conversion Line): 9-period high+low/2
    - Kijun-sen (Base Line): 26-period high+low/2
    - Senkou Span A (Leading Span A): (Tenkan + Kijun) / 2
    - Senkou Span B (Leading Span B): 52-period high+low/2
    - Chikou Span (Lagging Span): Close shifted back 26 periods
    
    Signals:
    - CALL: Price above cloud + Tenkan > Kijun + Chikou confirms
    - PUT: Price below cloud + Tenkan < Kijun + Chikou confirms
    """
    
    name = "ichimoku"
    description = "Ichimoku Cloud Strategy - Complete trend analysis system"
    version = "2.0.0"
    min_candles = 60
    
    def default_params(self) -> Dict:
        return {
            'tenkan_period': 9,
            'kijun_period': 26,
            'senkou_b_period': 52,
            'displacement': 26,
        }
    
    def calculate_ichimoku(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate all Ichimoku components."""
        # Tenkan-sen (Conversion Line)
        tenkan_high = df['high'].rolling(window=self.params['tenkan_period']).max()
        tenkan_low = df['low'].rolling(window=self.params['tenkan_period']).min()
        df['tenkan'] = (tenkan_high + tenkan_low) / 2
        
        # Kijun-sen (Base Line)
        kijun_high = df['high'].rolling(window=self.params['kijun_period']).max()
        kijun_low = df['low'].rolling(window=self.params['kijun_period']).min()
        df['kijun'] = (kijun_high + kijun_low) / 2
        
        # Senkou Span A (Leading Span A)
        df['senkou_a'] = ((df['tenkan'] + df['kijun']) / 2).shift(self.params['displacement'])
        
        # Senkou Span B (Leading Span B)
        senkou_high = df['high'].rolling(window=self.params['senkou_b_period']).max()
        senkou_low = df['low'].rolling(window=self.params['senkou_b_period']).min()
        df['senkou_b'] = ((senkou_high + senkou_low) / 2).shift(self.params['displacement'])
        
        # Chikou Span (Lagging Span)
        df['chikou'] = df['close'].shift(-self.params['displacement'])
        
        # Cloud boundaries
        df['cloud_top'] = df[['senkou_a', 'senkou_b']].max(axis=1)
        df['cloud_bottom'] = df[['senkou_a', 'senkou_b']].min(axis=1)
        
        # Cloud color (bullish = green, bearish = red)
        df['cloud_bullish'] = df['senkou_a'] > df['senkou_b']
        
        return df
    
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
        
        # Calculate Ichimoku
        df = self.calculate_ichimoku(df)
        
        # Get current values (use -27 to have valid senkou spans)
        idx = -1
        current = df.iloc[idx]
        prev = df.iloc[idx - 1]
        
        close = current['close']
        tenkan = current['tenkan']
        kijun = current['kijun']
        senkou_a = current['senkou_a']
        senkou_b = current['senkou_b']
        cloud_top = current['cloud_top']
        cloud_bottom = current['cloud_bottom']
        cloud_bullish = current['cloud_bullish']
        
        prev_tenkan = prev['tenkan']
        prev_kijun = prev['kijun']
        
        # Check Chikou (26 periods back)
        chikou_idx = idx - self.params['displacement']
        if abs(chikou_idx) < len(df):
            chikou_price = df.iloc[chikou_idx]['close']
            chikou_above_price = close > chikou_price
        else:
            chikou_above_price = None
        
        # Build reasons
        reasons = []
        call_score = 0
        put_score = 0
        
        # 1. Price vs Cloud
        price_above_cloud = close > cloud_top
        price_below_cloud = close < cloud_bottom
        price_in_cloud = cloud_bottom <= close <= cloud_top
        
        if price_above_cloud:
            reasons.append(SignalReason(
                indicator="Cloud Position",
                condition="Precio por encima de la nube (tendencia alcista fuerte)",
                value=close,
                threshold=cloud_top,
                met=True,
                weight=2.5
            ))
            call_score += 2.5
        elif price_below_cloud:
            reasons.append(SignalReason(
                indicator="Cloud Position",
                condition="Precio por debajo de la nube (tendencia bajista fuerte)",
                value=close,
                threshold=cloud_bottom,
                met=True,
                weight=2.5
            ))
            put_score += 2.5
        else:
            reasons.append(SignalReason(
                indicator="Cloud Position",
                condition="Precio dentro de la nube (zona de indecisión)",
                value=close,
                threshold=cloud_top,
                met=True,
                weight=0
            ))
        
        # 2. Tenkan vs Kijun (TK Cross)
        tk_bullish = tenkan > kijun
        tk_cross_up = prev_tenkan <= prev_kijun and tenkan > kijun
        tk_cross_down = prev_tenkan >= prev_kijun and tenkan < kijun
        
        if tk_cross_up:
            reasons.append(SignalReason(
                indicator="TK Cross",
                condition="Cruce alcista Tenkan/Kijun",
                value=tenkan - kijun,
                threshold=0,
                met=True,
                weight=2.0
            ))
            call_score += 2
        elif tk_cross_down:
            reasons.append(SignalReason(
                indicator="TK Cross",
                condition="Cruce bajista Tenkan/Kijun",
                value=kijun - tenkan,
                threshold=0,
                met=True,
                weight=2.0
            ))
            put_score += 2
        elif tk_bullish:
            reasons.append(SignalReason(
                indicator="TK Position",
                condition="Tenkan sobre Kijun (momentum alcista)",
                value=tenkan - kijun,
                threshold=0,
                met=True,
                weight=1.0
            ))
            call_score += 1
        else:
            reasons.append(SignalReason(
                indicator="TK Position",
                condition="Tenkan bajo Kijun (momentum bajista)",
                value=kijun - tenkan,
                threshold=0,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # 3. Cloud Color (Future Sentiment)
        if cloud_bullish:
            reasons.append(SignalReason(
                indicator="Cloud Color",
                condition="Nube verde (sentimiento futuro alcista)",
                value=senkou_a - senkou_b,
                threshold=0,
                met=True,
                weight=1.0
            ))
            call_score += 1
        else:
            reasons.append(SignalReason(
                indicator="Cloud Color",
                condition="Nube roja (sentimiento futuro bajista)",
                value=senkou_b - senkou_a,
                threshold=0,
                met=True,
                weight=1.0
            ))
            put_score += 1
        
        # 4. Chikou Span Confirmation
        if chikou_above_price is not None:
            if chikou_above_price:
                reasons.append(SignalReason(
                    indicator="Chikou Span",
                    condition="Chikou confirma tendencia alcista",
                    value=1,
                    threshold=1,
                    met=True,
                    weight=1.5
                ))
                call_score += 1.5
            else:
                reasons.append(SignalReason(
                    indicator="Chikou Span",
                    condition="Chikou confirma tendencia bajista",
                    value=1,
                    threshold=1,
                    met=True,
                    weight=1.5
                ))
                put_score += 1.5
        
        # 5. Price vs Kijun (Support/Resistance)
        price_above_kijun = close > kijun
        kijun_bounce_up = prev['close'] < prev_kijun and close > kijun
        kijun_bounce_down = prev['close'] > prev_kijun and close < kijun
        
        if kijun_bounce_up:
            reasons.append(SignalReason(
                indicator="Kijun Bounce",
                condition="Rebote alcista desde Kijun",
                value=close,
                threshold=kijun,
                met=True,
                weight=1.5
            ))
            call_score += 1.5
        elif kijun_bounce_down:
            reasons.append(SignalReason(
                indicator="Kijun Bounce",
                condition="Rebote bajista desde Kijun",
                value=close,
                threshold=kijun,
                met=True,
                weight=1.5
            ))
            put_score += 1.5
        
        # 6. Cloud Thickness (Trend Strength)
        cloud_thickness = abs(senkou_a - senkou_b) / close * 100
        if cloud_thickness > 1:
            if cloud_bullish:
                reasons.append(SignalReason(
                    indicator="Cloud Strength",
                    condition=f"Nube gruesa alcista ({cloud_thickness:.2f}%)",
                    value=cloud_thickness,
                    threshold=1,
                    met=True,
                    weight=0.5
                ))
                call_score += 0.5
            else:
                reasons.append(SignalReason(
                    indicator="Cloud Strength",
                    condition=f"Nube gruesa bajista ({cloud_thickness:.2f}%)",
                    value=cloud_thickness,
                    threshold=1,
                    met=True,
                    weight=0.5
                ))
                put_score += 0.5
        
        # Determine signal
        max_score = 9
        
        # Strong signals require price outside cloud
        if price_in_cloud:
            signal = SignalType.NONE
            confidence = 0
        elif call_score > put_score and call_score >= 3:
            signal = SignalType.CALL
            confidence = min(95, (call_score / max_score) * 100)
        elif put_score > call_score and put_score >= 3:
            signal = SignalType.PUT
            confidence = min(95, (put_score / max_score) * 100)
        else:
            signal = SignalType.NONE
            confidence = 0
        
        if confidence < 45:
            signal = SignalType.NONE
            confidence = 0
        
        return TradingSignal(
            signal=signal,
            confidence=round(confidence, 1),
            indicators={
                'tenkan': tenkan,
                'kijun': kijun,
                'senkou_a': senkou_a,
                'senkou_b': senkou_b,
                'cloud_top': cloud_top,
                'cloud_bottom': cloud_bottom,
                'cloud_bullish': cloud_bullish,
                'price_position': 'above' if price_above_cloud else ('below' if price_below_cloud else 'inside'),
                'close': close
            },
            reasons=reasons,
            strategy_name=self.name
        )
