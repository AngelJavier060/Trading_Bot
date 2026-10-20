"""Límites de riesgo que se comprueban antes de abrir cada operación."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class RiskLimits:
    risk_per_trade_pct: float = 0.5     # % del balance arriesgado por operación
    max_daily_loss_pct: float = 3.0     # se deja de operar si la equity cae este % en el día
    max_open_positions: int = 3
    max_trades_per_day: int = 10
    max_spread_points: int = 0          # 0 = sin filtro
    one_position_per_symbol: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RiskContext:
    equity: float
    day_start_equity: float
    open_symbols: list[str] = field(default_factory=list)
    trades_today: int = 0
    spread_points: int = 0


def check(limits: RiskLimits, ctx: RiskContext, symbol: str) -> tuple[bool, str]:
    """(permitido, motivo). El motivo explica por qué se bloquea."""
    if ctx.day_start_equity > 0:
        dd_pct = (ctx.day_start_equity - ctx.equity) / ctx.day_start_equity * 100
        if dd_pct >= limits.max_daily_loss_pct:
            return False, f"pérdida diaria {dd_pct:.2f}% >= límite {limits.max_daily_loss_pct}%"
    if len(ctx.open_symbols) >= limits.max_open_positions:
        return False, f"máximo de posiciones abiertas ({limits.max_open_positions})"
    if limits.one_position_per_symbol and symbol in ctx.open_symbols:
        return False, f"ya hay una posición abierta en {symbol}"
    if ctx.trades_today >= limits.max_trades_per_day:
        return False, f"máximo de operaciones por día ({limits.max_trades_per_day})"
    if limits.max_spread_points and ctx.spread_points > limits.max_spread_points:
        return False, f"spread {ctx.spread_points} > máximo {limits.max_spread_points} puntos"
    return True, ""
