"""
News Provider — calendario económico en tiempo real
====================================================
Fuentes (por orden de preferencia):
    1. TradingView Economic Calendar (público, JSON, sin auth, miles de eventos).
    2. ForexFactory / FairEconomy (feed JSON semanal). Se usa como respaldo.
    3. Calendario heurístico interno (ver `news_calendar.py`).

Robustez:
- Caché en MEMORIA + en DISCO (`backend/data/news_cache.json`) — sobrevive
  reinicios automáticos de Flask en modo debug.
- TTL configurable (`NEWS_FEED_CACHE_TTL`, por defecto 1 h).
- Si ambos feeds fallan reusa el caché aunque esté vencido.
- Throttle de reintentos: si un fetch falla no reintenta hasta los 5 min.

Variables de entorno:
- `NEWS_FEED_DISABLED=true`        → desactiva las fuentes online.
- `NEWS_FEED_CACHE_TTL=<seg>`      → TTL del caché en segundos.
- `NEWS_FEED_TIMEOUT=<seg>`        → timeout HTTP (default 8).

Formato devuelto:
    {
      "title": str,
      "country": "US"|"EU"|"UK"|"JP"|...,
      "impact": "high"|"medium"|"low",
      "utc_iso": "YYYY-MM-DDTHH:MM:SS+00:00",
      "ecuador_iso": "YYYY-MM-DDTHH:MM:SS-05:00",
      "description": str,
      "source": "tradingview"|"forexfactory"|"calendar-heuristic",
      "forecast": str|None,
      "previous": str|None,
      "actual": str|None,
    }
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = int(os.environ.get("NEWS_FEED_CACHE_TTL", "3600"))   # 1 h
HTTP_TIMEOUT = float(os.environ.get("NEWS_FEED_TIMEOUT", "8"))
RETRY_COOLDOWN_SECONDS = 300

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

_CACHE_FILE = Path(__file__).resolve().parents[1] / "data" / "news_cache.json"

# Países considerados relevantes para el bot
_TRADINGVIEW_COUNTRIES = "US,EU,GB,JP,CA,AU,NZ,CH,CN"

_FOREXFACTORY_FEEDS = (
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
)

_CCY_TO_COUNTRY = {
    # Códigos de divisa (ForexFactory)
    "USD": "US", "EUR": "EU", "GBP": "UK", "JPY": "JP",
    "CHF": "CH", "CAD": "CA", "AUD": "AU", "NZD": "NZ",
    "CNY": "CN", "MXN": "MX",
}
# Códigos país TradingView → notación interna
_TV_COUNTRY_FIX = {"GB": "UK"}

_IMPACT_TEXT_MAP = {
    "high": "high", "red": "high",
    "medium": "medium", "orange": "medium", "yellow": "medium",
    "low": "low", "non-economic": "low", "holiday": "low",
}

# ── Caché en memoria thread-safe ───────────────────────────────────────────
_cache_lock = threading.Lock()
_cache_payload: List[dict] = []
_cache_expires_at: float = 0.0
_last_fetch_attempt: float = 0.0
_last_fetch_failed: bool = False
_last_source: str = ""


# ── Persistencia en disco ──────────────────────────────────────────────────
def _load_disk_cache() -> Tuple[list[dict], float, str]:
    try:
        if not _CACHE_FILE.exists():
            return [], 0.0, ""
        raw = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        return raw.get("items", []) or [], float(raw.get("expires_at", 0)), str(raw.get("source", ""))
    except Exception as exc:
        logger.warning("No se pudo leer caché de noticias: %s", exc)
        return [], 0.0, ""


def _save_disk_cache(items: List[dict], expires_at: float, source: str) -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "saved_at": time.time(),
            "expires_at": expires_at,
            "source": source,
            "items": items,
        }
        _CACHE_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.warning("No se pudo escribir caché de noticias: %s", exc)


def _ensure_memory_loaded() -> None:
    global _cache_payload, _cache_expires_at, _last_source
    with _cache_lock:
        if _cache_payload:
            return
        items, exp, source = _load_disk_cache()
        if items:
            _cache_payload = items
            _cache_expires_at = exp
            _last_source = source or ""
            logger.info("Caché de noticias rehidratado desde disco: %d eventos (source=%s)", len(items), source)


# ── HTTP helper ────────────────────────────────────────────────────────────
def _http_get(url: str, *, headers: Optional[dict] = None) -> Tuple[Optional[bytes], Optional[int]]:
    base_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        base_headers.update(headers)
    try:
        req = urllib.request.Request(url, headers=base_headers)
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            return resp.read(), resp.status
    except urllib.error.HTTPError as exc:
        logger.info("feed %s HTTP %s", url[:60], exc.code)
        return None, exc.code
    except urllib.error.URLError as exc:
        logger.info("feed %s no accesible: %s", url[:60], exc.reason)
        return None, None
    except Exception as exc:
        logger.warning("feed %s error inesperado: %s", url[:60], exc)
        return None, None


def _parse_iso_with_tz(value: str) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _build_event(
    *, title: str, country_raw: str, dt_utc: datetime, impact: str,
    forecast=None, previous=None, actual=None, comment: str = "", source: str,
) -> dict:
    country = _TV_COUNTRY_FIX.get(country_raw.upper(), country_raw.upper()) if country_raw else "ALL"
    if country in _CCY_TO_COUNTRY:
        country = _CCY_TO_COUNTRY[country]
    if len(country) > 3:
        country = country[:3]

    dt_ec = dt_utc - timedelta(hours=5)

    desc_parts = []
    if forecast not in (None, ""):
        desc_parts.append(f"Previsto: {forecast}")
    if previous not in (None, ""):
        desc_parts.append(f"Anterior: {previous}")
    if actual not in (None, ""):
        desc_parts.append(f"Actual: {actual}")
    description = " · ".join(desc_parts) if desc_parts else (comment[:160] if comment else "Evento del calendario económico.")

    return {
        "title": title.strip(),
        "country": country,
        "impact": impact,
        "utc_iso": dt_utc.replace(microsecond=0).isoformat(),
        "ecuador_iso": dt_ec.replace(microsecond=0).isoformat(),
        "description": description,
        "source": source,
        "forecast": forecast,
        "previous": previous,
        "actual": actual,
    }


# ── Fuente 1: TradingView ──────────────────────────────────────────────────
def _impact_from_tv(importance) -> str:
    """TradingView usa: -1=Low, 0=Medium, 1=High."""
    try:
        n = int(importance)
    except Exception:
        return "low"
    if n >= 1:
        return "high"
    if n == 0:
        return "medium"
    return "low"


def _fetch_tradingview() -> List[dict]:
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=21)
    url = (
        "https://economic-calendar.tradingview.com/events"
        f"?from={now.strftime('%Y-%m-%dT%H:%M:%S')}.000Z"
        f"&to={end.strftime('%Y-%m-%dT%H:%M:%S')}.000Z"
        f"&countries={_TRADINGVIEW_COUNTRIES}"
    )
    body, status = _http_get(url, headers={
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/",
    })
    if not body or status != 200:
        return []
    try:
        j = json.loads(body.decode("utf-8", errors="replace"))
    except Exception as exc:
        logger.warning("TradingView JSON inválido: %s", exc)
        return []
    if isinstance(j, dict):
        items = j.get("result") or j.get("data") or []
    elif isinstance(j, list):
        items = j
    else:
        items = []

    by_key: dict[tuple, dict] = {}
    for it in items:
        try:
            title = str(it.get("title") or it.get("indicator") or "").strip()
            if not title:
                continue
            dt_utc = _parse_iso_with_tz(str(it.get("date") or ""))
            if dt_utc is None:
                continue
            country_raw = str(it.get("country") or "").strip()
            impact = _impact_from_tv(it.get("importance"))
            ev = _build_event(
                title=title,
                country_raw=country_raw,
                dt_utc=dt_utc,
                impact=impact,
                forecast=it.get("forecast"),
                previous=it.get("previous"),
                actual=it.get("actual"),
                comment=str(it.get("comment") or ""),
                source="tradingview",
            )
            # Dedup por (fecha-utc, país-normalizado, título). Si ya existe,
            # nos quedamos con el evento que tenga MÁS información (forecast/previous).
            key = (ev["utc_iso"], ev["country"], ev["title"].lower())
            if key in by_key:
                prev = by_key[key]
                prev_score = sum(1 for k in ("forecast", "previous", "actual") if prev.get(k) not in (None, ""))
                new_score = sum(1 for k in ("forecast", "previous", "actual") if ev.get(k) not in (None, ""))
                if new_score > prev_score:
                    by_key[key] = ev
            else:
                by_key[key] = ev
        except Exception:
            continue
    return list(by_key.values())


# ── Fuente 2: ForexFactory / FairEconomy ───────────────────────────────────
def _fetch_forexfactory() -> List[dict]:
    out: List[dict] = []
    for url in _FOREXFACTORY_FEEDS:
        body, status = _http_get(url)
        if not body or status != 200:
            continue
        try:
            items = json.loads(body.decode("utf-8", errors="replace"))
        except Exception:
            continue
        if not isinstance(items, list):
            continue
        for it in items:
            try:
                title = str(it.get("title") or it.get("event") or "").strip()
                if not title:
                    continue
                dt_utc = _parse_iso_with_tz(str(it.get("date") or ""))
                if dt_utc is None:
                    continue
                impact = _IMPACT_TEXT_MAP.get(str(it.get("impact") or "").lower(), "low")
                country_raw = str(it.get("country") or it.get("currency") or "").strip()
                ev = _build_event(
                    title=title,
                    country_raw=country_raw,
                    dt_utc=dt_utc,
                    impact=impact,
                    forecast=it.get("forecast"),
                    previous=it.get("previous"),
                    actual=it.get("actual"),
                    comment="",
                    source="forexfactory",
                )
                out.append(ev)
            except Exception:
                continue
    return out


# ── Pipeline de refresco ───────────────────────────────────────────────────
def _fetch_live_events() -> Tuple[List[dict], str]:
    """Devuelve (eventos, source). Source es '' si no se obtuvo nada."""
    if os.environ.get("NEWS_FEED_DISABLED", "").lower() in ("1", "true", "yes"):
        return [], ""

    try:
        tv = _fetch_tradingview()
        if tv:
            logger.info("news feed: TradingView OK (%d eventos)", len(tv))
            return tv, "tradingview"
    except Exception as exc:
        logger.warning("TradingView fetch falló: %s", exc)

    try:
        ff = _fetch_forexfactory()
        if ff:
            logger.info("news feed: ForexFactory OK (%d eventos)", len(ff))
            return ff, "forexfactory"
    except Exception as exc:
        logger.warning("ForexFactory fetch falló: %s", exc)

    return [], ""


def _refresh_cache_if_needed() -> List[dict]:
    """Refresca el caché si venció. Siempre devuelve la mejor lista disponible."""
    global _cache_payload, _cache_expires_at, _last_fetch_attempt, _last_fetch_failed, _last_source

    _ensure_memory_loaded()
    now = time.time()

    with _cache_lock:
        if _cache_payload and now < _cache_expires_at:
            return list(_cache_payload)
        if _last_fetch_failed and (now - _last_fetch_attempt) < RETRY_COOLDOWN_SECONDS and _cache_payload:
            return list(_cache_payload)
        _last_fetch_attempt = now

    fetched, source = _fetch_live_events()

    with _cache_lock:
        if fetched:
            _cache_payload = fetched
            _cache_expires_at = now + CACHE_TTL_SECONDS
            _last_fetch_failed = False
            _last_source = source
            _save_disk_cache(_cache_payload, _cache_expires_at, source)
        else:
            _last_fetch_failed = True
            if _cache_payload:
                logger.info("news feed indisponible; reusando caché previo (%d eventos)", len(_cache_payload))
        return list(_cache_payload)


# ── API pública ────────────────────────────────────────────────────────────
def upcoming_events_live(limit: int = 5, impact: Optional[str] = None) -> List[dict]:
    """Próximos eventos del feed real. Lista vacía si no hay nada disponible."""
    items = _refresh_cache_if_needed()
    if not items:
        return []
    now_utc = datetime.now(timezone.utc)
    future = []
    for ev in items:
        try:
            dt = datetime.fromisoformat(ev["utc_iso"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if dt < now_utc:
            continue
        if impact and ev.get("impact") != impact:
            continue
        future.append((dt, ev))
    future.sort(key=lambda t: t[0])
    return [ev for _, ev in future[: max(1, limit)]]


def get_upcoming(limit: int = 5, impact: Optional[str] = None, prefer_live: bool = True) -> List[dict]:
    """Eventos próximos: feed real (TradingView → ForexFactory) + fallback heurístico."""
    if prefer_live:
        live = upcoming_events_live(limit=limit, impact=impact)
        if live:
            return live
    try:
        from .news_calendar import upcoming_events as _heuristic
        return _heuristic(limit=limit, impact=impact)
    except Exception as exc:
        logger.warning("Fallback heurístico falló: %s", exc)
        return []


def invalidate_cache() -> None:
    global _cache_payload, _cache_expires_at, _last_fetch_failed, _last_fetch_attempt, _last_source
    with _cache_lock:
        _cache_payload = []
        _cache_expires_at = 0.0
        _last_fetch_failed = False
        _last_fetch_attempt = 0.0
        _last_source = ""
    try:
        if _CACHE_FILE.exists():
            _CACHE_FILE.unlink()
    except Exception:
        pass


def get_status() -> dict:
    """Devuelve metadatos sobre el estado del caché (debug/UI)."""
    _ensure_memory_loaded()
    with _cache_lock:
        return {
            "items_cached": len(_cache_payload),
            "expires_at": _cache_expires_at,
            "expires_in_seconds": max(0, int(_cache_expires_at - time.time())),
            "last_fetch_attempt": _last_fetch_attempt,
            "last_fetch_failed": _last_fetch_failed,
            "last_source": _last_source,
        }
