"""Arranca el sistema completo: conexión MT5, supervisor, bot (si quedó encendido), puente y API.

    .venv\\Scripts\\python run.py

Pensado para correr sin supervisión (VPS): si el bot estaba encendido antes de
un reinicio, el supervisor lo retoma con la configuración guardada en cuanto
MT5 esté disponible.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path


def _relaunch_in_venv() -> None:
    """`python run.py` debe usar backend/.venv (ahí está psycopg y el resto)."""
    if os.environ.get("TRADEBOT_SKIP_VENV") == "1":
        return
    root = Path(__file__).resolve().parent
    venv_py = root / ".venv" / "Scripts" / "python.exe"
    if not venv_py.is_file():
        venv_py = root / ".venv" / "bin" / "python"
    if not venv_py.is_file():
        return
    try:
        in_venv = Path(sys.prefix).resolve() == (root / ".venv").resolve()
    except OSError:
        in_venv = False
    if in_venv:
        return
    print(f"Usando el entorno del proyecto: {venv_py}", flush=True)
    raise SystemExit(subprocess.call([str(venv_py), *sys.argv]))


_relaunch_in_venv()

from tradebot.api import create_app
from tradebot.app import build_system
from tradebot.broker.models import MT5Error
from tradebot.config import Settings
from tradebot.logging_setup import setup_logging

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    settings = Settings.from_env()
    setup_logging(settings.logs_dir)
    log = logging.getLogger("run")

    if settings.api_host not in LOOPBACK and not settings.api_token:
        log.error("API_HOST=%s expone la API a la red sin API_TOKEN. Define API_TOKEN en .env.", settings.api_host)
        return 1

    system = build_system(settings)
    log.info("Base de datos: %s", system.store.url)
    if system.store.get("mt5_logged_out", False):
        log.info("Sesión MT5 cerrada desde el panel: elige una cuenta en http://%s:%s", settings.api_host, settings.api_port)
    else:
        try:
            account = system.ctx.connect()
            log.info("Cuenta %s @ %s (%s) balance %.2f %s", account.login, account.server, account.mode,
                     account.balance, account.currency)
        except MT5Error as exc:
            log.warning("MT5 no disponible al arrancar: %s. El supervisor reintentará.", exc)

    system.store.log_event("system_start")
    system.notifier.send("🟦 Sistema iniciado" + (" — retomando el bot" if system.bot.wants_to_run else ""))
    system.supervisor.check_once()   # reanudar el bot de inmediato si quedó encendido
    system.supervisor.start()

    app = create_app(system)
    log.info("API en http://%s:%s · frontend permitido: %s", settings.api_host, settings.api_port,
             ", ".join(settings.frontend_origins))
    try:
        from waitress import serve  # servidor de producción si está instalado
        serve(app, host=settings.api_host, port=settings.api_port, threads=24)  # incluye conexiones en tiempo real
    except ImportError:
        app.run(host=settings.api_host, port=settings.api_port, debug=False, threaded=True, use_reloader=False)
    finally:
        system.store.log_event("system_stop")
        system.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
