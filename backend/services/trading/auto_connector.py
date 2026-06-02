"""
Auto-Connector Service
======================
Se conecta automáticamente a IQ Option (y próximamente MT5/Quotex)
apenas arranca el servidor, usando credenciales guardadas de forma segura.

Flujo:
  1. Flask inicia → `connect_all()` se dispara en un hilo de fondo.
  2. Lee `data/credentials.json` (cifrado opcional).
  3. Conecta cada plataforma configurada.
  4. Actualiza el estado en `AutoConnector.status`.
  5. Expone el estado por API para la UI.

Seguridad:
  - Las credenciales se guardan en disco con cifrado simple (Fernet).
  - Si no hay llave, se genera una y se guarda en `data/.crypto_key`.
  - La contraseña maestra se puede pasar por variable de entorno `MASTER_PASSWORD`.
"""

import json
import os
import logging
import threading
import time
from typing import Dict, Optional, Any, List
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Cifrado opcional con Fernet ──────────────────────────────────────────
try:
    from cryptography.fernet import Fernet as _Fernet, InvalidToken as _InvalidToken

    def _get_cipher() -> Optional[Any]:
        """Devuelve un objeto Fernet si hay clave disponible."""
        key = None
        # 1. Variable de entorno
        env_key = os.environ.get("CREDENTIALS_ENCRYPTION_KEY")
        if env_key:
            try:
                key = env_key.encode() if isinstance(env_key, str) else env_key
                _Fernet(key)  # validate
            except Exception:
                key = None
        # 2. Archivo local
        if not key:
            key_path = Path("data/.crypto_key")
            if key_path.exists():
                key = key_path.read_bytes().strip()
        # 3. Generar nueva
        if not key:
            key = _Fernet.generate_key()
            Path("data").mkdir(parents=True, exist_ok=True)
            Path("data/.crypto_key").write_bytes(key + b"\n")
            logger.info("🔐 Nueva clave de cifrado generada en data/.crypto_key")
        try:
            return _Fernet(key)
        except Exception as e:
            logger.warning(f"Error creando Fernet: {e}")
            return None

    _cipher = _get_cipher()
    HAS_CRYPTO = _cipher is not None

    def encrypt_data(data: str) -> str:
        if not HAS_CRYPTO:
            return data
        return _cipher.encrypt(data.encode()).decode()

    def decrypt_data(token: str) -> str:
        if not HAS_CRYPTO:
            return token
        try:
            return _cipher.decrypt(token.encode()).decode()
        except _InvalidToken:
            logger.warning("Token de credencial inválido o corrupto")
            return ""
        except Exception as e:
            logger.warning(f"Error descifrando: {e}")
            return ""

except ImportError:
    logger.info("cryptography no instalado. Las credenciales se guardarán en texto plano.")
    HAS_CRYPTO = False

    def encrypt_data(data: str) -> str:
        return data

    def decrypt_data(token: str) -> str:
        return token


