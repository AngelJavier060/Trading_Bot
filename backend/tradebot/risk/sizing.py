"""Tamaño de posición según el riesgo por operación."""

from __future__ import annotations

from dataclasses import dataclass

from ..broker.models import SymbolSpec


@dataclass
class SizingResult:
    volume: float          # 0 si no se puede operar con ese riesgo
    risk_money: float      # dinero que se perdería si salta el SL
    reason: str = ""


def lot_for_risk(balance: float, risk_pct: float, sl_distance: float, spec: SymbolSpec) -> SizingResult:
    """Lotes para que tocar el SL cueste como máximo `risk_pct`% del balance.

    sl_distance está en unidades de precio (p. ej. 0.0015 en EURUSD = 15 pips).
    Se redondea hacia abajo. Si ni el volumen mínimo cabe dentro del riesgo,
    devuelve volume=0 en lugar de arriesgar más de lo permitido.
    """
    if balance <= 0 or risk_pct <= 0:
        return SizingResult(0.0, 0.0, "balance o riesgo no válidos")
    if sl_distance <= 0:
        return SizingResult(0.0, 0.0, "distancia de SL no válida")

    budget = balance * risk_pct / 100.0
    loss_per_lot = sl_distance * spec.money_per_price_unit(1.0, losing=True)
    if loss_per_lot <= 0:
        return SizingResult(0.0, 0.0, "valor de tick no disponible")

    volume = spec.round_volume_down(min(budget / loss_per_lot, spec.volume_max))
    if volume < spec.volume_min:
        min_risk = spec.volume_min * loss_per_lot
        return SizingResult(
            0.0, 0.0,
            f"el lote mínimo ({spec.volume_min}) arriesgaría {min_risk:.2f} y el límite es {budget:.2f}",
        )
    return SizingResult(volume, round(volume * loss_per_lot, 2))
