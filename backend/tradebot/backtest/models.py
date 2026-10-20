"""Configuración y resultados del backtest."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Optional

from ..planner import StrategyParams
from ..risk import RiskLimits


@dataclass
class BacktestConfig:
    symbol: str
    params: StrategyParams = field(default_factory=StrategyParams)
    limits: RiskLimits = field(default_factory=RiskLimits)
    initial_balance: float = 10_000.0
    spread_points: Optional[int] = None    # None = usar el spread histórico de cada vela
    commission_per_lot: float = 0.0        # por lado (apertura y cierre), en moneda de la cuenta
    slippage_points: int = 0               # deslizamiento adverso en entradas y salidas a mercado
    trade_from: Optional[datetime] = None  # solo se abren operaciones desde esta fecha (lo anterior = calentamiento)
    trade_to: Optional[datetime] = None    # ... y antes de esta

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "params": self.params.to_dict(),
            "limits": self.limits.to_dict(),
            "initial_balance": self.initial_balance,
            "spread_points": self.spread_points,
            "commission_per_lot": self.commission_per_lot,
            "slippage_points": self.slippage_points,
            "trade_from": self.trade_from.isoformat() if self.trade_from else None,
            "trade_to": self.trade_to.isoformat() if self.trade_to else None,
        }


@dataclass
class BacktestTrade:
    side: str
    entry_time: str
    entry_price: float
    sl: float
    tp: float
    volume: float
    risk_money: float
    confidence: float
    ml_prob: Optional[float] = None
    exit_time: str = ""
    exit_price: float = 0.0
    exit_reason: str = ""      # sl | tp | time | end
    bars_held: int = 0
    gross_profit: float = 0.0
    commission: float = 0.0
    net_profit: float = 0.0
    r_multiple: float = 0.0    # beneficio expresado en unidades de riesgo
    balance_after: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BacktestResult:
    config: BacktestConfig
    metrics: dict
    trades: list[BacktestTrade]
    equity_curve: list[dict]
    bars: int
    period_start: str
    period_end: str
    signals: int
    blocked: dict

    def to_dict(self, include_trades: bool = True) -> dict:
        return {
            "config": self.config.to_dict(),
            "metrics": self.metrics,
            "bars": self.bars,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "signals": self.signals,
            "blocked": self.blocked,
            "equity_curve": self.equity_curve,
            "trades": [t.to_dict() for t in self.trades] if include_trades else [],
        }
