"""Criterios objetivos para decidir si un cambio mejora el sistema.

Una mejora solo se acepta si, FUERA DE MUESTRA (walk-forward), supera a la
referencia en las métricas clave sin empeorar el riesgo, y con suficientes
operaciones como para que no sea casualidad.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np


@dataclass
class Criteria:
    min_trades: int = 30                 # operaciones fuera de muestra como mínimo
    min_profit_factor: float = 1.05      # el candidato debe tener al menos este PF
    min_pf_improvement: float = 0.03     # y superar el PF de la referencia en esto
    max_dd_ratio: float = 1.25           # DD del candidato <= DD de la referencia x 1.25
    min_prob_edge: float = 0.80          # P(R medio > 0) por bootstrap

    def to_dict(self) -> dict:
        return asdict(self)


def bootstrap_r(r_values, n_boot: int = 2000, seed: int = 7) -> dict:
    """Intervalo de confianza del R medio por operación y probabilidad de que sea > 0."""
    r = np.asarray([x for x in r_values if x == x], dtype=float)
    if len(r) < 2:
        return {"n": int(len(r)), "mean_r": float(r.mean()) if len(r) else 0.0,
                "ci95_low": None, "ci95_high": None, "prob_edge": 0.0}
    rng = np.random.default_rng(seed)
    means = rng.choice(r, size=(n_boot, len(r)), replace=True).mean(axis=1)
    return {
        "n": int(len(r)),
        "mean_r": round(float(r.mean()), 4),
        "ci95_low": round(float(np.percentile(means, 2.5)), 4),
        "ci95_high": round(float(np.percentile(means, 97.5)), 4),
        "prob_edge": round(float((means > 0).mean()), 4),
    }


def verdict(candidate: dict, baseline: dict | None, criteria: Criteria | None = None) -> dict:
    """Compara métricas (las de compute_metrics + 'bootstrap'). Devuelve checks y si pasa."""
    c = criteria or Criteria()
    checks = []

    def add(name: str, passed: bool, detail: str) -> None:
        checks.append({"check": name, "passed": bool(passed), "detail": detail})

    n = candidate.get("total_trades", 0)
    add("operaciones suficientes", n >= c.min_trades, f"{n} >= {c.min_trades}")
    pf = candidate.get("profit_factor", 0.0)
    add("profit factor mínimo", pf >= c.min_profit_factor, f"{pf} >= {c.min_profit_factor}")
    prob = (candidate.get("bootstrap") or {}).get("prob_edge", 0.0)
    add("ventaja estadística", prob >= c.min_prob_edge, f"P(R>0) {prob} >= {c.min_prob_edge}")

    if baseline:
        bpf = baseline.get("profit_factor", 0.0)
        add("mejora el PF de la referencia", pf >= bpf + c.min_pf_improvement,
            f"{pf} >= {bpf} + {c.min_pf_improvement}")
        bavg, cavg = baseline.get("avg_r", 0.0), candidate.get("avg_r", 0.0)
        add("mejora el R medio", cavg > bavg, f"{cavg} > {bavg}")
        bdd, cdd = baseline.get("max_drawdown_pct", 0.0), candidate.get("max_drawdown_pct", 0.0)
        limit = max(bdd * c.max_dd_ratio, 1.0)
        add("drawdown controlado", cdd <= limit, f"{cdd}% <= {limit:.2f}%")

    return {"passed": all(x["passed"] for x in checks), "checks": checks, "criteria": c.to_dict()}
