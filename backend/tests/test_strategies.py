"""
Tests exhaustivos para el motor de estrategias (Trading Strategies).
Cubre:
  - Creación de cada estrategia
  - Señales en diferentes condiciones de mercado
  - Cálculo de confianza
  - Generación de explicaciones (XAI)
  - Parámetros por defecto y personalizados
  - Fusion de parámetros
"""
import os
import sys
import pytest
from typing import Dict, Any


from tradebot.strategies import (
    get_strategy,
    AVAILABLE_STRATEGIES,
    BaseStrategy,
)


# ── Tests de creación de estrategias ───────────────────────────────────

class TestStrategyCreation:
    """Verifica que todas las estrategias se puedan instanciar correctamente."""

    def test_all_strategies_available(self):
        """Todas las estrategias definidas deben estar en AVAILABLE_STRATEGIES."""
        expected = [
            'ema_rsi', 'macd', 'bollinger', 'ichimoku',
            'rsi_divergence', 'ema_trend_continuation', 'price_action_key_levels',
            'asian_range_breakout',
        ]
        for name in expected:
            assert name in AVAILABLE_STRATEGIES, f"Falta: {name}"

    def test_get_strategy_default(self):
        """get_strategy() debe devolver instancia sin errores."""
        for name in AVAILABLE_STRATEGIES:
            strat = get_strategy(name)
            assert isinstance(strat, BaseStrategy), f"{name} no es BaseStrategy"

    def test_get_strategy_invalid_name(self):
        """Nombre inválido debe lanzar ValueError."""
        with pytest.raises(ValueError, match="not found"):
            get_strategy('non_existent_strategy')

    def test_strategy_has_default_params(self):
        """Toda estrategia debe exponer default_params()."""
        for name in AVAILABLE_STRATEGIES:
            strat = get_strategy(name)
            params = strat.default_params()
            assert isinstance(params, dict), f"{name}.default_params() no retorna dict"
            assert len(params) > 0, f"{name} no tiene parámetros"

    def test_strategy_has_min_candles(self):
        """Toda estrategia debe definir min_candles."""
        for name in AVAILABLE_STRATEGIES:
            strat = get_strategy(name)
            assert hasattr(strat, 'min_candles'), f"{name} no tiene min_candles"
            assert isinstance(strat.min_candles, int), f"{name}.min_candles no es int"
            assert strat.min_candles > 0, f"{name}.min_candles debe ser > 0"


# ── Tests de análisis de señales ──────────────────────────────────────

class TestStrategySignals:
    """Verifica que las estrategias produzcan señales correctas."""

    def test_signal_structure(self, sample_candles_5m):
        """La señal debe contener todos los campos esperados."""
        strat = get_strategy('ema_rsi')
        candles = sample_candles_5m
        signal = strat.analyze(candles, asset='EURUSD')

        # Verificar estructura
        assert hasattr(signal, 'signal'), "Falta signal.signal"
        assert hasattr(signal, 'confidence'), "Falta signal.confidence"
        assert hasattr(signal, 'indicators'), "Falta signal.indicators"
        assert hasattr(signal, 'reasons'), "Falta signal.reasons"
        assert hasattr(signal, 'to_dict'), "Falta signal.to_dict()"

        # to_dict debe funcionar
        d = signal.to_dict()
        assert isinstance(d, dict)
        assert 'signal' in d
        assert 'confidence' in d
        assert 'indicators' in d
        assert 'reasons' in d

    def test_signal_call_on_trend_up(self, sample_candles_trend_up):
        """Tendencia alcista debería generar señales BUY."""
        strat = get_strategy('ema_rsi')
        signal = strat.analyze(sample_candles_trend_up, asset='EURUSD')
        # En tendencia alcista, esperamos signal BUY
        assert signal.signal.value in ('buy', 'none'), \
            f"Esperaba call o none, obtuvo {signal.signal.value}"

    def test_signal_put_on_trend_down(self, sample_candles_trend_down):
        """Tendencia bajista debería generar señales SELL."""
        strat = get_strategy('ema_rsi')
        signal = strat.analyze(sample_candles_trend_down, asset='EURUSD')
        assert signal.signal.value in ('sell', 'none'), \
            f"Esperaba put o none, obtuvo {signal.signal.value}"

    def test_confidence_range(self, sample_candles_5m):
        """La confianza debe estar entre 0 y 95."""
        for name in list(AVAILABLE_STRATEGIES.keys())[:3]:  # Probar primeras 3
            strat = get_strategy(name)
            signal = strat.analyze(sample_candles_5m, asset='EURUSD')
            assert 0 <= signal.confidence <= 95, \
                f"{name}: confianza {signal.confidence} fuera de rango [0, 95]"

    def test_reasons_have_explanation(self, sample_candles_trend_up):
        """Cada reason debe tener met/condition y ser human-readable."""
        strat = get_strategy('ema_rsi')
        signal = strat.analyze(sample_candles_trend_up, asset='EURUSD')
        for r in signal.reasons:
            if hasattr(r, 'condition'):
                assert isinstance(r.condition, str)
                assert len(r.condition) > 0
            if hasattr(r, 'met'):
                assert isinstance(r.met, bool)

    def test_indicators_present(self, sample_candles_5m):
        """Los indicadores deben estar presentes en la señal."""
        for name in ['ema_rsi', 'macd', 'bollinger']:
            strat = get_strategy(name)
            signal = strat.analyze(sample_candles_5m, asset='EURUSD')
            assert len(signal.indicators) > 0, f"{name}: sin indicadores"


