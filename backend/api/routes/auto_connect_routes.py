"""
Auto-Connect & Multi-Platform Routes
=====================================
Endpoints para gestionar la auto-conexión al iniciar el servidor
y el estado multi-plataforma.

Endpoints:
    POST /api/auto-connect/save-credentials   - Guardar credenciales
    POST /api/auto-connect/connect-now        - Forzar conexión ahora
    POST /api/auto-connect/disconnect         - Desconectar y limpiar
    GET  /api/auto-connect/status             - Estado de auto-conexión
    POST /api/auto-connect/configure          - Configurar auto-inicio

    GET  /api/platforms/status                - Estado multi-plataforma
    POST /api/platforms/start                 - Iniciar plataforma específica
    POST /api/platforms/stop                  - Detener plataforma específica
    POST /api/platforms/stop-all              - Detener todas
    POST /api/platforms/config                - Actualizar config de plataforma
"""

import logging
from flask import Blueprint, request, jsonify

from services.trading.auto_connector import auto_connector
from services.trading.platform_manager import platform_manager, PlatformConfig

logger = logging.getLogger(__name__)

auto_connect_bp = Blueprint('auto_connect', __name__)
platforms_bp = Blueprint('platforms', __name__)


# ════════════════════════════════════════════════════════════════════════
# AUTO-CONNECT ROUTES
# ════════════════════════════════════════════════════════════════════════

