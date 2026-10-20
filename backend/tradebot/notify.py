"""Alertas por Telegram (opcionales).

Se activan con TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env. Los mensajes
se envían desde un hilo propio para no bloquear al bot, y los mensajes
repetidos (mismo texto) se silencian durante `dedupe_seconds`.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
import urllib.request
from typing import Optional

logger = logging.getLogger(__name__)


class Notifier:
    def __init__(self, token: str = "", chat_id: str = "", dedupe_seconds: int = 600, prefix: str = ""):
        self.token = token
        self.chat_id = chat_id
        self.prefix = prefix
        self.dedupe_seconds = dedupe_seconds
        self._recent: dict[str, float] = {}
        self._queue: "queue.Queue[str]" = queue.Queue(maxsize=200)
        self._thread: Optional[threading.Thread] = None
        self.sent: list[str] = []  # historial (útil en tests y para la API)
        if self.enabled:
            self._thread = threading.Thread(target=self._worker, name="telegram", daemon=True)
            self._thread.start()

    @property
    def enabled(self) -> bool:
        return bool(self.token and self.chat_id)

    def send(self, text: str) -> None:
        now = time.monotonic()
        last = self._recent.get(text)
        if last is not None and now - last < self.dedupe_seconds:
            return
        self._recent[text] = now
        message = f"{self.prefix}{text}" if self.prefix else text
        self.sent.append(message)
        del self.sent[:-100]
        if not self.enabled:
            logger.info("[alerta] %s", message)
            return
        try:
            self._queue.put_nowait(message)
        except queue.Full:
            logger.warning("Cola de Telegram llena; se descarta: %s", message)

    def _worker(self) -> None:
        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        while True:
            message = self._queue.get()
            payload = json.dumps({"chat_id": self.chat_id, "text": message, "disable_web_page_preview": True})
            for attempt in range(3):
                try:
                    req = urllib.request.Request(url, data=payload.encode(), headers={"Content-Type": "application/json"})
                    urllib.request.urlopen(req, timeout=15).read()
                    break
                except Exception as exc:  # red caída, token inválido...
                    logger.warning("Telegram falló (intento %d): %s", attempt + 1, exc)
                    time.sleep(5 * (attempt + 1))
