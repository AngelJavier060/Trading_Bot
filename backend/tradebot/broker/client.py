"""Conexión con el terminal MetaTrader 5.

El paquete oficial `MetaTrader5` se comunica con un terminal de escritorio
abierto en la misma máquina Windows. Esta clase centraliza esa conexión:
todas las llamadas pasan por un lock porque la API no es segura entre hilos.

En los tests se inyecta un objeto falso con la misma interfaz (`api=`).
"""

from __future__ import annotations

import glob
import logging
import os
import sys
import threading
from typing import Any, Optional

from .models import ACCOUNT_MODES, AccountInfo, MT5Error

logger = logging.getLogger(__name__)

AUTH_FAILED = -6  # código de MT5 para "Authorization failed"

_COMMON_TERMINAL_GLOBS = [
    r"C:\Program Files\MetaTrader 5\terminal64.exe",
    r"C:\Program Files\*MetaTrader*\terminal64.exe",
    r"C:\Program Files\*MT5*\terminal64.exe",
    r"C:\Program Files (x86)\*MetaTrader*\terminal64.exe",
]


def _load_mt5_module():
    if sys.platform != "win32":
        raise MT5Error("MetaTrader 5 solo funciona en Windows con el terminal instalado.")
    try:
        import MetaTrader5  # noqa: N813
    except ImportError as exc:
        raise MT5Error("Falta el paquete MetaTrader5: pip install MetaTrader5") from exc
    return MetaTrader5


def find_terminals() -> list[str]:
    found: list[str] = []
    for pattern in _COMMON_TERMINAL_GLOBS:
        for path in glob.glob(pattern):
            if path not in found:
                found.append(path)
    return found


