"""Entrenamiento del modelo que se usará en vivo."""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from ..planner import StrategyParams
from .model import ModelInfo, SignalModel, new_model_id


def train_model(dataset: pd.DataFrame, params: StrategyParams, symbols: list[str],
                holdout_fraction: float = 0.2) -> SignalModel:
    """Entrena con el dataset de señales (puede mezclar símbolos).

    Validación: se entrena con el primer 80% en el tiempo y se mide en el último 20%
    (que el modelo no vio). Después se reentrena con todo para usarlo en vivo.
    """
    data = dataset.sort_values("time").reset_index(drop=True)
    if len(data) < 200:
        raise ValueError(f"Solo hay {len(data)} señales: se necesitan al menos 200 para entrenar")
    if data["label"].nunique() < 2:
        raise ValueError("Todas las señales tienen el mismo resultado; no hay nada que aprender")

    cut = int(len(data) * (1 - holdout_fraction))
    train, holdout = data.iloc[:cut], data.iloc[cut:]
    validation = SignalModel.evaluate(holdout["label"], SignalModel().fit(train, train["label"]).predict_proba(holdout))
    validation["holdout_from"] = pd.Timestamp(holdout["time"].iloc[0]).isoformat()

    info = ModelInfo(
        id=new_model_id(params.strategy, params.timeframe),
        created=datetime.now(timezone.utc).isoformat(),
        strategy=params.strategy,
        symbols=symbols,
        timeframe=params.timeframe,
        train_start=pd.Timestamp(data["time"].iloc[0]).isoformat(),
        train_end=pd.Timestamp(data["time"].iloc[-1]).isoformat(),
        samples=int(len(data)),
        base_rate=round(float(data["label"].mean()), 4),
        params=params.to_dict(),
        validation=validation,
    )
    return SignalModel(info).fit(data, data["label"])
