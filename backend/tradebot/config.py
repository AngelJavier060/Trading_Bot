"""Configuración desde variables de entorno (archivo .env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from .broker.symbols import parse_symbol_map

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    return default if not raw else raw.lower() in ("1", "true", "yes", "si", "sí")


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    return int(raw) if raw else default


@dataclass
class Settings:
    # Conexión MT5 (vacío = usar la cuenta que ya tenga abierta el terminal)
    mt5_login: Optional[int] = None
    mt5_password: str = ""
    mt5_server: str = ""
    mt5_path: str = ""
    symbol_map: dict = field(default_factory=dict)

    # Seguridad
    allow_real_account: bool = False   # el bot se niega a operar en cuentas reales salvo que se active
    magic: int = 234000

    # Base de datos (vacío = SQLite en data/tradebot.db)
    database_url: str = ""

    # API
    api_host: str = "127.0.0.1"
    api_port: int = 5000
    api_token: str = ""                # token de servicio (EA remoto, vigilante, scripts)
    secret_key: str = ""               # firma de las sesiones de usuario ("" = se genera y se guarda)
    frontend_origins: tuple = ("http://localhost:3000", "http://127.0.0.1:3000")

    # Alertas
    telegram_token: str = ""
    telegram_chat_id: str = ""
    instance_name: str = ""            # prefijo de las alertas (útil con varios VPS)

    # Puente con MT5: carpeta "Common\Files" del terminal ("" = autodetectar)
    mt5_common_files: str = ""
    # Terminal MT5 dedicado al Probador de Estrategias (instalación aparte, modo portable)
    mt5_tester_path: str = ""

    # Rutas
    data_dir: Path = PROJECT_ROOT / "data"

    @classmethod
    def from_env(cls, env_file: Optional[Path] = None) -> "Settings":
        load_dotenv(env_file or PROJECT_ROOT / ".env")
        login = _env("MT5_LOGIN")
        return cls(
            mt5_login=int(login) if login else None,
            mt5_password=_env("MT5_PASSWORD"),
            mt5_server=_env("MT5_SERVER"),
            mt5_path=_env("MT5_PATH"),
            symbol_map=parse_symbol_map(_env("SYMBOL_MAP")),
            allow_real_account=_env_bool("ALLOW_REAL_ACCOUNT", False),
            magic=_env_int("BOT_MAGIC", 234000),
            api_host=_env("API_HOST", "127.0.0.1"),
            api_port=_env_int("API_PORT", 5000),
            api_token=_env("API_TOKEN"),
            database_url=_env("DATABASE_URL"),
            secret_key=_env("SECRET_KEY"),
            frontend_origins=tuple(o.strip().rstrip("/") for o in
                                   (_env("FRONTEND_ORIGINS") or "http://localhost:3000,http://127.0.0.1:3000").split(",")
                                   if o.strip()),
            telegram_token=_env("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=_env("TELEGRAM_CHAT_ID"),
            instance_name=_env("INSTANCE_NAME"),
            mt5_common_files=_env("MT5_COMMON_FILES"),
            mt5_tester_path=_env("MT5_TESTER_PATH"),
            data_dir=Path(_env("DATA_DIR") or PROJECT_ROOT / "data"),
        )

    @property
    def db_path(self) -> Path:
        return self.data_dir / "tradebot.db"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def reports_dir(self) -> Path:
        return self.data_dir / "backtests"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"
