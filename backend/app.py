import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
from services.iq_option import IQOptionService
from config.logging_config import configure_logging
from api.routes.config_routes import config_bp

# Configuración del logging
configure_logging()
logger = logging.getLogger(__name__)  # Asegúrate de que esto esté definido globalmente

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})

# Instancia global del servicio de IQ Option
iq_service = None

@app.route("/")
def home():
    logger.info("Acceso al endpoint principal")
    return jsonify({"message": "Bienvenido a la API de IQ Option"})

@app.route("/login", methods=["POST"])
def login():
    global iq_service
    try:
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")
        account_type = data.get("accountType", "Demo")  # Demo por defecto
        if not username or not password:
            logger.error("Faltan credenciales en el payload")
            return jsonify({"error": "Faltan credenciales"}), 400

        # Crear instancia de IQOptionService con el tipo de cuenta
        iq_service = IQOptionService(username, password, account_type)
        connected, reason = iq_service.connect()
        if connected:
            logger.info(f"Inicio de sesión exitoso en la cuenta {account_type}")
            return jsonify({"message": "Inicio de sesión exitoso"})
        else:
            logger.error(f"Error al iniciar sesión: {reason}")
            return jsonify({"error": reason}), 401
    except Exception as e:
        logger.error(f"Error en /login: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

@app.route("/account-info", methods=["GET"])
def account_info():
    if iq_service is None:
        logger.error("No se pudo conectar a IQ Option")
        return jsonify({"error": "No se pudo conectar a IQ Option"}), 500

    try:
        balance = iq_service.get_balance()
        account_type = iq_service.get_balance_mode()
        logger.info("Información de cuenta obtenida correctamente")
        return jsonify({"account_type": account_type, "balance": balance})
    except Exception as e:
        logger.error(f"Error al obtener información de cuenta: {e}")
        return jsonify({"error": str(e)}), 500

# Registrar rutas de configuración
app.register_blueprint(config_bp, url_prefix="/api/config")

if __name__ == "__main__":
    app.run(debug=True)
