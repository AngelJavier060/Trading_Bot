"""
EMA Trend Continuation + RSI + ADX Strategy
============================================
Estrategia profesional de 5 pasos:

Paso 1 - Tendencia: EMA 20 > EMA 50 (BUY) o EMA 20 < EMA 50 (SELL)
Paso 2 - Pullback: Precio toca/roza EMA 20 (±0.1%)
Paso 3 - Filtro ADX: ADX > 20 (tendencia real, no lateral)
Paso 4 - RSI fuerza: RSI > 50 confirma BUY, RSI < 50 confirma SELL
Paso 5 - Vela confirmadora: Engulfing, rechazo, momentum o ruptura

Timeframe: 5 min | Expiracion: 15 min (3x vela)
Horario: Londres 03:00-07:00, NY 08:00-12:00 (hora Ecuador)
"""

from typing import Dict, List, Optional
import numpy as np
import pandas as pd
from datetime import datetime, time

from .base_strategy import BaseStrategy, TradingSignal, SignalType, SignalReason


class EmaTrendContinuationStrategy(BaseStrategy):
    """
    EMA Trend Continuation con RSI + ADX.
    
    Estrategia de continuacion de tendencia que espera:
    1. Tendencia clara (EMA20/50 separadas)
    2. Pullback a EMA20
    3. ADX confirma tendencia (>20)
    4. RSI confirma fuerza en direccion correcta
    5. Vela confirmadora
    """

    name = "ema_trend_continuation"
    description = "EMA Trend Continuation + RSI + ADX - Estrategia profesional de 5 pasos"
    version = "1.0.0"
    min_candles = 60

    def default_params(self) -> Dict:
        return {
            'ema_fast': 20,           # EMA rapida
            'ema_slow': 50,           # EMA lenta
            'rsi_period': 14,         # Periodo RSI
            'adx_period': 14,         # Periodo ADX
            'adx_threshold': 20,      # ADX minimo para tendencia
            'pullback_max_pct': 0.1,  # Maximo % de distancia a EMA20 para pullback
            'engulfing_check': True,  # Buscar vela engulfing
            'rejection_check': True,  # Buscar vela de rechazo
            'momentum_check': True,   # Buscar vela de momentum
            'breakout_check': True,   # Buscar vela de ruptura
            'min_ema_separation': 0.0003,  # Separacion minima EMA20/50
        }

    def calculate_adx(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        """Calculate Average Directional Index (ADX)."""
        high = df['high']
        low = df['low']
        close = df['close']

        # True Range
        tr1 = high - low
        tr2 = np.abs(high - close.shift())
        tr3 = np.abs(low - close.shift())
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        # Directional Movement
        up_move = high - high.shift()
        down_move = low.shift() - low

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)

        # Smooth using Wilder's method (EMA with alpha=1/period)
        atr = tr.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
        plus_di = (pd.Series(plus_dm).ewm(alpha=1/period, min_periods=period, adjust=False).mean() / atr) * 100
        minus_di = (pd.Series(minus_dm).ewm(alpha=1/period, min_periods=period, adjust=False).mean() / atr) * 100

        # Directional Index
        dx = (np.abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.nan)) * 100
        adx = dx.ewm(alpha=1/period, min_periods=period, adjust=False).mean()

        return adx.fillna(0)

    def detect_engulfing(self, df: pd.DataFrame, idx: int) -> bool:
        """Detecta vela envolvente (engulfing)."""
        if idx < 1:
            return False
        current = df.iloc[idx]
        prev = df.iloc[idx - 1]

        # Engulfing alcista: vela verde actual envuelve completamente la anterior roja
        bullish_engulfing = (
            current['close'] > current['open'] and
            prev['close'] < prev['open'] and
            current['open'] <= prev['close'] and
            current['close'] >= prev['open']
        )
        # Engulfing bajista: vela roja actual envuelve completamente la anterior verde
        bearish_engulfing = (
            current['close'] < current['open'] and
            prev['close'] > prev['open'] and
            current['open'] >= prev['close'] and
            current['close'] <= prev['open']
        )
        return bullish_engulfing or bearish_engulfing

    def detect_rejection(self, df: pd.DataFrame, idx: int, direction: str) -> bool:
        """Detecta vela de rechazo (mecha larga)."""
        if idx < 1:
            return False
        current = df.iloc[idx]

        body = abs(current['close'] - current['open'])
        total_range = current['high'] - current['low']

        if total_range == 0:
            return False

        upper_wick = current['high'] - max(current['close'], current['open'])
        lower_wick = min(current['close'], current['open']) - current['low']

        if direction == 'call':
            # Rechazo bajista (mecha larga abajo, cuerpo arriba)
            return lower_wick > body * 1.5 and lower_wick > total_range * 0.5
        else:
            # Rechazo alcista (mecha larga arriba, cuerpo abajo)
            return upper_wick > body * 1.5 and upper_wick > total_range * 0.5

    def detect_momentum_candle(self, df: pd.DataFrame, idx: int) -> bool:
        """Detecta vela de momentum (cuerpo grande)."""
        if idx < 1:
            return False
        current = df.iloc[idx]
        prev = df.iloc[idx - 1]

        body = abs(current['close'] - current['open'])
        prev_body = abs(prev['close'] - prev['open'])
        prev_range = prev['high'] - prev['low']

        if prev_range == 0:
            return False

        # Cuerpo actual >= 1.5x el rango anterior
        return body >= prev_range * 1.5

    def detect_breakout(self, df: pd.DataFrame, idx: int, direction: str) -> bool:
        """Detecta vela de ruptura de rango."""
        if idx < 3:
            return False

        # Rango de las ultimas 3 velas (excluyendo actual)
        high_3 = df.iloc[idx-3:idx]['high'].max()
        low_3 = df.iloc[idx-3:idx]['low'].min()

        current = df.iloc[idx]
        current_close = current['close']

        if direction == 'call':
            # Ruptura alcista: cierra por encima del rango
            return current_close > high_3
        else:
            # Ruptura bajista: cierra por debajo del rango
            return current_close < low_3

    def is_in_trading_hours(self, ref_time: Optional[datetime] = None) -> bool:
        """Verifica horario Londres/NY (Ecuador UTC-5) para la hora de referencia (UTC)."""
        from datetime import timedelta, timezone
        ref_time = ref_time or datetime.now(timezone.utc)
        now_ecuador = ref_time - timedelta(hours=5)
        current_hour = now_ecuador.hour
        current_minute = now_ecuador.minute
        current_time = current_hour + current_minute / 60.0

        # Londres: 03:00-07:00 (08:00-12:00 UTC, Ecuador UTC-5 = 03:00-07:00)
        # Nueva York: 08:00-12:00 (13:00-17:00 UTC, Ecuador UTC-5 = 08:00-12:00)
        # Cruce Londres-NY: 08:00-11:00

        london_open = 3.0
        london_close = 7.0
        ny_open = 8.0
        ny_close = 12.0

        in_london = london_open <= current_time <= london_close
        in_ny = ny_open <= current_time <= ny_close

        return in_london or in_ny

    def analyze(
        self,
        candles: List[Dict],
        candles_htf: Optional[List[Dict]] = None,
        *,
        asset: str = "",
    ) -> TradingSignal:
        df = self.candles_to_df(candles)

        if len(df) < self.min_candles:
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={},
                reasons=[],
                strategy_name=self.name
            )

        # --- CALCULAR INDICADORES ---
        df['ema_fast'] = self.calculate_ema(df['close'], self.params['ema_fast'])
        df['ema_slow'] = self.calculate_ema(df['close'], self.params['ema_slow'])
        df['rsi'] = self.calculate_rsi(df['close'], self.params['rsi_period'])
        df['adx'] = self.calculate_adx(df, self.params['adx_period'])

        # Valores actuales
        current = df.iloc[-1]
        prev = df.iloc[-2]
        prev2 = df.iloc[-3]

        ema_fast = current['ema_fast']
        ema_slow = current['ema_slow']
        rsi = current['rsi']
        adx = current['adx']
        close = current['close']

        # Separacion EMAs
        ema_separation_pct = abs(ema_fast - ema_slow) / ema_slow * 100

        # Inicializar
        reasons = []
        call_score = 0
        put_score = 0
        max_score = 10  # 5 pasos x 2 puntos cada uno

        # --- VERIFICAR HORARIO (informativo, según la hora de la última vela) ---
        in_hours = self.is_in_trading_hours(self.reference_time(candles))
        if not in_hours:
            reasons.append(SignalReason(
                indicator="Trading Hours",
                condition="Fuera de horario de alta liquidez (Londres/NY)",
                value=0,
                threshold=1,
                met=False,
                weight=0
            ))

        # ========================================================
        # PASO 1: TENDENCIA (EMA 20 vs EMA 50)
        # ========================================================
        trend_call = ema_fast > ema_slow
        trend_put = ema_fast < ema_slow
        ema_separated = ema_separation_pct >= self.params['min_ema_separation'] * 100

        if trend_call and ema_separated:
            reasons.append(SignalReason(
                indicator="Paso 1 - Tendencia",
                condition=f"EMA{self.params['ema_fast']} > EMA{self.params['ema_slow']} (tendencia alcista)",
                value=ema_separation_pct,
                threshold=self.params['min_ema_separation'] * 100,
                met=True,
                weight=2.0
            ))
            call_score += 2
        elif trend_put and ema_separated:
            reasons.append(SignalReason(
                indicator="Paso 1 - Tendencia",
                condition=f"EMA{self.params['ema_fast']} < EMA{self.params['ema_slow']} (tendencia bajista)",
                value=ema_separation_pct,
                threshold=self.params['min_ema_separation'] * 100,
                met=True,
                weight=2.0
            ))
            put_score += 2
        else:
            reasons.append(SignalReason(
                indicator="Paso 1 - Tendencia",
                condition="EMAs sin separacion clara - SIN SENAL",
                value=ema_separation_pct,
                threshold=self.params['min_ema_separation'] * 100,
                met=False,
                weight=0
            ))

        # ========================================================
        # PASO 2: PULLBACK HACIA EMA 20
        # ========================================================
        if trend_call:
            # Para BUY: precio debe estar cerca de EMA20 (pullback)
            dist_to_ema20_pct = abs(close - ema_fast) / ema_fast * 100
            pullback_call = dist_to_ema20_pct <= self.params['pullback_max_pct']

            if pullback_call:
                reasons.append(SignalReason(
                    indicator="Paso 2 - Pullback",
                    condition=f"Precio toco EMA{self.params['ema_fast']} (pullback: {dist_to_ema20_pct:.3f}%)",
                    value=dist_to_ema20_pct,
                    threshold=self.params['pullback_max_pct'],
                    met=True,
                    weight=2.0
                ))
                call_score += 2
            else:
                reasons.append(SignalReason(
                    indicator="Paso 2 - Pullback",
                    condition=f"Precio muy lejos de EMA{self.params['ema_fast']} ({dist_to_ema20_pct:.3f}%) - esperando pullback",
                    value=dist_to_ema20_pct,
                    threshold=self.params['pullback_max_pct'],
                    met=False,
                    weight=0
                ))
        elif trend_put:
            dist_to_ema20_pct = abs(close - ema_fast) / ema_fast * 100
            pullback_put = dist_to_ema20_pct <= self.params['pullback_max_pct']

            if pullback_put:
                reasons.append(SignalReason(
                    indicator="Paso 2 - Pullback",
                    condition=f"Precio toco EMA{self.params['ema_fast']} (pullback: {dist_to_ema20_pct:.3f}%)",
                    value=dist_to_ema20_pct,
                    threshold=self.params['pullback_max_pct'],
                    met=True,
                    weight=2.0
                ))
                put_score += 2
            else:
                reasons.append(SignalReason(
                    indicator="Paso 2 - Pullback",
                    condition=f"Precio muy lejos de EMA{self.params['ema_fast']} ({dist_to_ema20_pct:.3f}%)",
                    value=dist_to_ema20_pct,
                    threshold=self.params['pullback_max_pct'],
                    met=False,
                    weight=0
                ))

        # ========================================================
        # PASO 3: FILTRO ADX (> 20 = TENDENCIA REAL)
        # ========================================================
        adx_strong = adx > self.params['adx_threshold']

        if adx_strong:
            reasons.append(SignalReason(
                indicator="Paso 3 - ADX",
                condition=f"ADX={adx:.1f} > {self.params['adx_threshold']} (tendencia real confirmada)",
                value=adx,
                threshold=self.params['adx_threshold'],
                met=True,
                weight=2.0
            ))
            if trend_call:
                call_score += 2
            else:
                put_score += 2
        else:
            reasons.append(SignalReason(
                indicator="Paso 3 - ADX",
                condition=f"ADX={adx:.1f} < {self.params['adx_threshold']} (mercado lateral - SIN SENAL)",
                value=adx,
                threshold=self.params['adx_threshold'],
                met=False,
                weight=0
            ))

        # ========================================================
        # PASO 4: RSI COMO MEDIDOR DE FUERZA
        # ========================================================
        rsi_above_50 = rsi > 50
        rsi_below_50 = rsi < 50

        # Verificar si RSI reboto desde abajo de 50 (para BUY)
        prev_rsi = prev['rsi']
        rsi_bouncing_up = prev_rsi <= 50 and rsi > 50 and rsi > prev_rsi
        rsi_bouncing_down = prev_rsi >= 50 and rsi < 50 and rsi < prev_rsi

        if trend_call and rsi_bouncing_up:
            reasons.append(SignalReason(
                indicator="Paso 4 - RSI Fuerza",
                condition=f"RSI reboto desde <50 a {rsi:.1f} (fuerza alcista confirmada)",
                value=rsi,
                threshold=50,
                met=True,
                weight=2.0
            ))
            call_score += 2
        elif trend_call and rsi_above_50:
            reasons.append(SignalReason(
                indicator="Paso 4 - RSI Fuerza",
                condition=f"RSI={rsi:.1f} > 50 (fuerza alcista presente)",
                value=rsi,
                threshold=50,
                met=True,
                weight=1.0
            ))
            call_score += 1
        elif trend_put and rsi_bouncing_down:
            reasons.append(SignalReason(
                indicator="Paso 4 - RSI Fuerza",
                condition=f"RSI cayo desde >50 a {rsi:.1f} (fuerza bajista confirmada)",
                value=rsi,
                threshold=50,
                met=True,
                weight=2.0
            ))
            put_score += 2
        elif trend_put and rsi_below_50:
            reasons.append(SignalReason(
                indicator="Paso 4 - RSI Fuerza",
                condition=f"RSI={rsi:.1f} < 50 (fuerza bajista presente)",
                value=rsi,
                threshold=50,
                met=True,
                weight=1.0
            ))
            put_score += 1
        else:
            reasons.append(SignalReason(
                indicator="Paso 4 - RSI Fuerza",
                condition=f"RSI={rsi:.1f} en zona neutral - sin confirmacion de fuerza",
                value=rsi,
                threshold=50,
                met=True if 45 <= rsi <= 55 else False,
                weight=0
            ))

        # ========================================================
        # PASO 5: VELA CONFIRMADORA
        # ========================================================
        is_engulfing = self.detect_engulfing(df, -1)
        is_rejection = self.detect_rejection(df, -1, 'call' if trend_call else 'put')
        is_momentum = self.detect_momentum_candle(df, -1)
        is_breakout = self.detect_breakout(df, -1, 'call' if trend_call else 'put')

        candle_confirmed = is_engulfing or is_rejection or is_momentum or is_breakout

        if candle_confirmed:
            patterns = []
            if is_engulfing: patterns.append("Engulfing")
            if is_rejection: patterns.append("Rechazo")
            if is_momentum: patterns.append("Momentum")
            if is_breakout: patterns.append("Ruptura")

            reasons.append(SignalReason(
                indicator="Paso 5 - Vela Confirmadora",
                condition=f"Vela confirmadora detectada: {', '.join(patterns)}",
                value=1,
                threshold=1,
                met=True,
                weight=2.0
            ))

            if trend_call:
                call_score += 2
            else:
                put_score += 2
        else:
            reasons.append(SignalReason(
                indicator="Paso 5 - Vela Confirmadora",
                condition="Sin vela confirmadora (engulfing, rechazo, momentum o ruptura)",
                value=0,
                threshold=1,
                met=False,
                weight=0
            ))

        # ========================================================
        # DECISION FINAL
        # ========================================================
        min_steps = 6
        min_conf_pct = 40

        if call_score > put_score and call_score >= min_steps:
            signal = SignalType.BUY
            confidence = min(95, (call_score / max_score) * 100)
        elif put_score > call_score and put_score >= min_steps:
            signal = SignalType.SELL
            confidence = min(95, (put_score / max_score) * 100)
        else:
            signal = SignalType.NONE
            confidence = 0

        if confidence < min_conf_pct:
            signal = SignalType.NONE
            confidence = 0

        return TradingSignal(
            signal=signal,
            confidence=round(confidence, 1),
            indicators={
                'ema_fast': ema_fast,
                'ema_slow': ema_slow,
                'ema_separation_pct': ema_separation_pct,
                'rsi': rsi,
                'adx': adx,
                'close': close,
                # Pasos cumplidos
                'step1_trend': 1 if ((trend_call or trend_put) and ema_separated) else 0,
                'step2_pullback': 1 if ('pullback_call' in locals() and pullback_call) or ('pullback_put' in locals() and pullback_put) else 0,
                'step3_adx': 1 if adx_strong else 0,
                'step4_rsi': 1 if (rsi_bouncing_up or rsi_bouncing_down or (trend_call and rsi_above_50) or (trend_put and rsi_below_50)) else 0,
                'step5_candle': 1 if candle_confirmed else 0,
                'total_steps': call_score + put_score,
                'in_trading_hours': 1 if in_hours else 0,
            },
            reasons=reasons,
            strategy_name=self.name
        )
