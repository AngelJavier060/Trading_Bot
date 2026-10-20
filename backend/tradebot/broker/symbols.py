"""Traducción de símbolos genéricos (EURUSD) al nombre exacto del broker (EURUSD-T).

Cada broker añade prefijos o sufijos distintos: Admirals usa "EURUSD-T",
otros "EURUSD.a", "EURUSDm", "#EURUSD"... El resolver busca el mejor
candidato entre los símbolos del terminal y guarda el resultado en caché.
Se puede forzar una traducción con SYMBOL_MAP="EURUSD=EURUSD-T,XAUUSD=GOLD".
"""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from typing import Iterable, Optional

from .client import MT5Client
from .models import MT5Error, SymbolSpec

logger = logging.getLogger(__name__)

TRADE_MODE_FULL = 4

# Nombres alternativos habituales entre brokers (se prueban si el nombre base no existe)
ALIASES = {
    "XAUUSD": ["GOLD"],
    "XAGUSD": ["SILVER"],
    "US500": ["SP500", "SPX500", "US500"],
    "NAS100": ["US100", "USTEC", "NDX100"],
    "US100": ["NAS100", "USTEC"],
    "US30": ["DJ30", "WS30", "DOW30"],
    "GER40": ["DE40", "GER30", "DAX40"],
    "USOIL": ["WTI", "CRUDE", "XTIUSD"],
}


def canonical(symbol: str) -> str:
    """'eur/usd', 'EURUSD-OTC', ' EURUSD ' -> 'EURUSD'."""
    s = (symbol or "").upper().strip()
    s = re.sub(r"[-_ ]?OTC$", "", s)
    return re.sub(r"[^A-Z0-9.#\-_]", "", s.replace("/", ""))


def parse_symbol_map(raw: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for item in (raw or "").split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            if k.strip() and v.strip():
                mapping[canonical(k)] = v.strip()
    return mapping


@dataclass
class SymbolCandidate:
    name: str
    trade_mode: int = TRADE_MODE_FULL
    visible: bool = False
    path: str = ""


def pick_symbol(base: str, candidates: Iterable[SymbolCandidate]) -> Optional[str]:
    """Elige el nombre del broker que mejor corresponde a `base`.

    Prioridad: coincidencia exacta > el nombre contiene `base` con sólo
    prefijo/sufijo no alfabético o corto > tradeable > visible > más corto.
    """
    base = canonical(base)
    best: Optional[tuple] = None
    for c in candidates:
        name_u = c.name.upper()
        if name_u == base:
            rank_match = 0
        else:
            idx = name_u.find(base)
            if idx < 0:
                continue
            prefix, suffix = name_u[:idx], name_u[idx + len(base):]
            # Evitar falsos positivos como EURUSD -> EURUSDX (otro instrumento) o
            # USDJPY dentro de "XUSDJPYZ": se admite prefijo/sufijo corto o con separador.
            if len(prefix) > 1 or (suffix and suffix[0].isalpha() and len(suffix) > 2):
                continue
            rank_match = 1
        key = (
            rank_match,
            0 if c.trade_mode == TRADE_MODE_FULL else 1,
            0 if c.visible else 1,
            len(c.name),
            c.name,
        )
        if best is None or key < best[0]:
            best = (key, c.name)
    return best[1] if best else None


class SymbolResolver:
    def __init__(self, client: MT5Client, overrides: Optional[dict[str, str]] = None):
        self.client = client
        self.overrides = {canonical(k): v for k, v in (overrides or {}).items()}
        self._cache: dict[str, str] = {}
        self._lock = threading.Lock()

    def clear_cache(self) -> None:
        with self._lock:
            self._cache.clear()

    def resolve(self, symbol: str) -> str:
        """Nombre exacto en el broker. Lanza MT5Error si no existe."""
        base = canonical(symbol)
        if base in self.overrides:
            return self.overrides[base]
        with self._lock:
            if base in self._cache:
                return self._cache[base]

        name = None
        for candidate in [base] + ALIASES.get(base, []):
            name = self._find(candidate)
            if name:
                break
        if not name:
            raise MT5Error(f"El símbolo {symbol!r} no existe en este broker.")
        if name != base:
            logger.info("Símbolo %s -> %s", base, name)
        with self._lock:
            self._cache[base] = name
        return name

    def _find(self, base: str) -> Optional[str]:
        # 1) nombre exacto
        if self.client.call("symbol_info", base) is not None:
            return base
        # 2) buscar entre los símbolos del terminal que contienen el nombre
        symbols = self.client.call("symbols_get", f"*{base}*") or []
        return pick_symbol(
            base,
            (
                SymbolCandidate(
                    name=s.name,
                    trade_mode=int(getattr(s, "trade_mode", TRADE_MODE_FULL)),
                    visible=bool(getattr(s, "visible", False)),
                    path=str(getattr(s, "path", "")),
                )
                for s in symbols
            ),
        )

    def spec(self, symbol: str) -> SymbolSpec:
        """Especificación del contrato. Activa el símbolo en Market Watch si hace falta."""
        name = self.resolve(symbol)
        info = self.client.call("symbol_info", name)
        if info is not None and not info.visible:
            self.client.call("symbol_select", name, True)
            info = self.client.call("symbol_info", name)
        if info is None:
            raise MT5Error(f"No se pudo leer la especificación de {name}")
        return SymbolSpec(
            name=name,
            digits=int(info.digits),
            point=float(info.point),
            tick_size=float(info.trade_tick_size or info.point),
            tick_value=float(info.trade_tick_value),
            tick_value_loss=float(getattr(info, "trade_tick_value_loss", 0.0) or 0.0) or None,
            contract_size=float(info.trade_contract_size),
            volume_min=float(info.volume_min),
            volume_max=float(info.volume_max),
            volume_step=float(info.volume_step),
            stops_level=int(getattr(info, "trade_stops_level", 0)),
            spread=int(getattr(info, "spread", 0)),
            filling_mode=int(getattr(info, "filling_mode", 0)),
            trade_mode=int(getattr(info, "trade_mode", TRADE_MODE_FULL)),
            description=str(getattr(info, "description", "")),
        )
