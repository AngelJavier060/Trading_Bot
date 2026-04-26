"""
News filter (modo simple)
=========================
Bloquea trading durante ventanas de alto impacto sin depender de APIs externas.

Reglas iniciales (heurística "buena por defecto"):
  - Bloquear los minutos :25–:35 de la primera hora de apertura de Londres y
    Nueva York (08:00–09:00 UTC, 13:00–14:00 UTC) — momentos de mayor
    volatilidad imprevisible.
  - Permitir un override mediante config:
        news_pause_minutes_before / news_pause_minutes_after
        news_blocked_windows = [{"utc_start": "HH:MM", "utc_end": "HH:MM"}, ...]

La ampliación a un calendario externo (ForexFactory / Investing.com) puede
añadirse luego sustituyendo ``high_impact_windows()``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable, List, Tuple, Optional, Dict


# Ventanas UTC bloqueadas por defecto (cuando news_filter_enabled=True).
# (start_minute_of_day, end_minute_of_day)
_DEFAULT_HIGH_IMPACT_UTC: List[Tuple[int, int]] = [
    # Apertura de Londres - primer pico de volatilidad
    (8 * 60 + 25, 8 * 60 + 35),
    # Apertura de Nueva York - choque con europeos
    (13 * 60 + 25, 13 * 60 + 35),
    # NFP (primer viernes del mes 12:30 UTC) - evaluado en is_blocked
]


def _now_utc_minute() -> int:
    now = datetime.utcnow()
    return now.hour * 60 + now.minute


def _expand_window(start: int, end: int, before: int, after: int) -> Tuple[int, int]:
    return (max(0, start - before), min(24 * 60 - 1, end + after))


def is_news_blocked(
    *,
    enabled: bool = True,
    minutes_before: int = 15,
    minutes_after: int = 30,
    extra_windows_utc: Optional[Iterable[Tuple[int, int]]] = None,
    now: Optional[datetime] = None,
) -> Tuple[bool, str]:
    """Devuelve (blocked, reason).

    - ``enabled``: si ``False``, jamás bloquea.
    - ``minutes_before/after``: colchón alrededor de cada ventana.
    - ``extra_windows_utc``: tuplas (start_minute, end_minute) en UTC.
    - ``now``: para tests.
    """
    if not enabled:
        return False, ""
    now = now or datetime.utcnow()
    minute_of_day = now.hour * 60 + now.minute

    # NFP: primer viernes del mes 12:30 UTC
    nfp_windows: List[Tuple[int, int]] = []
    if now.weekday() == 4 and now.day <= 7:
        nfp_windows.append((12 * 60 + 30, 12 * 60 + 30))

    all_windows: List[Tuple[int, int]] = list(_DEFAULT_HIGH_IMPACT_UTC) + nfp_windows
    if extra_windows_utc:
        all_windows.extend(list(extra_windows_utc))

    for start, end in all_windows:
        s2, e2 = _expand_window(start, end, minutes_before, minutes_after)
        if s2 <= minute_of_day <= e2:
            label = f"{start // 60:02d}:{start % 60:02d}-{end // 60:02d}:{end % 60:02d} UTC"
            return True, f"Ventana de alto impacto ({label})"
    return False, ""


def parse_windows_from_config(raw: Optional[List[Dict]]) -> List[Tuple[int, int]]:
    """Convierte ``[{"utc_start":"HH:MM","utc_end":"HH:MM"}, ...]`` a minutos."""
    if not raw:
        return []
    out: List[Tuple[int, int]] = []
    for item in raw:
        try:
            s = str(item.get("utc_start", "")).strip()
            e = str(item.get("utc_end", "")).strip()
            sh, sm = [int(x) for x in s.split(":")]
            eh, em = [int(x) for x in e.split(":")]
            out.append((sh * 60 + sm, eh * 60 + em))
        except Exception:
            continue
    return out
