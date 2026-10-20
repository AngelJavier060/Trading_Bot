"""Carga y listado de modelos guardados en data/models."""

from __future__ import annotations

import threading
from pathlib import Path

from .model import SignalModel

_cache: dict[str, SignalModel] = {}
_lock = threading.Lock()


def load_model(models_dir: Path, model_id: str) -> SignalModel:
    key = str(models_dir / model_id)
    with _lock:
        if key not in _cache:
            path = models_dir / f"{model_id}.joblib"
            if not path.exists():
                raise ValueError(f"No existe el modelo {model_id!r} en {models_dir}")
            _cache[key] = SignalModel.load(path)
        return _cache[key]


def list_models(models_dir: Path) -> list[dict]:
    if not models_dir.exists():
        return []
    out = []
    for path in sorted(models_dir.glob("*.joblib"), reverse=True):
        try:
            out.append(load_model(models_dir, path.stem).info.to_dict())
        except Exception as exc:  # archivo dañado o de otra versión
            out.append({"id": path.stem, "error": str(exc)})
    return out
