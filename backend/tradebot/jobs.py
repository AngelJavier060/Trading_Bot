"""Tareas largas (backtest, walk-forward, conciliación) en segundo plano para la API."""

from __future__ import annotations

import logging
import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, max_jobs: int = 50):
        self._jobs: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._busy = threading.Semaphore(1)  # una tarea pesada a la vez: no competir con el bot por MT5
        self.max_jobs = max_jobs

    def submit(self, kind: str, fn: Callable[[], Any], params: dict | None = None) -> dict:
        job_id = uuid.uuid4().hex[:10]
        job = {"id": job_id, "kind": kind, "params": params or {}, "status": "queued",
               "created": datetime.now(timezone.utc).isoformat(), "result": None, "error": None}
        with self._lock:
            self._jobs[job_id] = job
            for old in list(self._jobs)[:-self.max_jobs]:
                self._jobs.pop(old, None)

        def run():
            with self._busy:
                job["status"] = "running"
                job["started"] = datetime.now(timezone.utc).isoformat()
                try:
                    job["result"] = fn()
                    job["status"] = "done"
                except Exception as exc:
                    logger.exception("Tarea %s (%s) falló", job_id, kind)
                    job["status"] = "error"
                    job["error"] = f"{type(exc).__name__}: {exc}"
                    job["trace"] = traceback.format_exc(limit=5)
                job["finished"] = datetime.now(timezone.utc).isoformat()

        threading.Thread(target=run, name=f"job-{kind}", daemon=True).start()
        return self.get(job_id, include_result=False)

    def get(self, job_id: str, include_result: bool = True) -> dict:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            raise ValueError(f"No existe la tarea {job_id}")
        return dict(job) if include_result else {k: v for k, v in job.items() if k != "result"}

    def list(self) -> list[dict]:
        with self._lock:
            return [{k: v for k, v in j.items() if k not in ("result", "trace")} for j in reversed(self._jobs.values())]
