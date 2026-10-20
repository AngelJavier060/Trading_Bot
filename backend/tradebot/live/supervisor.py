"""Supervisor: mantiene el bot vivo sin intervención.

Cada `interval` segundos:
- Si el bot debería estar encendido (lo dejó así el usuario) y no lo está — por
  ejemplo tras reiniciar el VPS o porque MT5 aún no había abierto — lo arranca.
- Si el bot está encendido pero no completa ciclos (heartbeat viejo), avisa y
  marca el sistema como no sano: /api/health devuelve 503 y el watchdog externo
  (deploy/watchdog.ps1) reinicia el proceso.
- Con el bot apagado, mantiene la conexión con MT5 para que la API responda.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable, Optional

from ..broker.models import MT5Error
from .engine import TradingBot

logger = logging.getLogger(__name__)


class Supervisor:
    def __init__(self, bot: TradingBot, interval: float = 30.0,
                 on_idle: Optional[Callable[[TradingBot], None]] = None):
        self.bot = bot
        self.interval = interval
        self.on_idle = on_idle  # se llama en cada revisión con el bot apagado (p. ej. publicar estado)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.last_start_error = ""
        self._stale_alerted = False

    def stale_after(self) -> float:
        poll = self.bot.config.poll_seconds if self.bot.config else 10.0
        return max(6 * poll, 180.0)

    def healthy(self) -> tuple[bool, str]:
        if self.bot.running:
            age = self.bot.heartbeat_age()
            if age is None:
                return True, "arrancando"
            if age > self.stale_after():
                return False, f"el bot no completa ciclos hace {age:.0f}s"
        elif self.bot.wants_to_run:
            return True, f"esperando para arrancar: {self.last_start_error or 'pendiente'}"
        return True, "ok"

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name="supervisor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=10)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.check_once()
            except Exception:
                logger.exception("Error en el supervisor")
            self._stop.wait(self.interval)

    def check_once(self) -> None:
        bot = self.bot
        if bot.wants_to_run and not bot.running:
            config = bot.saved_config()
            try:
                bot.start(config, persist=False, confirm_real=True)
                self.last_start_error = ""
                bot.store.log_event("bot_resumed")
                logger.info("Supervisor: bot reanudado con la configuración guardada")
            except (MT5Error, RuntimeError, ValueError) as exc:
                if str(exc) != self.last_start_error:
                    logger.warning("Supervisor: no se pudo reanudar el bot: %s", exc)
                    bot.notifier.send(f"⏳ El bot no puede arrancar todavía: {exc}")
                self.last_start_error = str(exc)
            return

        ok, reason = self.healthy()
        if not ok and not self._stale_alerted:
            self._stale_alerted = True
            bot.store.log_event("bot_stale", reason=reason)
            bot.notifier.send(f"🚨 {reason}. El watchdog reiniciará el proceso.")
        elif ok:
            self._stale_alerted = False

        logged_out = bool(bot.store.get("mt5_logged_out", False))  # el usuario cerró sesión en el panel
        if not bot.running and not logged_out and not bot.ctx.client.is_connected():
            try:
                bot.ctx.connect()
            except MT5Error as exc:
                logger.debug("Supervisor: MT5 sigue sin conexión: %s", exc)
        if not bot.running and self.on_idle is not None:
            self.on_idle(bot)
