"""Estructuras de datos del broker, independientes del módulo MetaTrader5."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Optional

BUY = "buy"
SELL = "sell"

ACCOUNT_MODES = {0: "demo", 1: "contest", 2: "real"}


class MT5Error(RuntimeError):
    """Error devuelto por el terminal MT5 (incluye el código de last_error)."""

    def __init__(self, message: str, code: Optional[int] = None):
        super().__init__(message)
        self.code = code


@dataclass
class AccountInfo:
    login: int
    server: str
    name: str
    currency: str
    balance: float
    equity: float
    margin: float
    margin_free: float
    leverage: int
    mode: str  # demo | contest | real
    trade_allowed: bool

    @property
    def is_demo(self) -> bool:
        return self.mode == "demo"

    def to_dict(self) -> dict:
        return {**asdict(self), "is_demo": self.is_demo}


@dataclass
class SymbolSpec:
    """Especificación de contrato necesaria para calcular lotes, stops y P&L."""

    name: str
    digits: int
    point: float
    tick_size: float
    tick_value: float          # valor de 1 tick para 1 lote, en la moneda de la cuenta
    contract_size: float
    volume_min: float
    volume_max: float
    volume_step: float
    stops_level: int = 0       # distancia mínima de SL/TP en puntos
    spread: int = 0            # spread actual en puntos
    filling_mode: int = 0      # bitmask: 1=FOK, 2=IOC
    trade_mode: int = 4        # 4 = trading completo
    description: str = ""
    tick_value_loss: Optional[float] = None

    def round_price(self, price: float) -> float:
        return round(round(price / self.tick_size) * self.tick_size, self.digits)

    def round_volume_down(self, volume: float) -> float:
        """Redondea hacia abajo al múltiplo de volume_step (nunca arriesga de más)."""
        steps = math.floor(volume / self.volume_step + 1e-9)
        decimals = max(0, -int(math.floor(math.log10(self.volume_step)))) if self.volume_step < 1 else 0
        return round(steps * self.volume_step, decimals)

    def money_per_price_unit(self, volume: float, losing: bool = False) -> float:
        """Dinero (moneda de la cuenta) por cada 1.0 de movimiento de precio con `volume` lotes."""
        tick_value = self.tick_value_loss if (losing and self.tick_value_loss) else self.tick_value
        return tick_value / self.tick_size * volume

    def pnl(self, side: str, entry: float, exit_price: float, volume: float) -> float:
        diff = (exit_price - entry) if side == BUY else (entry - exit_price)
        return diff * self.money_per_price_unit(volume, losing=diff < 0)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Position:
    ticket: int
    symbol: str
    side: str
    volume: float
    price_open: float
    sl: float
    tp: float
    profit: float
    time_open: datetime
    magic: int = 0
    comment: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["time_open"] = self.time_open.isoformat()
        return d


@dataclass
class OrderResult:
    ok: bool
    retcode: int
    comment: str
    ticket: Optional[int] = None
    price: Optional[float] = None
    volume: Optional[float] = None
    request: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)
