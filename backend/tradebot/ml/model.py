"""Modelo que estima la probabilidad de que una señal termine en ganancia."""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import brier_score_loss, roc_auc_score

from .features import FEATURE_NAMES


@dataclass
class ModelInfo:
    id: str
    created: str
    strategy: str
    symbols: list
    timeframe: str
    train_start: str
    train_end: str
    samples: int
    base_rate: float               # % de señales ganadoras en el entrenamiento
    params: dict = field(default_factory=dict)
    validation: dict = field(default_factory=dict)
    feature_names: list = field(default_factory=lambda: list(FEATURE_NAMES))

    def to_dict(self) -> dict:
        return asdict(self)


class SignalModel:
    """Gradient boosting poco profundo y regularizado: con pocos miles de ejemplos
    ruidosos, un modelo simple generaliza mejor que uno complejo."""

    def __init__(self, info: Optional[ModelInfo] = None, **hyper):
        self.info = info
        self.hyper = {
            "max_depth": 3,
            "learning_rate": 0.05,
            "max_iter": 200,
            "min_samples_leaf": 40,
            "l2_regularization": 1.0,
            "early_stopping": True,
            "validation_fraction": 0.2,
            "random_state": 42,
            **hyper,
        }
        self.clf = HistGradientBoostingClassifier(**self.hyper)

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "SignalModel":
        if len(np.unique(y)) < 2:
            raise ValueError("El conjunto de entrenamiento solo tiene una clase (todas ganan o todas pierden)")
        self.clf.fit(X[FEATURE_NAMES], y)
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.clf.predict_proba(X[FEATURE_NAMES])[:, 1]

    def predict_proba_one(self, features: dict) -> float:
        return float(self.predict_proba(pd.DataFrame([features]))[0])

    @staticmethod
    def evaluate(y_true, prob) -> dict:
        y_true = np.asarray(y_true)
        out = {"samples": int(len(y_true)), "base_rate": round(float(y_true.mean()), 4) if len(y_true) else 0.0}
        if len(np.unique(y_true)) == 2:
            out["auc"] = round(float(roc_auc_score(y_true, prob)), 4)
            out["brier"] = round(float(brier_score_loss(y_true, prob)), 4)
        return out

    # ── persistencia ────────────────────────────────────────────────────

    def save(self, models_dir: Path) -> Path:
        if self.info is None:
            raise ValueError("El modelo necesita ModelInfo para guardarse")
        models_dir.mkdir(parents=True, exist_ok=True)
        path = models_dir / f"{self.info.id}.joblib"
        joblib.dump({"info": self.info.to_dict(), "hyper": self.hyper, "clf": self.clf}, path)
        return path

    @classmethod
    def load(cls, path: Path) -> "SignalModel":
        data = joblib.load(path)
        model = cls(ModelInfo(**data["info"]), **data["hyper"])
        model.clf = data["clf"]
        return model


def new_model_id(strategy: str, timeframe: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{strategy}_{timeframe}_{stamp}_{uuid.uuid4().hex[:4]}"