@auto_connect_bp.route('/save-credentials', methods=['POST'])
def save_credentials():
    """
    Guarda credenciales de forma segura para auto-conexión futura.

    Body:
        {
            "iqoption": {
                "email": "user@email.com",
                "password": "secret",
                "account_type": "PRACTICE"
            },
            "mt5": {
                "login": "12345678",
                "password": "secret",
                "server": "MT5-Demo01",
                "is_demo": true
            },
            "auto_start_bot": false,
            "bot_config": { ... }
        }
    """
    try:
        data = request.get_json() or {}

        credentials = {}

        # IQ Option
        iq = data.get("iqoption", {})
        if iq.get("email") and iq.get("password"):
            credentials["iqoption_email"] = iq["email"]
            credentials["iqoption_password"] = iq["password"]
            credentials["iqoption_account_type"] = iq.get("account_type", "PRACTICE")

        # MT5
        mt5 = data.get("mt5", {})
        if mt5.get("login") and mt5.get("password") and mt5.get("server"):
            credentials["mt5_login"] = str(mt5["login"])
            credentials["mt5_password"] = mt5["password"]
            credentials["mt5_server"] = mt5["server"]
            credentials["mt5_is_demo"] = mt5.get("is_demo", True)

        if not credentials:
            return jsonify({
                "status": "error",
                "message": "No se recibieron credenciales válidas. "
                           "Proporciona al menos email/password para IQ Option "
                           "o login/password/server para MT5."
            }), 400

        saved = auto_connector.save_credentials(credentials)
        if not saved:
            return jsonify({
                "status": "error",
                "message": "Error al guardar credenciales"
            }), 500

        # Configurar auto-inicio
        auto_connector.auto_start_bot = data.get("auto_start_bot", False)
        auto_connector.bot_config = data.get("bot_config", {})

        return jsonify({
            "status": "success",
            "message": "Credenciales guardadas correctamente. "
                       "Se conectarán automáticamente al reiniciar el servidor.",
            "platforms_saved": list(credentials.keys()),
            "auto_start_bot": auto_connector.auto_start_bot,
        })

    except Exception as e:
        logger.error(f"Error saving credentials: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@auto_connect_bp.route('/connect-now', methods=['POST'])
def connect_now():
    """
    Fuerza la conexión a las plataformas configuradas AHORA MISMO
    (sin esperar reinicio del servidor).

    Body (opcional):
        {
            "auto_start_bot": true,
            "bot_config": { ... }
        }
    """
    try:
        data = request.get_json() or {}

        if not auto_connector.get_credentials_path().exists():
            return jsonify({
                "status": "error",
                "message": "No hay credenciales guardadas. "
                           "Usa /api/auto-connect/save-credentials primero."
            }), 400

        auto_start = data.get("auto_start_bot", auto_connector.auto_start_bot)
        bot_config = data.get("bot_config", auto_connector.bot_config)

        auto_connector.connect_all(
            auto_start_bot=auto_start,
            bot_config=bot_config,
        )

        return jsonify({
            "status": "success",
            "message": "🔄 Conexión iniciada en segundo plano. "
                       "Usa /api/auto-connect/status para ver el progreso.",
            "auto_start_bot": auto_start,
        })

    except Exception as e:
        logger.error(f"Error connect-now: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@auto_connect_bp.route('/disconnect', methods=['POST'])
def disconnect_all():
    """Desconecta todas las plataformas y limpia credenciales."""
    try:
        # Detener bots
        platform_manager.stop_all()

        # Detener el bot principal si está corriendo
        try:
            from services.trading.live_trading_service import live_trading_service
            live_trading_service.stop_bot()
        except Exception:
            pass

        # Desconectar sesiones
        try:
            from services.trading_service import trading_service
            trading_service.disconnect_all()
        except Exception:
            pass

        # Preguntar si también borrar credenciales
        data = request.get_json() or {}
        if data.get("delete_credentials", False):
            auto_connector.delete_credentials()

        auto_connector.has_auto_connected = False

        return jsonify({
            "status": "success",
            "message": "Todas las plataformas desconectadas",
            "credentials_deleted": data.get("delete_credentials", False),
        })

    except Exception as e:
        logger.error(f"Error disconnecting: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@auto_connect_bp.route('/status', methods=['GET'])
def get_auto_connect_status():
    """Devuelve el estado actual de auto-conexión."""
    try:
        status = auto_connector.get_status()

        # Agregar info de conexión actual
        try:
            from services.trading_service import trading_service
            iq = trading_service.get_iq_option()
            iq_connected = iq is not None
            if iq_connected:
                try:
                    iq_connected = bool(iq.check_connect())
                except Exception:
                    pass
            status["current_iq_connected"] = iq_connected
        except Exception:
            status["current_iq_connected"] = False

        return jsonify({
            "status": "success",
            "auto_connect": status,
        })

    except Exception as e:
        logger.error(f"Error auto-connect status: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@auto_connect_bp.route('/configure', methods=['POST'])
def configure_auto_connect():
    """
    Configura el comportamiento de auto-conexión.

    Body:
        {
            "auto_start_bot": true,
            "bot_config": {
                "mode": "auto",
                "symbols": ["EURUSD", "GBPUSD"],
                "strategies": ["ema_rsi"],
                "min_confidence": 68,
                "amount": 10,
                "max_concurrent": 2
            }
        }
    """
    try:
        data = request.get_json() or {}

        auto_connector.auto_start_bot = data.get("auto_start_bot", False)
        auto_connector.bot_config = data.get("bot_config", {})

        # También guardar en un archivo de configuración
        config_path = auto_connector.get_credentials_path().parent / "auto_start_config.json"
        try:
            import json
            config_path.write_text(json.dumps({
                "auto_start_bot": auto_connector.auto_start_bot,
                "bot_config": auto_connector.bot_config,
            }, indent=2), encoding="utf-8")
        except Exception:
            pass

        return jsonify({
            "status": "success",
            "message": "Configuración de auto-inicio guardada",
            "auto_start_bot": auto_connector.auto_start_bot,
            "bot_config": auto_connector.bot_config,
        })

    except Exception as e:
        logger.error(f"Error configure: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════
# MULTI-PLATFORM ROUTES
# ════════════════════════════════════════════════════════════════════════

@platforms_bp.route('/status', methods=['GET'])
def get_platforms_status():
    """Estado de todas las plataformas de trading."""
    try:
        status = platform_manager.get_status()

        # Agregar estado del auto-connector
        status["auto_connector"] = auto_connector.get_status()

        # Agregar estado del bot principal
        try:
            from services.trading.live_trading_service import live_trading_service
            bot_status = live_trading_service.get_status()
            status["main_bot"] = bot_status
        except Exception:
            status["main_bot"] = {"is_running": False}

        return jsonify({
            "status": "success",
            "platforms": status,
        })

    except Exception as e:
        logger.error(f"Error platforms status: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@platforms_bp.route('/start', methods=['POST'])
def start_platform():
    """
    Inicia el bot de trading para una plataforma específica.

    Body:
        {
            "platform": "iqoption",  # obligatorio
            "account_type": "PRACTICE",
            "mode": "auto",
            "symbols": ["EURUSD", "GBPUSD"],
            "strategies": ["ema_rsi"],
            "amount": 10,
            "min_confidence": 68,
            "expiration": 5,
            "max_concurrent": 3,
            "max_daily_trades": 50,
            "use_ml": true,
            "ml_weight": 0.20
        }
    """
    try:
        data = request.get_json() or {}
        platform = data.get("platform", "").lower().strip()

        if platform not in ("iqoption", "mt5", "quotex"):
            return jsonify({
                "status": "error",
                "message": "Plataforma no válida. Usa: iqoption, mt5, quotex"
            }), 400

        # Construir config
        config = PlatformConfig(
            platform=platform,
            account_type=data.get("account_type", "PRACTICE"),
            mode=data.get("mode", "manual"),
            symbols=data.get("symbols", ["EURUSD", "GBPUSD", "USDJPY"]),
            strategies=data.get("strategies", ["ema_rsi"]),
            amount=float(data.get("amount", 10)),
            min_confidence=float(data.get("min_confidence", 68)),
            expiration=int(data.get("expiration", 5)),
            max_concurrent=int(data.get("max_concurrent", 3)),
            max_daily_trades=int(data.get("max_daily_trades", 50)),
            use_ml=bool(data.get("use_ml", True)),
            ml_weight=float(data.get("ml_weight", 0.20)),
            ml_min_probability=float(data.get("ml_min_probability", 0.55)),
        )

        result = platform_manager.start_platform(config)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error start platform: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@platforms_bp.route('/stop', methods=['POST'])
def stop_platform():
    """Detiene el bot de una plataforma específica."""
    try:
        data = request.get_json() or {}
        platform = data.get("platform", "").lower().strip()

        if platform not in ("iqoption", "mt5", "quotex"):
            return jsonify({
                "status": "error",
                "message": "Plataforma no válida"
            }), 400

        result = platform_manager.stop_platform(platform)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error stop platform: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@platforms_bp.route('/stop-all', methods=['POST'])
def stop_all_platforms():
    """Detiene todos los bots de todas las plataformas."""
    try:
        platform_manager.stop_all()

        # También detener el bot principal
        try:
            from services.trading.live_trading_service import live_trading_service
            live_trading_service.stop_bot()
        except Exception:
            pass

        return jsonify({
            "status": "success",
            "message": "Todos los bots detenidos",
        })

    except Exception as e:
        logger.error(f"Error stop all: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@platforms_bp.route('/config', methods=['POST'])
def update_platform_config():
    """Actualiza la configuración de una plataforma en caliente."""
    try:
        data = request.get_json() or {}
        platform = data.get("platform", "").lower().strip()

        if platform not in ("iqoption", "mt5", "quotex"):
            return jsonify({
                "status": "error",
                "message": "Plataforma no válida"
            }), 400

        # Campos actualizables
        updates = {}
        for key in ["mode", "symbols", "strategies", "amount",
                     "min_confidence", "expiration", "max_concurrent",
                     "max_daily_trades", "use_ml", "ml_weight",
                     "ml_min_probability"]:
            if key in data:
                updates[key] = data[key]

        if not updates:
            return jsonify({
                "status": "error",
                "message": "No hay campos válidos para actualizar"
            }), 400

        result = platform_manager.update_config(platform, updates)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error update config: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@platforms_bp.route('/balances', methods=['GET'])
def get_all_balances():
    """Devuelve los balances de todas las plataformas conectadas."""
    try:
        from services.trading_service import trading_service

        balances = {}

        # IQ Option
        try:
            iq = trading_service.get_iq_option()
            if iq:
                try:
                    balance = float(iq.get_balance())
                    currency = iq.get_currency() or "USD"
                    balances["iqoption"] = {
                        "balance": balance,
                        "currency": currency,
                        "connected": True,
                    }
                except Exception:
                    balances["iqoption"] = {"connected": False}
            else:
                balances["iqoption"] = {"connected": False}
        except Exception:
            balances["iqoption"] = {"connected": False}

        # MT5
        try:
            mt5 = trading_service.get_mt5()
            if mt5 and isinstance(mt5, dict):
                balances["mt5"] = {
                    "balance": mt5.get("balance", 0),
                    "currency": mt5.get("currency", "USD"),
                    "connected": True,
                }
            else:
                balances["mt5"] = {"connected": False}
        except Exception:
            balances["mt5"] = {"connected": False}

        return jsonify({
            "status": "success",
            "balances": balances,
        })

    except Exception as e:
        logger.error(f"Error balances: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