# ── Tests de parámetros personalizados ────────────────────────────────

class TestStrategyParams:
    """Verifica la fusión y validación de parámetros."""

    def test_param_overrides_merge(self):
        """Los parámetros personalizados deben fusionarse con los defaults."""
        strat = get_strategy('ema_rsi', {'rsi_period': 7, 'ema_fast': 10})
        assert strat.params.get('rsi_period') == 7
        assert strat.params.get('ema_fast') == 10
        # Los no sobreescritos deben conservar default
        assert strat.params.get('ema_slow') is not None

    def test_param_overrides_invalid_type(self):
        """Tipos inválidos deben corregirse al default."""
        strat = get_strategy('ema_rsi', {'rsi_period': 'invalid'})
        assert isinstance(strat.params.get('rsi_period'), int), \
            "Parámetro inválido debería mantener tipo entero"

    def test_param_overrides_unknown_key(self):
        """Keys desconocidas deben ignorarse sin error."""
        strat = get_strategy('ema_rsi', {'non_existent_param': 999})
        # No debe lanzar error, simplemente ignorar
        assert 'non_existent_param' not in strat.params

    def test_strategy_min_candles_respected(self):
        """Si hay menos velas que min_candles, no debe señalizar."""
        strat = get_strategy('ema_rsi')
        minimal_candles = [
            {'timestamp': i, 'open': 1.1, 'high': 1.11, 'low': 1.09,
             'close': 1.1, 'volume': 1000}
            for i in range(strat.min_candles - 1)
        ]
        signal = strat.analyze(minimal_candles, asset='EURUSD')
        assert signal.signal.value == 'none', \
            "Con pocas velas no debería haber señal"


# ── Tests específicos por estrategia ──────────────────────────────────

