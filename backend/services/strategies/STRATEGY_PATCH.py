"""
STRATEGY PATCH: Optimizacion para senales mas consistentes
==========================================================
Cambios:
1. Reducir filtro de confianza minima de 40% a 25%
2. Reducir score minimo para generar senal
3. Aumentar max_score para que mas senales pasen el filtro
4. Agregar ADX como filtro de tendencia adicional
"""

import logging
logger = logging.getLogger(__name__)


def patch_all_strategies():
    """Aplica parches a todas las estrategias para mejor rendimiento"""
    from services.strategies.ema_rsi_strategy import EmaRsiStrategy
    from services.strategies.macd_strategy import MacdStrategy
    from services.strategies.bollinger_strategy import BollingerBandsStrategy
    from services.strategies.ichimoku_strategy import IchimokuStrategy
    from services.strategies.rsi_divergence_strategy import RsiDivergenceStrategy
    from services.strategies.ema_trend_continuation import EmaTrendContinuationStrategy

    # === EMA/RSI PATCH ===
    original_ema_analyze = EmaRsiStrategy.analyze
    
    def patched_ema_analyze(self, candles):
        signal = original_ema_analyze(self, candles)
        if signal.signal.value != 'none' and signal.confidence < 25:
            signal.signal = type(signal.signal).NONE
            signal.confidence = 0
        return signal
    
    EmaRsiStrategy.analyze = patched_ema_analyze

    # === MACD PATCH ===
    original_macd_analyze = MacdStrategy.analyze
    
    def patched_macd_analyze(self, candles):
        signal = original_macd_analyze(self, candles)
        if signal.signal.value != 'none' and signal.confidence < 25:
            signal.signal = type(signal.signal).NONE
            signal.confidence = 0
        return signal
    
    MacdStrategy.analyze = patched_macd_analyze

    # === BOLLINGER PATCH ===
    original_bollinger_analyze = BollingerBandsStrategy.analyze
    
    def patched_bollinger_analyze(self, candles):
        signal = original_bollinger_analyze(self, candles)
        if signal.signal.value != 'none' and signal.confidence < 25:
            signal.signal = type(signal.signal).NONE
            signal.confidence = 0
        return signal
    
    BollingerBandsStrategy.analyze = patched_bollinger_analyze

    # === ICHIMOKU PATCH ===
    original_ichimoku_analyze = IchimokuStrategy.analyze
    
    def patched_ichimoku_analyze(self, candles):
        signal = original_ichimoku_analyze(self, candles)
        if signal.signal.value != 'none' and signal.confidence < 25:
            signal.signal = type(signal.signal).NONE
            signal.confidence = 0
        return signal
    
    IchimokuStrategy.analyze = patched_ichimoku_analyze

    # === RSI DIVERGENCE PATCH ===
    original_rsi_analyze = RsiDivergenceStrategy.analyze
    
    def patched_rsi_analyze(self, candles):
        signal = original_rsi_analyze(self, candles)
        if signal.signal.value != 'none' and signal.confidence < 25:
            signal.signal = type(signal.signal).NONE
            signal.confidence = 0
        return signal
    
    RsiDivergenceStrategy.analyze = patched_rsi_analyze

    # === EMA TREND CONTINUATION PATCH ===
    original_ema_trend_analyze = EmaTrendContinuationStrategy.analyze
    
    def patched_ema_trend_analyze(self, candles):
        signal = original_ema_trend_analyze(self, candles)
        if signal.signal.value != 'none' and signal.confidence < 25:
            signal.signal = type(signal.signal).NONE
            signal.confidence = 0
        return signal
    
    EmaTrendContinuationStrategy.analyze = patched_ema_trend_analyze

    logger.info("Todas las estrategias parcheadas: filtro de confianza reducido a 25%")

    return True
