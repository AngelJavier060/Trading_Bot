"""Validación walk-forward.

Se divide el histórico en ventanas consecutivas: se "aprende" en una ventana de
entrenamiento y se mide en la ventana siguiente, que el sistema no vio. Se
avanza y se repite. Solo cuentan los resultados de las ventanas de prueba.

Modos:
  fixed     sin aprendizaje: mide los parámetros tal cual en cada ventana de prueba.
  optimize  en cada ventana de entrenamiento elige la mejor combinación de una
            rejilla de parámetros (p. ej. SL/TP) y la aplica en la de prueba.
  ml        en cada ventana de entrenamiento entrena el filtro ML y lo aplica en
            la de prueba. Se compara con la misma estrategia sin filtro.

En todos los modos se calcula también la referencia (parámetros base sin ML)
en las mismas ventanas, para comparar en igualdad de condiciones.
"""

from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd

from ..backtest import BacktestConfig, BacktestEngine
from ..backtest.engine import compute_signals
from ..backtest.metrics import compute_metrics
from ..backtest.models import BacktestTrade
from ..broker import timeframes
from ..broker.models import SymbolSpec
from ..ml.labeling import build_signal_dataset
from ..ml.model import SignalModel
from .evaluation import bootstrap_r

logger = logging.getLogger(__name__)


@dataclass
class Fold:
    train_start: datetime
    train_end: datetime    # = inicio de la prueba
    test_end: datetime

    def to_dict(self) -> dict:
        return {"train_start": self.train_start.isoformat(), "train_end": self.train_end.isoformat(),
                "test_end": self.test_end.isoformat()}


@dataclass
class WalkForwardResult:
    mode: str
    folds: list[dict]
    candidate: dict                 # métricas fuera de muestra del candidato (+ bootstrap)
    baseline: dict                  # métricas fuera de muestra de la referencia
    candidate_trades: list[BacktestTrade] = field(default_factory=list)
    baseline_trades: list[BacktestTrade] = field(default_factory=list)

    def to_dict(self, include_trades: bool = False) -> dict:
        d = {"mode": self.mode, "folds": self.folds, "candidate": self.candidate, "baseline": self.baseline}
        if include_trades:
            d["candidate_trades"] = [t.to_dict() for t in self.candidate_trades]
            d["baseline_trades"] = [t.to_dict() for t in self.baseline_trades]
        return d


def make_folds(start: datetime, end: datetime, train_days: int, test_days: int,
               anchored: bool = False) -> list[Fold]:
    """Ventanas consecutivas. anchored=True: el entrenamiento siempre empieza en `start`."""
    folds = []
    test_start = start + timedelta(days=train_days)
    while test_start + timedelta(days=test_days) <= end + timedelta(days=1):
        test_end = min(test_start + timedelta(days=test_days), end)
        train_start = start if anchored else test_start - timedelta(days=train_days)
        folds.append(Fold(train_start, test_start, test_end))
        test_start = test_end
        if test_end >= end:
            break
    if not folds:
        raise ValueError(f"El periodo no alcanza para {train_days} días de entrenamiento + {test_days} de prueba")
    return folds


def parse_grid(text: str) -> dict:
    """'sl_atr_mult=1,1.5,2;tp_atr_mult=2,3' -> {'sl_atr_mult': [1.0, 1.5, 2.0], 'tp_atr_mult': [2.0, 3.0]}"""
    grid = {}
    for part in (text or "").split(";"):
        if "=" in part:
            k, vals = part.split("=", 1)
            grid[k.strip()] = [_num(v) for v in vals.split(",") if v.strip()]
    return grid


def _num(v: str):
    v = v.strip()
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return v


def _apply(base: BacktestConfig, overrides: dict, **window) -> BacktestConfig:
    params = replace(base.params, **{k: v for k, v in overrides.items() if hasattr(base.params, k)})
    limits = replace(base.limits, **{k: v for k, v in overrides.items() if hasattr(base.limits, k)})
    return replace(base, params=params, limits=limits, **window)


def _score(m: dict, min_trades: int) -> float:
    """Objetivo para elegir parámetros en entrenamiento: R medio, penalizando pocas operaciones."""
    if m["total_trades"] < min_trades:
        return float("-inf")
    return m["avg_r"] * min(1.0, m["total_trades"] / (3 * min_trades)) ** 0.5


def _summarize(trades: list[BacktestTrade], initial_balance: float) -> dict:
    trades = sorted(trades, key=lambda t: t.entry_time)
    if trades:
        net = pd.Series([t.net_profit for t in trades],
                        index=pd.DatetimeIndex([pd.Timestamp(t.exit_time) for t in trades])).sort_index()
        equity = initial_balance + net.cumsum()
    else:
        equity = pd.Series(dtype=float)
    m = compute_metrics(trades, initial_balance, equity)
    m["bootstrap"] = bootstrap_r([t.r_multiple for t in trades])
    return m


