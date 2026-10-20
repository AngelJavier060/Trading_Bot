"""Timeframes soportados y conversión a constantes de MT5."""

from __future__ import annotations

TIMEFRAME_MINUTES = {
    "M1": 1,
    "M5": 5,
    "M15": 15,
    "M30": 30,
    "H1": 60,
    "H4": 240,
    "D1": 1440,
}

_ALIASES = {
    "1m": "M1", "5m": "M5", "15m": "M15", "30m": "M30",
    "1h": "H1", "60m": "H1", "4h": "H4", "1d": "D1", "d": "D1",
}


def normalize(timeframe: str) -> str:
    """'5m' / 'm5' / 'M5' -> 'M5'. Lanza ValueError si no es válido."""
    tf = (timeframe or "").strip()
    tf = _ALIASES.get(tf.lower(), tf.upper())
    if tf not in TIMEFRAME_MINUTES:
        raise ValueError(f"Timeframe no soportado: {timeframe!r}. Usa uno de {list(TIMEFRAME_MINUTES)}")
    return tf


def minutes(timeframe: str) -> int:
    return TIMEFRAME_MINUTES[normalize(timeframe)]


def to_mt5(api, timeframe: str) -> int:
    """Constante TIMEFRAME_* del módulo MetaTrader5."""
    return getattr(api, f"TIMEFRAME_{normalize(timeframe)}")
