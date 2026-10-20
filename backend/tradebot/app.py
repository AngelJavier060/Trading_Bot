"""Ensambla todas las piezas del sistema en ejecución."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from .accounts import AccountBook
from .auth import Auth
from .bridge import FileBridge
from .config import Settings
from .context import Context, build_context
from .jobs import JobRunner
from .live import Supervisor, TradingBot
from .notify import Notifier
from .storage import Store

logger = logging.getLogger(__name__)


@dataclass
class System:
    settings: Settings
    ctx: Context
    store: Store
    notifier: Notifier
    bot: TradingBot
    supervisor: Supervisor
    bridge: FileBridge
    jobs: JobRunner
    auth: Auth

    def shutdown(self) -> None:
        self.supervisor.stop()
        if self.bot.running:
            self.bot.stop(by_user=False)  # seguirá encendido al volver a arrancar
        self.ctx.client.disconnect()
        self.store.close()


def build_system(settings: Optional[Settings] = None, api: Any = None, in_memory_db: bool = False,
                 supervisor_interval: float = 30.0) -> System:
    settings = settings or Settings.from_env()
    store = Store(None if in_memory_db else (settings.database_url or settings.db_path))
    prefix = f"[{settings.instance_name}] " if settings.instance_name else ""
    notifier = Notifier(settings.telegram_token, settings.telegram_chat_id, prefix=prefix)
    ctx = build_context(settings, api=api)
    ctx.accounts = AccountBook(store)
    bridge = FileBridge()
    bot = TradingBot(ctx, store, notifier, on_cycle=bridge.publish)
    supervisor = Supervisor(bot, interval=supervisor_interval, on_idle=bridge.publish)
    return System(settings, ctx, store, notifier, bot, supervisor, bridge, JobRunner(), Auth(store, settings.secret_key))