def run_walkforward(
    df: pd.DataFrame,
    spec: SymbolSpec,
    base: BacktestConfig,
    folds: list[Fold],
    mode: str = "fixed",
    grid: Optional[dict] = None,
    min_trades_train: int = 20,
    ml_threshold: Optional[float] = None,
) -> WalkForwardResult:
    if mode not in ("fixed", "optimize", "ml"):
        raise ValueError("mode debe ser fixed, optimize o ml")
    if mode == "optimize" and not grid:
        raise ValueError("El modo optimize necesita una rejilla de parámetros (grid)")
    df = df.sort_values("time").reset_index(drop=True)
    tf_seconds = timeframes.minutes(base.params.timeframe) * 60

    # La señal no depende de SL/TP/riesgo/ML: se calcula una vez por cada juego de parámetros de estrategia
    signal_cache: dict = {}

    def signals_for(cfg: BacktestConfig) -> list:
        key = (cfg.params.strategy, repr(sorted(cfg.params.strategy_params.items())), cfg.params.lookback,
               cfg.params.htf_timeframe, cfg.params.atr_period)
        if key not in signal_cache:
            signal_cache[key] = compute_signals(cfg.params.build_strategy(), df, cfg.params, spec.name)
        return signal_cache[key]

    def backtest(cfg: BacktestConfig, model: Optional[SignalModel] = None):
        return BacktestEngine(cfg, spec, model=model).run(df, signals=signals_for(cfg))

    fold_reports, cand_trades, base_trades = [], [], []
    for k, fold in enumerate(folds, 1):
        test_window = dict(trade_from=fold.train_end, trade_to=fold.test_end)
        train_window = dict(trade_from=fold.train_start, trade_to=fold.train_end)
        report = {"fold": k, **fold.to_dict()}

        baseline_res = backtest(_apply(base, {}, **test_window))
        base_trades += baseline_res.trades
        report["baseline"] = _short(baseline_res.metrics)

        if mode == "fixed":
            cand_res = baseline_res
        elif mode == "optimize":
            keys = list(grid)
            best, best_score = {}, float("-inf")
            for combo in itertools.product(*(grid[key] for key in keys)):
                overrides = dict(zip(keys, combo))
                m = backtest(_apply(base, overrides, **train_window)).metrics
                score = _score(m, min_trades_train)
                if score > best_score:
                    best, best_score = overrides, score
            report["chosen"] = best
            report["train_score"] = None if best_score == float("-inf") else round(best_score, 4)
            cand_res = backtest(_apply(base, best, **test_window))
        else:  # ml
            params = base.params
            data = build_signal_dataset(df, spec, params, trade_from=fold.train_start, trade_to=fold.train_end,
                                        spread_points=base.spread_points, signals=signals_for(base))
            # Purga: fuera las señales cuyo resultado se conoció ya dentro de la ventana de prueba
            resolved = pd.to_datetime(data["time"], utc=True) + pd.to_timedelta(data["bars"] * tf_seconds, unit="s")
            data = data[resolved < pd.Timestamp(fold.train_end)]
            report["train_samples"] = int(len(data))
            if len(data) < 100 or data["label"].nunique() < 2:
                report["skipped"] = "muy pocas señales para entrenar; se usa la referencia"
                cand_res = baseline_res
            else:
                model = SignalModel().fit(data, data["label"])
                test_data = build_signal_dataset(df, spec, params, trade_from=fold.train_end, trade_to=fold.test_end,
                                                 spread_points=base.spread_points, signals=signals_for(base))
                if len(test_data):
                    report["test_signal_metrics"] = SignalModel.evaluate(test_data["label"], model.predict_proba(test_data))
                threshold = ml_threshold if ml_threshold is not None else base.params.ml_threshold
                cfg = _apply(base, {"ml_threshold": threshold}, **test_window)
                cand_res = backtest(cfg, model=model)
        cand_trades += cand_res.trades
        report["candidate"] = _short(cand_res.metrics)
        fold_reports.append(report)
        logger.info("Fold %d/%d: candidato %s | referencia %s", k, len(folds), report["candidate"], report["baseline"])

    return WalkForwardResult(
        mode=mode,
        folds=fold_reports,
        candidate=_summarize(cand_trades, base.initial_balance),
        baseline=_summarize(base_trades, base.initial_balance),
        candidate_trades=cand_trades,
        baseline_trades=base_trades,
    )


def _short(m: dict) -> dict:
    return {k: m[k] for k in ("total_trades", "win_rate", "profit_factor", "net_profit", "avg_r", "max_drawdown_pct")}
