"""
Telegram notification service.

Envío opcional de notificaciones cuando el bot dispara stops de protección
(racha de pérdidas, objetivo diario, límite diario, etc.).

Configuración por variables de entorno:
    TELEGRAM_BOT_TOKEN  - token del bot
    TELEGRAM_CHAT_ID    - chat id destino

Si alguna falta, el servicio queda deshabilitado y los métodos hacen no-op.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)


class TelegramService:
    def __init__(self) -> None:
        self.token: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN") or None
        self.chat_id: Optional[str] = os.getenv("TELEGRAM_CHAT_ID") or None
        self._enabled: bool = bool(self.token and self.chat_id)

    @property
    def enabled(self) -> bool:
        return self._enabled

    def configure(self, token: Optional[str], chat_id: Optional[str]) -> bool:
        """Reconfigura runtime; devuelve si quedó habilitado."""
        self.token = token or None
        self.chat_id = chat_id or None
        self._enabled = bool(self.token and self.chat_id)
        return self._enabled

    def send(self, message: str, *, stop_type: Optional[str] = None) -> bool:
        """Envía mensaje en background. No-op si no está configurado."""
        if not self._enabled:
            logger.debug("Telegram disabled: skipping notification")
            return False
        thread = threading.Thread(
            target=self._send_blocking, args=(message,), daemon=True
        )
        thread.start()
        return True

    def _send_blocking(self, message: str) -> None:
        try:
            import requests  # type: ignore
        except ImportError:
            logger.warning("requests not installed; cannot send Telegram message")
            return
        try:
            url = f"https://api.telegram.org/bot{self.token}/sendMessage"
            resp = requests.post(
                url,
                json={
                    "chat_id": self.chat_id,
                    "text": message,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
                timeout=8,
            )
            if not resp.ok:
                logger.warning(f"Telegram send failed: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.warning(f"Telegram send error: {e}")


telegram_service = TelegramService()
