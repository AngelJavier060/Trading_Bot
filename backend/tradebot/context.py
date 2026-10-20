"""Construcción de los objetos compartidos (cliente MT5, resolver, datos, ejecutor)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Optional

from .broker import MarketData, MT5Client, MT5Error, OrderExecutor, SymbolResolver
from .broker.client import AUTH_FAILED
from .config import Settings

if TYPE_CHECKING:
    from .accounts import AccountBook

logger = logging.getLogger(__name__)


@dataclass
class Context:
    settings: Settings
    client: MT5Client
    resolver: SymbolResolver
    market: MarketData
    executor: OrderExecutor
    accounts: Optional["AccountBook"] = None

    def connect(self, login: Optional[int] = None, password: str = "", server: str = "", path: str = ""):
        """Conecta a MT5.

        Prioridad: credenciales indicadas > cuenta activa elegida en el panel >
        credenciales de .env > la cuenta que tenga abierta el terminal.
        """
        if not login:
            active = self.accounts.active() if self.accounts else None
            if active is not None:
                return self._connect_saved(active)
            s = self.settings
            login, password, server, path = s.mt5_login, s.mt5_password, s.mt5_server, s.mt5_path
        account = self.client.connect(login=login, password=password, server=server, path=path or None)
        self.resolver.clear_cache()
        return account

    def _connect_saved(self, acc):
        password = self.accounts.password(acc)
        if password:
            account = self.client.connect(login=acc.login, password=password, server=acc.server, path=acc.path or None)
        else:
            # Sin contraseña guardada: vale si el terminal ya está en esa cuenta
            # (o la recuerda porque se marcó "Guardar contraseña" en MT5).
            account = self.client.connect(path=acc.path or None)
            if account.login != acc.login:
                account = self.client.connect(login=acc.login, password="", server=acc.server, path=acc.path or None)
        if account.login != acc.login:
            raise MT5Error(f"No se pudo volver a la cuenta {acc.login}: el terminal está en {account.login}. "
                           "Conéctala de nuevo desde el panel.")
        self.resolver.clear_cache()
        return account

    def login_account(self, login: int, password: str, server: str, *, path: str = "", kind: str = "demo",
                      label: str = "", remember_password: bool = False):
        """Inicio de sesión desde el panel: conecta, recuerda la cuenta y la deja como activa."""
        if not login or not server:
            raise ValueError("Número de cuenta y servidor son obligatorios")
        login = int(login)
        saved = self.accounts.get(login, server) if self.accounts else None
        if not password and saved is not None:
            password = self.accounts.password(saved) or ""

        previous = None
        if self.client.is_connected():
            current = self.client.account()
            previous = (current.login, current.server)

        note = ""
        if previous == (login, server) and not path:
            # Ya está conectada: no se vuelve a autenticar. Si la contraseña escrita estuviera mal,
            # MT5 perdería la sesión que funciona (y reemplazaría la contraseña que tiene guardada).
            account = self.client.account()
            if remember_password and password and not (saved and saved.password_enc):
                note = ("La cuenta ya estaba conectada: no se guardó la contraseña porque no se pudo verificar "
                        "sin cerrar la sesión.")
            password = None  # nunca guardar una contraseña sin verificar (se conserva la ya guardada, si hay)
        else:
            try:
                account = self.client.connect(login=login, password=password, server=server, path=path or None)
            except MT5Error as exc:
                if exc.code == AUTH_FAILED and previous is not None:
                    restored = self._restore(previous)
                    suffix = (f" Se volvió a la cuenta anterior {previous[0]}." if restored
                              else " El terminal quedó sin sesión: vuelve a iniciar sesión en una cuenta.")
                    raise MT5Error(str(exc) + suffix, code=exc.code) from exc
                raise
        self.resolver.clear_cache()
        if self.accounts is not None:
            real_kind = "demo" if account.is_demo else "real"
            self.accounts.remember(account.login, account.server, label=label, kind=real_kind, path=path,
                                   password=password, keep_password=remember_password,
                                   name=account.name, currency=account.currency)
            self.accounts.set_active(account.login, account.server)
        warnings = [note] if note else []
        if kind == "demo" and not account.is_demo:
            warnings.append("Elegiste DEMO pero MT5 informa que la cuenta es REAL.")
        elif kind == "real" and account.is_demo:
            warnings.append("Elegiste REAL pero MT5 informa que la cuenta es DEMO.")
        return account, " ".join(warnings)

    def _restore(self, previous: tuple[int, str]) -> bool:
        """Tras un inicio de sesión fallido, intenta volver a la cuenta que funcionaba."""
        login, server = previous
        saved = self.accounts.get(login, server) if self.accounts else None
        password = (self.accounts.password(saved) if saved else None) or ""
        try:
            account = self.client.connect(login=login, password=password, server=server,
                                          path=(saved.path if saved else "") or None)
            return account.login == login
        except MT5Error:
            logger.warning("No se pudo volver a la cuenta %s tras el inicio de sesión fallido", login)
            return False


def build_context(settings: Optional[Settings] = None, api: Any = None) -> Context:
    settings = settings or Settings.from_env()
    client = MT5Client(api=api)
    resolver = SymbolResolver(client, settings.symbol_map)
    return Context(
        settings=settings,
        client=client,
        resolver=resolver,
        market=MarketData(client, resolver),
        executor=OrderExecutor(client, resolver, magic=settings.magic),
    )