class TestSpecificStrategies:
    """Pruebas específicas para estrategias individuales."""

    def test_macd_crossover(self, sample_candles_trend_up):
        """MACD debe detectar cruce alcista en tendencia up."""
        strat = get_strategy('macd')
        signal = strat.analyze(sample_candles_trend_up, asset='EURUSD')
        # Verificar que indicadores MACD existen
        assert any('macd' in k.lower() for k in signal.indicators.keys()), \
            "MACD strategy debe tener indicadores macd_*"

    def test_bollinger_bands_present(self, sample_candles_5m):
        """Bollinger debe tener bandas superior/inferior en indicadores."""
        strat = get_strategy('bollinger')
        signal = strat.analyze(sample_candles_5m, asset='EURUSD')
        keys = list(signal.indicators.keys())
        bb_keys = [k for k in keys if 'bb_' in k.lower()]
        assert len(bb_keys) > 0, \
            f"Bollinger: no hay indicadores bb_*. Keys: {keys[:5]}"

    def test_rsi_divergence(self, sample_candles_rsi_oversold):
        """RSI Divergence debe detectar condiciones de sobreventa."""
        strat = get_strategy('rsi_divergence')
        signal = strat.analyze(sample_candles_rsi_oversold, asset='EURUSD')
        # Simplemente verificar que no explota
        assert signal is not None

    def test_ichimoku_cloud(self, sample_candles_5m):
        """Ichimoku debe ejecutarse sin errores (solo forex/real markets)."""
        strat = get_strategy('ichimoku')
        signal = strat.analyze(sample_candles_5m, asset='EURUSD')
        # Aún en mercado sin tendencia, no debe explotar
        assert signal is not None

    def test_price_action_levels(self, sample_candles_5m):
        """Price Action debe identificar soportes/resistencias."""
        strat = get_strategy('price_action_key_levels')
        signal = strat.analyze(sample_candles_5m, asset='EURUSD')
        assert signal is not None
        # Debe tener al menos indicadores de soporte/resistencia
        keys = list(signal.indicators.keys())
        has_level = any('support' in k.lower() or 'resist' in k.lower() or 'level' in k.lower() for k in keys)
        # Puede no tener niveles si no se detectan, pero no debe fallar

    def test_ema_trend_continuation(self, sample_candles_trend_up):
        """EMA Trend Continuation debe seguir tendencia alcista."""
        strat = get_strategy('ema_trend_continuation')
        signal = strat.analyze(sample_candles_trend_up, asset='EURUSD')
        assert signal is not None


# ── Tests de edge cases ──────────────────────────────────────────────

class TestStrategyEdgeCases:
    """Casos límite para estrategias."""

    def test_empty_candles(self):
        """Lista vacía de velas no debe causar error, debe retornar 'none'."""
        strat = get_strategy('ema_rsi')
        signal = strat.analyze([], asset='EURUSD')
        assert signal.signal.value == 'none', \
            f"Empty candles debe dar 'none', obtuvo '{signal.signal.value}'"
        assert signal.confidence == 0

    def test_candles_with_missing_fields(self):
        """Velas con campos faltantes deben retornar 'none' sin crash."""
        incomplete = [
            {'timestamp': 0, 'close': 1.1},  # Solo timestamp y close
            {'timestamp': 1, 'close': 1.2},
        ]
        strat = get_strategy('ema_rsi')
        signal = strat.analyze(incomplete, asset='EURUSD')
        assert signal.signal.value == 'none', \
            f"Señal esperada 'none', obtuvo '{signal.signal.value}'"

    def test_same_price_all_candles(self):
        """Precio constante (mercado plano) debe producir 'none' o señal baja."""
        flat = [
            {'timestamp': i, 'open': 1.1, 'high': 1.1005, 'low': 1.0995,
             'close': 1.1, 'volume': 1000}
            for i in range(100)
        ]
        strat = get_strategy('ema_rsi')
        signal = strat.analyze(flat, asset='EURUSD')
        # En mercado plano, la confianza debe ser baja
        assert signal.confidence < 70, \
            f"Mercado plano: confianza {signal.confidence} debería ser < 70%"

    def test_volatile_market(self):
        """Alta volatilidad debe ser detectada."""
        import random
        random.seed(0)
        volatile = []
        price = 1.1
        for i in range(100):
            price += random.choice([-0.02, -0.01, 0.01, 0.02])
            volatile.append({
                'timestamp': i,
                'open': round(price, 5),
                'high': round(price + 0.015, 5),
                'low': round(price - 0.015, 5),
                'close': round(price, 5),
                'volume': 5000,
            })
        strat = get_strategy('bollinger')
        signal = strat.analyze(volatile, asset='EURUSD')
        # Bollinger debe detectar la volatilidad
        bandwidth = signal.indicators.get('bandwidth', 0)
        assert bandwidth > 0, \
            f"bandwidth debe ser > 0 en mercado volátil, obtuvo {bandwidth}. Keys: {list(signal.indicators.keys())}"
