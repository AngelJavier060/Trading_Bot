"""Descripción en español de cada estrategia y de sus parámetros (para el panel)."""

from __future__ import annotations

CATALOG = {
    "ema_rsi": {
        "nombre": "Cruce de medias + RSI",
        "tipo": "Seguimiento de tendencia",
        "como_funciona": "Compra cuando la media rápida está por encima de la lenta y el RSI no está sobrecomprado; "
                         "vende en el caso contrario. Opera casi siempre a favor de la tendencia corta.",
        "timeframes": ["M15", "H1"],
        "params": {
            "ema_fast": "Media rápida (velas)",
            "ema_slow": "Media lenta (velas)",
            "rsi_period": "Periodo del RSI",
            "rsi_overbought": "RSI de sobrecompra (no compra por encima)",
            "rsi_oversold": "RSI de sobreventa (no vende por debajo)",
            "min_ema_separation": "Separación mínima entre medias (fracción del precio)",
        },
    },
    "macd": {
        "nombre": "MACD",
        "tipo": "Momentum",
        "como_funciona": "Opera los cruces de la línea MACD con su señal cuando el histograma confirma el giro "
                         "del impulso.",
        "timeframes": ["M15", "H1", "H4"],
        "params": {
            "fast_period": "EMA rápida del MACD",
            "slow_period": "EMA lenta del MACD",
            "signal_period": "Línea de señal",
            "histogram_threshold": "Tamaño mínimo del histograma para confirmar",
        },
    },
    "bollinger": {
        "nombre": "Bandas de Bollinger",
        "tipo": "Reversión a la media / volatilidad",
        "como_funciona": "Busca rebotes cuando el precio toca o rompe una banda, y rupturas tras una compresión "
                         "(squeeze) de las bandas.",
        "timeframes": ["M15", "H1"],
        "params": {
            "period": "Velas de la media central",
            "std_dev": "Ancho de las bandas (desviaciones estándar)",
            "squeeze_threshold": "Ancho (%) por debajo del cual hay compresión",
            "oversold_b": "%B de sobreventa (zona de compra)",
            "overbought_b": "%B de sobrecompra (zona de venta)",
        },
    },
    "ichimoku": {
        "nombre": "Ichimoku",
        "tipo": "Tendencia completa",
        "como_funciona": "Compra con el precio sobre la nube, Tenkan por encima de Kijun y Chikou confirmando; "
                         "vende con la configuración opuesta.",
        "timeframes": ["H1", "H4"],
        "params": {
            "tenkan_period": "Tenkan-sen (línea de conversión)",
            "kijun_period": "Kijun-sen (línea base)",
            "senkou_b_period": "Senkou Span B (nube)",
            "displacement": "Desplazamiento de la nube",
        },
    },
    "rsi_divergence": {
        "nombre": "Divergencias del RSI",
        "tipo": "Reversión",
        "como_funciona": "Detecta divergencias entre el precio y el RSI (el precio hace un nuevo extremo y el RSI no) "
                         "para anticipar giros.",
        "timeframes": ["H1", "H4"],
        "params": {
            "rsi_period": "Periodo del RSI",
            "lookback_periods": "Velas donde buscar la divergencia",
            "min_divergence_bars": "Velas mínimas entre los dos extremos",
            "rsi_overbought": "RSI de sobrecompra",
            "rsi_oversold": "RSI de sobreventa",
            "pivot_threshold": "Tamaño mínimo de un pivote (fracción del precio)",
        },
    },
    "ema_trend_continuation": {
        "nombre": "Continuación de tendencia (EMA + RSI + ADX)",
        "tipo": "Seguimiento de tendencia con pullback",
        "como_funciona": "Cinco pasos: tendencia EMA 20/50, fuerza (ADX), retroceso a la EMA, confirmación de vela "
                         "(envolvente/rechazo) y ruptura. Solo opera cuando se cumplen suficientes pasos.",
        "timeframes": ["M15", "H1"],
        "params": {
            "ema_fast": "EMA rápida",
            "ema_slow": "EMA lenta",
            "rsi_period": "Periodo del RSI",
            "adx_period": "Periodo del ADX",
            "adx_threshold": "ADX mínimo (fuerza de tendencia)",
            "pullback_max_pct": "Distancia máxima a la EMA en el retroceso (%)",
            "engulfing_check": "Exigir vela envolvente",
            "rejection_check": "Exigir vela de rechazo",
            "momentum_check": "Exigir confirmación de momentum",
            "breakout_check": "Exigir ruptura del rango reciente",
            "min_ema_separation": "Separación mínima entre EMAs",
        },
    },
    "price_action_key_levels": {
        "nombre": "Price Action en niveles clave",
        "tipo": "Reversión en soportes/resistencias",
        "como_funciona": "Marca soportes y resistencias en un timeframe superior y busca patrones de vela "
                         "(martillo, estrella fugaz, envolvente, doji) cuando el precio llega a ellos.",
        "timeframes": ["M5", "M15"],
        "params": {
            "lookback_15m": "Velas del timeframe superior para buscar niveles",
            "zone_tolerance_pct": "Ancho de la zona del nivel (%)",
            "min_touches": "Toques mínimos para validar un nivel",
            "max_wait_5m_bars": "Velas máximas esperando el patrón en la zona",
            "strength_body_ratio": "Cuerpo mínimo de una vela de fuerza (fracción del rango)",
            "doji_max_body_pct": "Cuerpo máximo de un doji",
            "doji_min_wick_pct": "Mecha mínima de un doji",
            "session_start_ec": "Inicio de sesión operable (hora Ecuador)",
            "session_end_ec": "Fin de sesión operable (hora Ecuador)",
            "break_lookback_15m": "Velas para detectar niveles rotos",
            "pivot_left": "Velas a la izquierda de un pivote",
            "pivot_right": "Velas a la derecha de un pivote",
        },
    },
    "asian_range_breakout": {
        "nombre": "Ruptura del rango asiático",
        "tipo": "Ruptura de sesión (pending)",
        "como_funciona": "Marca máximo y mínimo de la sesión asiática (hora del servidor MT5), coloca Buy Stop "
                         "arriba y Sell Stop abajo, cancela el otro al activarse (1 operación por día). SL al otro "
                         "lado del rango o a la mitad, TP en R. Filtra por tamaño del rango vs ATR diario y spread. "
                         "Cierra a la hora de cierre. Prueba en M5; el panel manda las entradas al Probador.",
        "timeframes": ["M5", "M15"],
        "params": {
            "range_start": "Hora inicio del rango (servidor)",
            "range_end": "Hora fin del rango (se colocan las órdenes)",
            "trade_end": "Hora límite: cancelar si no se activó",
            "close_hour": "Hora de cierre de la operación (0 = no)",
            "min_range_atr": "Rango mínimo (× ATR diario)",
            "max_range_atr": "Rango máximo (× ATR diario)",
            "buffer_atr": "Margen sobre el rango para la entrada (× ATR)",
            "max_spread_pts": "Spread máximo al colocar órdenes (puntos)",
            "trend_filter": "Filtro de tendencia (EMA H1)",
            "trend_ema": "Periodo de la EMA de tendencia",
            "trade_monday": "Operar lunes",
            "trade_tuesday": "Operar martes",
            "trade_wednesday": "Operar miércoles",
            "trade_thursday": "Operar jueves",
            "trade_friday": "Operar viernes",
            "sl_mode": "SL: 0 = otro lado del rango, 1 = mitad",
            "rr": "Take profit en R (0 = sin TP)",
            "atr_period": "Periodo del ATR diario",
        },
    },
}


def describe(strategy_id: str) -> dict:
    return CATALOG.get(strategy_id, {"nombre": strategy_id, "tipo": "", "como_funciona": "", "timeframes": [], "params": {}})
