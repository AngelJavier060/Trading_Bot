"""Carga de histórico desde MT5 con caché en disco (CSV)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ..broker.market_data import CANDLE_COLUMNS, MarketData
from ..broker import timeframes

logger = logging.getLogger(__name__)


def load_history(
    market: MarketData,
    symbol: str,
    timeframe: str,
    date_from: datetime,
    date_to: datetime,
    cache_dir: Path | None = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Velas entre dos fechas (UTC). Si hay cache_dir, se guarda/lee un CSV por petición."""
    tf = timeframes.normalize(timeframe)
    date_from = _as_utc(date_from)
    date_to = _as_utc(date_to)
    name = market.resolver.resolve(symbol)

    cache_file = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / f"{name}_{tf}_{date_from:%Y%m%d}_{date_to:%Y%m%d}.csv"
        if cache_file.exists() and not refresh:
            df = pd.read_csv(cache_file)
            df["time"] = pd.to_datetime(df["time"], utc=True)
            logger.info("Histórico desde caché: %s (%d velas)", cache_file.name, len(df))
            return df

    df = market.candles_range(name, tf, date_from, date_to)
    if df.empty:
        raise ValueError(
            f"MT5 no devolvió velas de {name} {tf} entre {date_from:%Y-%m-%d} y {date_to:%Y-%m-%d}. "
            "Abre el gráfico en MT5 para que descargue el histórico o reduce el rango."
        )
    if cache_file is not None and date_to < datetime.now(timezone.utc):
        df[CANDLE_COLUMNS].to_csv(cache_file, index=False)
    logger.info("Histórico MT5: %s %s %d velas (%s -> %s)", name, tf, len(df), df["time"].iloc[0], df["time"].iloc[-1])
    return df


def _as_utc(d: datetime) -> datetime:
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
