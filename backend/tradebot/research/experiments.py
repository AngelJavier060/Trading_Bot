"""Registro de experimentos: cada prueba queda guardada para poder compararla después."""

from __future__ import annotations

import subprocess
from typing import Optional

from ..config import PROJECT_ROOT
from ..storage import Store
from .evaluation import Criteria, verdict
from .walkforward import WalkForwardResult


def code_version() -> str:
    """Commit de git actual (+ '-dirty' si hay cambios sin guardar)."""
    try:
        rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT,
                             capture_output=True, text=True, timeout=10).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "."], cwd=PROJECT_ROOT,
                               capture_output=True, text=True, timeout=10).stdout.strip()
        return (rev or "sin-git") + ("-dirty" if dirty else "")
    except Exception:
        return "desconocida"


def record_walkforward(store: Store, name: str, config: dict, result: WalkForwardResult,
                       period: tuple[str, str], criteria: Optional[Criteria] = None,
                       artifacts: Optional[dict] = None, notes: str = "") -> tuple[int, dict]:
    """Guarda un walk-forward. El veredicto compara el candidato contra la referencia
    calculada en las mismas ventanas. Devuelve (id, veredicto)."""
    baseline = None if result.mode == "fixed" else result.baseline
    v = verdict(result.candidate, baseline, criteria)
    exp_id = store.add_experiment(
        name=name,
        kind=f"walkforward_{result.mode}",
        config=config,
        metrics={"candidate": result.candidate, "baseline": result.baseline, "folds": result.folds},
        status="candidate" if v["passed"] else "rejected",
        period_start=period[0],
        period_end=period[1],
        verdict=v,
        code_version=code_version(),
        artifacts=artifacts,
        notes=notes,
    )
    return exp_id, v


def compare_experiments(store: Store, a_id: int, b_id: int, criteria: Optional[Criteria] = None) -> dict:
    """¿Es `a` mejor que `b`? Usa las métricas fuera de muestra del candidato de cada uno."""
    a, b = store.experiment(a_id), store.experiment(b_id)
    if a is None or b is None:
        raise ValueError("Experimento no encontrado")
    ma = a["metrics"].get("candidate", a["metrics"])
    mb = b["metrics"].get("candidate", b["metrics"])
    return {"a": a_id, "b": b_id, "verdict": verdict(ma, mb, criteria),
            "same_period": (a["period_start"], a["period_end"]) == (b["period_start"], b["period_end"])}
