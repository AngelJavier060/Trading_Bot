"""
News Calendar (heurístico)
==========================
Genera la lista de próximos eventos económicos de alto impacto sin depender de
una API externa. Se basa en patrones recurrentes conocidos:

- NFP — primer viernes del mes, 12:30 UTC
- ADP Employment — miércoles antes del NFP, 12:15 UTC
- US CPI — segunda semana, día 10-15, 12:30 UTC (martes/miércoles)
- FOMC Rate Decision — meses 1, 3, 5, 6, 7, 9, 10, 12, miércoles, 18:00 UTC
- ECB Rate Decision — meses 1, 3, 4, 6, 7, 9, 10, 12, jueves, 12:15 UTC
- BoE Rate Decision — cada ~6 semanas, jueves, 11:00 UTC
- BoJ Rate Decision — meses 1, 3, 4, 6, 7, 9, 10, 12, viernes, 03:00 UTC
- US Retail Sales — día 13-17 del mes, 12:30 UTC
- ISM Manufacturing PMI — primer día hábil del mes, 14:00 UTC

Cada evento se devuelve con su hora UTC y la conversión a hora Ecuador (UTC-5).
La intención del módulo es informativa para la UI, no de precisión absoluta.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional


# Pesos: 3 = High (rojo) · 2 = Medium · 1 = Low
@dataclass
class NewsEvent:
    title: str
    country: str
    impact: str            # 'high' | 'medium' | 'low'
    utc_iso: str           # ISO 8601 en UTC
    ecuador_iso: str       # ISO 8601 en Ecuador (UTC-5)
    description: str
    source: str = "calendar-heuristic"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_ecuador(dt_utc: datetime) -> datetime:
    return dt_utc - timedelta(hours=5)


def _make_event(
    title: str,
    country: str,
    impact: str,
    dt_utc: datetime,
    description: str,
) -> NewsEvent:
    return NewsEvent(
        title=title,
        country=country,
        impact=impact,
        utc_iso=dt_utc.replace(microsecond=0).isoformat(),
        ecuador_iso=_to_ecuador(dt_utc).replace(microsecond=0).isoformat(),
        description=description,
    )


def _first_weekday_in_month(year: int, month: int, weekday: int) -> datetime:
    """weekday: 0=Mon ... 6=Sun. Devuelve el primer día del mes que cae en weekday."""
    d = datetime(year, month, 1, tzinfo=timezone.utc)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d


def _nth_weekday_in_month(year: int, month: int, weekday: int, nth: int) -> datetime:
    d = _first_weekday_in_month(year, month, weekday)
    return d + timedelta(weeks=nth - 1)


def _at_utc(d: datetime, hour: int, minute: int) -> datetime:
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _generate_for_month(year: int, month: int) -> List[NewsEvent]:
    out: List[NewsEvent] = []

    # NFP: primer viernes del mes, 12:30 UTC
    nfp = _at_utc(_first_weekday_in_month(year, month, 4), 12, 30)
    out.append(_make_event(
        "Non-Farm Payrolls (NFP)", "US", "high", nfp,
        "Empleo no agrícola — el evento de mayor volatilidad en USD.",
    ))

    # ADP Employment: miércoles ANTES del NFP, 12:15 UTC
    adp = _at_utc(nfp - timedelta(days=2), 12, 15)
    out.append(_make_event(
        "ADP Employment Change", "US", "medium", adp,
        "Anticipo del empleo privado, afecta al USD antes del NFP.",
    ))

    # US CPI: segundo martes-jueves del mes, 12:30 UTC (asumimos miércoles 2°)
    cpi = _at_utc(_nth_weekday_in_month(year, month, 2, 2), 12, 30)
    out.append(_make_event(
        "US CPI (Inflación)", "US", "high", cpi,
        "Índice de precios al consumidor de EE.UU. — fuerte impacto en USD/JPY.",
    ))

    # FOMC: meses 1, 3, 5, 6, 7, 9, 10, 12 — miércoles 3° del mes 18:00 UTC
    if month in {1, 3, 5, 6, 7, 9, 10, 12}:
        fomc = _at_utc(_nth_weekday_in_month(year, month, 2, 3), 18, 0)
        out.append(_make_event(
            "FOMC Rate Decision", "US", "high", fomc,
            "Decisión de tasas de la Fed — máxima volatilidad en USD.",
        ))

    # ECB: meses 1, 3, 4, 6, 7, 9, 10, 12 — jueves 2° del mes 12:15 UTC
    if month in {1, 3, 4, 6, 7, 9, 10, 12}:
        ecb = _at_utc(_nth_weekday_in_month(year, month, 3, 2), 12, 15)
        out.append(_make_event(
            "ECB Rate Decision", "EU", "high", ecb,
            "Decisión de tasas del BCE — gran impacto en EUR/USD.",
        ))

    # BoE: cada ~6 semanas — jueves 1° del mes 11:00 UTC en meses pares
    if month in {2, 3, 5, 6, 8, 9, 11, 12}:
        boe = _at_utc(_nth_weekday_in_month(year, month, 3, 1), 11, 0)
        out.append(_make_event(
            "BoE Rate Decision", "UK", "high", boe,
            "Decisión de tasas del Banco de Inglaterra — fuerte impacto en GBP.",
        ))

    # BoJ: meses 1, 3, 4, 6, 7, 9, 10, 12 — viernes 3° 03:00 UTC
    if month in {1, 3, 4, 6, 7, 9, 10, 12}:
        boj = _at_utc(_nth_weekday_in_month(year, month, 4, 3), 3, 0)
        out.append(_make_event(
            "BoJ Rate Decision", "JP", "high", boj,
            "Decisión de tasas del Banco de Japón — afecta JPY.",
        ))

    # US Retail Sales: día 15 del mes, 12:30 UTC
    try:
        retail = _at_utc(datetime(year, month, 15, tzinfo=timezone.utc), 12, 30)
        out.append(_make_event(
            "US Retail Sales", "US", "medium", retail,
            "Ventas minoristas de EE.UU. — indicador clave del consumo.",
        ))
    except ValueError:
        pass

    # ISM Manufacturing PMI: primer día hábil del mes, 14:00 UTC
    pmi_day = datetime(year, month, 1, tzinfo=timezone.utc)
    while pmi_day.weekday() >= 5:
        pmi_day += timedelta(days=1)
    pmi = _at_utc(pmi_day, 14, 0)
    out.append(_make_event(
        "ISM Manufacturing PMI", "US", "medium", pmi,
        "PMI manufacturero — pulso de la actividad industrial.",
    ))

    return out


def upcoming_events(limit: int = 5, impact: Optional[str] = None) -> List[dict]:
    """
    Devuelve los próximos eventos a partir de ahora.

    :param limit: cantidad máxima a devolver (5 por defecto).
    :param impact: 'high' | 'medium' | None (todos).
    """
    now = _utc_now()
    candidates: List[NewsEvent] = []

    # Generamos para mes actual y los dos siguientes para asegurar cobertura
    base = now
    for offset in (0, 1, 2):
        y = base.year
        m = base.month + offset
        while m > 12:
            m -= 12
            y += 1
        candidates.extend(_generate_for_month(y, m))

    out: List[NewsEvent] = []
    for ev in candidates:
        try:
            ev_dt = datetime.fromisoformat(ev.utc_iso)
            if ev_dt.tzinfo is None:
                ev_dt = ev_dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if ev_dt < now:
            continue
        if impact and ev.impact != impact:
            continue
        out.append(ev)

    out.sort(key=lambda e: e.utc_iso)
    return [asdict(e) for e in out[:limit]]