class MT5Client:
    def __init__(self, api: Any = None):
        self._api = api
        self._lock = threading.RLock()
        self._connected = False
        self._utc_offset: Optional[int] = None

    # ── acceso al módulo ────────────────────────────────────────────────

    @property
    def api(self):
        if self._api is None:
            self._api = _load_mt5_module()
        return self._api

    @property
    def lock(self) -> threading.RLock:
        return self._lock

    def call(self, fn: str, *args, **kwargs):
        """Llama a una función del módulo MT5 bajo el lock."""
        with self._lock:
            return getattr(self.api, fn)(*args, **kwargs)

    def last_error(self) -> tuple:
        try:
            return tuple(self.call("last_error"))
        except Exception:  # pragma: no cover - defensivo
            return (-1, "desconocido")

    def _fail(self, message: str) -> MT5Error:
        code, desc = (self.last_error() + (None, None))[:2]
        return MT5Error(f"{message} (MT5: {code} {desc})", code=code)

    # ── conexión ────────────────────────────────────────────────────────

    def connect(
        self,
        login: Optional[int] = None,
        password: Optional[str] = None,
        server: Optional[str] = None,
        path: Optional[str] = None,
        timeout_ms: int = 60_000,
    ) -> AccountInfo:
        """Inicializa el terminal y, si se dan credenciales, inicia sesión en esa cuenta.

        Sin credenciales se usa la cuenta que ya tenga abierta el terminal.
        Con credenciales, el terminal cambia a esa cuenta (como al iniciar sesión a mano).
        Si la contraseña o el servidor son incorrectos se avisa y NO se prueban otros terminales.
        """
        with self._lock:
            if self._connected or self._api is not None:
                self.disconnect()  # cambiar de cuenta o de terminal requiere cerrar la sesión anterior

            candidates: list[Optional[str]] = [path] if path else [None]
            if not path:
                candidates += find_terminals()

            initialized = False
            last_code = None
            for candidate in candidates:
                try:
                    init_kw = {"timeout": timeout_ms}
                    ok = self.api.initialize(candidate, **init_kw) if candidate else self.api.initialize(**init_kw)
                except Exception as exc:
                    logger.debug("initialize(%s) lanzó %s", candidate, exc)
                    ok = False
                if not ok:
                    last_code = self.last_error()[0]
                    continue
                if login:
                    try:
                        ok_login = bool(self.api.login(int(login), password or "", server or ""))
                    except Exception as exc:
                        logger.debug("login(%s) lanzó %s", login, exc)
                        ok_login = False
                    if not ok_login:
                        last_code = self.last_error()[0]
                        try:
                            self.api.shutdown()
                        except Exception:
                            pass
                        err = self.last_error()
                        if last_code == AUTH_FAILED:
                            raise MT5Error(
                                f"MT5 rechazó el inicio de sesión de la cuenta {login} en '{server}'. "
                                f"last_error={err[0]} {err[1]}. Revisa login, contraseña y servidor (Admiral).",
                                code=AUTH_FAILED,
                            )
                        raise self._fail(f"mt5.login() falló para la cuenta {login}")
                initialized = True
                logger.info("MT5 inicializado (%s)", candidate or "terminal por defecto")
                break
            if not initialized:
                if last_code == AUTH_FAILED and not login:
                    err = self.last_error()
                    raise MT5Error(
                        f"El terminal MT5 no tiene una sesión válida. last_error={err[0]} {err[1]}. "
                        "Inicia sesión desde el panel o en MT5.",
                        code=AUTH_FAILED,
                    )
                raise self._fail("No se pudo abrir MetaTrader 5. ¿Está instalado y abierto?")

            account = self.account()
            if login and account.login != int(login):
                raise MT5Error(f"El terminal quedó en la cuenta {account.login}, no en {login}.")
            self._connected = True
            logger.info("MT5 conectado: cuenta %s en %s (%s)", account.login, account.server, account.mode)
            return account

    def disconnect(self) -> None:
        with self._lock:
            if self._api is not None:
                try:
                    self._api.shutdown()
                except Exception:  # pragma: no cover - defensivo
                    pass
            self._connected = False
            self._utc_offset = None

    def is_connected(self) -> bool:
        if not self._connected:
            return False
        try:
            info = self.call("terminal_info")
            return bool(info and info.connected and self.call("account_info"))
        except Exception:
            return False

    def ensure_connected(self) -> None:
        if not self.is_connected():
            raise MT5Error("MT5 no está conectado. Conecta primero (POST /api/mt5/connect o scripts/check_mt5.py).")

    # ── información ─────────────────────────────────────────────────────

    def account(self) -> AccountInfo:
        a = self.call("account_info")
        if a is None:
            raise self._fail("No se pudo leer la cuenta")
        return AccountInfo(
            login=int(a.login),
            server=str(a.server),
            name=str(getattr(a, "name", "")),
            currency=str(a.currency),
            balance=float(a.balance),
            equity=float(a.equity),
            margin=float(getattr(a, "margin", 0.0)),
            margin_free=float(getattr(a, "margin_free", 0.0)),
            leverage=int(a.leverage),
            mode=ACCOUNT_MODES.get(int(a.trade_mode), "real"),
            trade_allowed=bool(a.trade_allowed),
        )

    def terminal_status(self) -> dict:
        t = self.call("terminal_info")
        if t is None:
            return {"connected": False}
        return {
            "connected": bool(t.connected),
            "algo_trading_enabled": bool(t.trade_allowed),
            "company": str(getattr(t, "company", "")),
            "path": str(getattr(t, "path", "")),
            "build": int(getattr(t, "build", 0)),
        }

    def utc_offset(self, symbol: Optional[str] = None) -> int:
        """Desfase del servidor respecto a UTC en segundos (se calcula una vez y se cachea)."""
        if self._utc_offset is None:
            if symbol is None:
                return self.server_utc_offset_seconds(None)
            self._utc_offset = self.server_utc_offset_seconds(symbol)
        return self._utc_offset

    def server_utc_offset_seconds(self, symbol: Optional[str]) -> int:
        """Diferencia horaria del servidor del broker respecto a UTC.

        MT5 entrega los tiempos de velas y ticks en la hora del servidor.
        Si MT5_SERVER_UTC_OFFSET_HOURS está definido se usa ese valor; si no,
        se estima comparando el último tick con el reloj local (redondeado a
        30 min), lo que solo es fiable con el mercado abierto.
        """
        import time

        configured = os.environ.get("MT5_SERVER_UTC_OFFSET_HOURS", "").strip()
        if configured:
            return int(float(configured) * 3600)
        if symbol is None:
            return 0
        tick = self.call("symbol_info_tick", symbol)
        if tick is None or not tick.time:
            return 0
        raw = int(tick.time) - int(time.time())
        if abs(raw) > 14 * 3600:  # tick viejo (mercado cerrado): no se puede estimar
            return 0
        return int(round(raw / 1800.0)) * 1800