# ── Auto-Connector ───────────────────────────────────────────────────────
class AutoConnector:
    """
    Gestiona la conexión automática a plataformas de trading al iniciar.

    Uso (desde Flask):
        from services.trading.auto_connector import auto_connector
        auto_connector.connect_all()  # En segundo plano
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._connect_thread: Optional[threading.Thread] = None

        # Estado de cada plataforma
        self.status: Dict[str, Dict] = {
            "iqoption": {
                "connected": False,
                "account_type": "",
                "balance": 0.0,
                "error": None,
                "last_attempt": None,
                "email": "",
            },
            "mt5": {
                "connected": False,
                "account_type": "",
                "balance": 0.0,
                "error": None,
                "last_attempt": None,
                "login": "",
            },
            "quotex": {
                "connected": False,
                "error": None,
                "last_attempt": None,
            },
        }
        # Bandera para saber si ya se ejecutó la auto-conexión en este ciclo de vida
        self.has_auto_connected = False
        self.auto_start_bot = False  # Si True, inicia el bot automáticamente
        self.bot_config: Dict = {}  # Config para el bot si auto_start_bot=True

    # ── Gestión de credenciales ──────────────────────────────────────────

    def get_credentials_path(self) -> Path:
        return Path("data/credentials.json")

    def load_credentials(self) -> Dict:
        """Carga credenciales guardadas (descifradas)."""
        path = self.get_credentials_path()
        if not path.exists():
            return {}
        try:
            raw = path.read_text(encoding="utf-8")
            encrypted = json.loads(raw)
            decrypted = {}
            for key, value in encrypted.items():
                if isinstance(value, str) and value:
                    decrypted[key] = decrypt_data(value)
                else:
                    decrypted[key] = value
            return decrypted
        except Exception as e:
            logger.error(f"Error cargando credenciales: {e}")
            return {}

    def save_credentials(self, credentials: Dict) -> bool:
        """Guarda credenciales (cifradas)."""
        try:
            Path("data").mkdir(parents=True, exist_ok=True)
            encrypted = {}
            for key, value in credentials.items():
                if isinstance(value, str) and value:
                    encrypted[key] = encrypt_data(value)
                else:
                    encrypted[key] = value
            path = self.get_credentials_path()
            path.write_text(json.dumps(encrypted, indent=2), encoding="utf-8")
            logger.info("🔐 Credenciales guardadas de forma segura")
            return True
        except Exception as e:
            logger.error(f"Error guardando credenciales: {e}")
            return False

    def delete_credentials(self) -> bool:
        """Elimina credenciales guardadas."""
        try:
            path = self.get_credentials_path()
            if path.exists():
                path.unlink()
                logger.info("Credenciales eliminadas")
            return True
        except Exception as e:
            logger.error(f"Error eliminando credenciales: {e}")
            return False

    # ── Conexión a IQ Option ────────────────────────────────────────────

    def _connect_iqoption(self, email: str, password: str, account_type: str = "PRACTICE") -> Dict:
        """
        Conecta a IQ Option. Retorna dict con resultado.
        """
        from services.trading_service import trading_service

        result = {
            "success": False,
            "error": None,
            "account_info": None,
        }

        try:
            from iqoptionapi.stable_api import IQ_Option
            import concurrent.futures

            logger.info(f"🔄 Auto-Connector: Conectando a IQ Option ({email})...")

            iq = IQ_Option(email, password)

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(iq.connect)
                try:
                    conn_result = future.result(timeout=30)
                    if isinstance(conn_result, tuple):
                        status, reason = conn_result
                    else:
                        status = bool(conn_result)
                        reason = None
                except concurrent.futures.TimeoutError:
                    result["error"] = "Timeout de conexión (>30s)"
                    return result

            if not status:
                reason_str = str(reason) if reason else ""
                if "wrong" in reason_str.lower() or "invalid" in reason_str.lower():
                    result["error"] = "Credenciales incorrectas"
                elif "2fa" in reason_str.lower():
                    result["error"] = "2FA activado. Desactívalo temporalmente."
                else:
                    result["error"] = f"Error de conexión: {reason_str}"
                return result

            # Cambiar tipo de cuenta
            try:
                if account_type == "REAL":
                    iq.change_balance("REAL")
                else:
                    iq.change_balance("PRACTICE")
            except Exception:
                pass

            # Registrar en el servicio global
            trading_service.set_iq_option(iq)

            # Sincronizar datos
            try:
                from services.data import unified_data_service
                unified_data_service.sync_from_trading_service()
            except Exception:
                pass

            # Obtener info de cuenta
            balance = 0.0
            currency = "USD"
            try:
                balance = float(iq.get_balance())
                currency = iq.get_currency() or "USD"
            except Exception:
                pass

            result["success"] = True
            result["account_info"] = {
                "balance": balance,
                "currency": currency,
                "account_type": account_type,
                "email": email,
            }

            logger.info(f"✅ Auto-Connector: IQ Option conectado. Balance: ${balance:.2f}")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"❌ Auto-Connector IQ Option error: {e}")

        return result

    # ── Conexión a MT5 ─────────────────────────────────────────────────

    def _connect_mt5(self, login: int, password: str, server: str, is_demo: bool = True) -> Dict:
        """
        Conecta a MetaTrader 5. Retorna dict con resultado.
        Nota: Solo funciona en Windows con MT5 instalado.
        """
        from services.trading_service import trading_service

        result = {
            "success": False,
            "error": None,
            "account_info": None,
        }

        try:
            import MetaTrader5 as mt5

            if not mt5.initialize():
                result["error"] = "No se pudo inicializar MT5 (¿está instalado?)"
                return result

            authorized = mt5.login(login, password=password, server=server)
            if not authorized:
                error_code = mt5.last_error()
                result["error"] = f"MT5 login failed: {error_code}"
                mt5.shutdown()
                return result

            account_info = mt5.account_info()
            if account_info is None:
                result["error"] = "No se pudo obtener info de la cuenta MT5"
                mt5.shutdown()
                return result

            connection_info = {
                "login": login,
                "server": server,
                "is_demo": is_demo,
                "balance": account_info.balance,
                "equity": account_info.equity,
                "currency": account_info.currency,
            }

            trading_service.set_mt5(connection_info)

            result["success"] = True
            result["account_info"] = connection_info

            logger.info(f"✅ Auto-Connector: MT5 conectado. Balance: ${account_info.balance:.2f}")

        except ImportError:
            result["error"] = "MetaTrader5 no instalado (solo Windows)"
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"❌ Auto-Connector MT5 error: {e}")

        return result

    # ── Conexión de todas las plataformas ──────────────────────────────

    def connect_all(self, auto_start_bot: bool = False, bot_config: Optional[Dict] = None):
        """
        Lee credenciales guardadas e intenta conectar todas las plataformas.
        Se ejecuta en un hilo separado para no bloquear el arranque.

        Args:
            auto_start_bot: Si True, inicia el bot automáticamente tras conectar.
            bot_config: Configuración para el bot (symbols, estrategias, etc.)
        """
        if self._connect_thread and self._connect_thread.is_alive():
            logger.info("Auto-Connector ya está en ejecución...")
            return

        self.auto_start_bot = auto_start_bot
        if bot_config:
            self.bot_config = bot_config

        self._connect_thread = threading.Thread(
            target=self._do_connect_all,
            daemon=True,
            name="auto-connector"
        )
        self._connect_thread.start()
        logger.info("🚀 Auto-Connector iniciado en segundo plano")

    def _do_connect_all(self):
        """Ejecuta las conexiones en orden."""
        creds = self.load_credentials()
        if not creds:
            logger.info("Auto-Connector: No hay credenciales guardadas. Omite auto-conexión.")
            self.has_auto_connected = True
            return

        # 1. IQ Option
        iq_email = creds.get("iqoption_email", "")
        iq_password = creds.get("iqoption_password", "")
        iq_account_type = creds.get("iqoption_account_type", "PRACTICE")

        if iq_email and iq_password:
            with self._lock:
                self.status["iqoption"]["last_attempt"] = datetime.now().isoformat()
                self.status["iqoption"]["email"] = iq_email

            iq_result = self._connect_iqoption(iq_email, iq_password, iq_account_type)

            with self._lock:
                if iq_result["success"]:
                    self.status["iqoption"]["connected"] = True
                    self.status["iqoption"]["account_type"] = iq_account_type
                    self.status["iqoption"]["balance"] = iq_result["account_info"]["balance"]
                    self.status["iqoption"]["error"] = None
                else:
                    self.status["iqoption"]["connected"] = False
                    self.status["iqoption"]["error"] = iq_result["error"]

        # 2. MT5
        mt5_login = creds.get("mt5_login", "")
        mt5_password = creds.get("mt5_password", "")
        mt5_server = creds.get("mt5_server", "")
        mt5_is_demo = creds.get("mt5_is_demo", True)

        if mt5_login and mt5_password and mt5_server:
            with self._lock:
                self.status["mt5"]["last_attempt"] = datetime.now().isoformat()

            try:
                mt5_login_int = int(mt5_login)
            except (ValueError, TypeError):
                mt5_login_int = 0

            if mt5_login_int:
                mt5_result = self._connect_mt5(mt5_login_int, mt5_password, mt5_server, mt5_is_demo)
                with self._lock:
                    if mt5_result["success"]:
                        self.status["mt5"]["connected"] = True
                        self.status["mt5"]["account_type"] = "DEMO" if mt5_is_demo else "REAL"
                        self.status["mt5"]["balance"] = mt5_result["account_info"].get("balance", 0)
                        self.status["mt5"]["error"] = None
                        self.status["mt5"]["login"] = str(mt5_login)
                    else:
                        self.status["mt5"]["connected"] = False
                        self.status["mt5"]["error"] = mt5_result["error"]

        self.has_auto_connected = True
        logger.info("✅ Auto-Connector completado")

        # 3. Iniciar bot automáticamente si está configurado
        if self.auto_start_bot and self.status.get("iqoption", {}).get("connected"):
            self._start_bot_automatically()

    def _start_bot_automatically(self):
        """Inicia el bot de trading automático."""
        try:
            from services.trading.live_trading_service import live_trading_service

            config = self.bot_config or {
                "mode": "auto",
                "symbols": ["EURUSD", "GBPUSD", "USDJPY"],
                "strategies": ["ema_rsi"],
                "min_confidence": 68,
                "amount": 10,
                "max_concurrent": 2,
                "max_daily_trades": 50,
                "expiration": 5,
                "use_ml": True,
                "ml_weight": 0.20,
                "ml_min_probability": 0.55,
            }

            account_type = self.status.get("iqoption", {}).get("account_type", "PRACTICE")

            result = live_trading_service.start_bot(
                platform="iqoption",
                account_type=account_type,
                config=config,
            )

            if result.get("status") == "success":
                logger.info("🤖 Bot automático iniciado exitosamente")
            else:
                logger.warning(f"⚠️ No se pudo iniciar bot automático: {result.get('message')}")

        except Exception as e:
            logger.error(f"Error iniciando bot automático: {e}")

    # ── Estado público ──────────────────────────────────────────────────

    def get_status(self) -> Dict:
        """Devuelve el estado de todas las plataformas."""
        with self._lock:
            return {
                "has_auto_connected": self.has_auto_connected,
                "auto_start_bot": self.auto_start_bot,
                "platforms": dict(self.status),
                "has_credentials": self.get_credentials_path().exists(),
            }

    def get_platform_status(self, platform: str) -> Dict:
        """Devuelve estado de una plataforma específica."""
        with self._lock:
            return self.status.get(platform, {})


# Instancia global
auto_connector = AutoConnector()
