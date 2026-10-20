"""Velas y precios desde MT5.

Las velas se devuelven como DataFrame con columnas:
    time (datetime UTC), open, high, low, close, tick_volume, spread
Los precios OHLC de MT5 son precios BID; `spread` está en puntos.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from . import timeframes
from .client import MT5Client
from .models import MT5Error
from .symbols import SymbolResolver

CANDLE_COLUMNS = ["time", "open", "high", "low", "close", "tick_volume", "spread"]


def rates_to_frame(rates, utc_offset_seconds: int = 0) -> pd.DataFrame:
    """Convierte el array estructurado de copy_rates_* a DataFrame."""
    if rates is None or len(rates) == 0:
        return pd.DataFrame(columns=CANDLE_COLUMNS)
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"].astype("int64") - utc_offset_seconds, unit="s", utc=True)
    for col in CANDLE_COLUMNS:
        if col not in df.columns:
            df[col] = 0
    return df[CANDLE_COLUMNS].reset_index(drop=True)


def epoch_seconds(series: pd.Series) -> pd.Series:
    """Fechas (con o sin zona) -> segundos Unix, independiente de la resolución interna de pandas."""
    s = pd.to_datetime(series, utc=True)
    return (s - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(seconds=1)


def frame_to_candles(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> lista de dicts, el formato que reciben las estrategias."""
    if df is None or df.empty:
        return []
    out = df[["open", "high", "low", "close"]].copy()
    out["volume"] = df["tick_volume"] if "tick_volume" in df.columns else 0
    out["time"] = epoch_seconds(df["time"]) if "time" in df.columns else 0
    if "spread" in df.columns:
        out["spread"] = df["spread"]
    return out.to_dict("records")


class MarketData:
    def __init__(self, client: MT5Client, resolver: SymbolResolver):
        self.client = client
        self.resolver = resolver

    def utc_offset(self, symbol: str) -> int:
        return self.client.utc_offset(self.resolver.resolve(symbol))

    def candles(self, symbol: str, timeframe: str, count: int, closed_only: bool = True) -> pd.DataFrame:
        """Últimas `count` velas. Con closed_only se excluye la vela en formación."""
        name = self.resolver.resolve(symbol)
        self.client.call("symbol_select", name, True)
        start = 1 if closed_only else 0
        rates = self.client.call("copy_rates_from_pos", name, timeframes.to_mt5(self.client.api, timeframe), start, int(count))
        if rates is None:
            raise MT5Error(f"Sin velas para {name} {timeframe}: {self.client.last_error()}")
        return rates_to_frame(rates, self.utc_offset(name))

    def candles_range(self, symbol: str, timeframe: str, date_from: datetime, date_to: datetime) -> pd.DataFrame:
        """Velas históricas entre dos fechas (UTC). Límite: lo que tenga descargado el terminal
        (ajustable en MT5: Herramientas > Opciones > Gráficos > Máx. barras en gráfico)."""
        name = self.resolver.resolve(symbol)
        self.client.call("symbol_select", name, True)
        offset = self.utc_offset(name)
        to_server = lambda d: datetime.fromtimestamp(_utc_ts(d) + offset, tz=timezone.utc)  # noqa: E731
        rates = self.client.call(
            "copy_rates_range", name, timeframes.to_mt5(self.client.api, timeframe), to_server(date_from), to_server(date_to)
        )
        if rates is None:
            raise MT5Error(f"Sin histórico para {name} {timeframe}: {self.client.last_error()}")
        return rates_to_frame(rates, offset)

    def tick(self, symbol: str) -> dict:
        name = self.resolver.resolve(symbol)
        self.client.call("symbol_select", name, True)
        t = self.client.call("symbol_info_tick", name)
        # Un símbolo recién añadido a Market Watch tarda un momento en recibir el primer tick
        for _ in range(20):
            if t is not None and t.bid:
                break
            time.sleep(0.1)
            t = self.client.call("symbol_info_tick", name)
        if t is None or not t.bid:
            raise MT5Error(f"Sin precio para {name} (¿mercado cerrado?)")
        return {"symbol": name, "bid": float(t.bid), "ask": float(t.ask), "time": int(t.time)}


def _utc_ts(d: datetime) -> float:
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()
