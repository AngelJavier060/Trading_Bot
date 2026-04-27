from flask import Flask, jsonify
from flask_cors import CORS
import logging
import os
from api.routes.trading_routes import trading_bp
from api.routes.quotex_routes import quotex_bp
from api.routes.mt5_routes import mt5_bp
from api.routes.config_routes import config_bp
from api.routes.backtesting_routes import backtesting_bp
from api.routes.ml_routes import ml_bp
from api.routes.data_routes import data_bp
from api.routes.live_trading_routes import live_trading_bp
from api.routes.strategy_routes import strategy_bp, config_bp as robot_config_bp
from api.routes.assistant_routes import assistant_bp
from api.routes.tv_datafeed_routes import tv_bp
from config.settings import SECRET_KEY

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = SECRET_KEY
    
    # Habilitar CORS
    # - Dev: localhost/127.0.0.1 en cualquier puerto (si no hay orígenes explícitos)
    # - Prod: CORS_ORIGINS=https://tu-dominio.com,https://otro.com
    #   y/o FRONTEND_URL=https://tu-dominio.com (una sola URL del panel web)
    import re
    cors_env = (os.environ.get("CORS_ORIGINS") or "").strip()
    allowed_origins: list[str] = []
    for raw in cors_env.replace("\n", ",").split(","):
        o = raw.strip().rstrip("/")
        if o:
            allowed_origins.append(o)
    frontend_url = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/")
    if frontend_url and frontend_url not in allowed_origins:
        allowed_origins.append(frontend_url)

    # Sin duplicados, orden estable
    allowed_origins = list(dict.fromkeys(allowed_origins))
    normalized_allowed = frozenset(o.rstrip("/") for o in allowed_origins)

    localhost_regex = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")

    # Lista de patrones/strings que entiende flask-cors (incl. regex compilado)
    if allowed_origins:
        origins: list = allowed_origins + [localhost_regex]
    else:
        origins = [localhost_regex]

    def cors_allow_origin(origin: str | None) -> str | None:
        """Misma lógica que `origins`, para handlers manuales (OPTIONS / errores)."""
        if not origin:
            return None
        base = origin.rstrip("/")
        if base in normalized_allowed:
            return origin
        if localhost_regex.match(origin):
            return origin
        return None

    # Una sola regla: el front en producción está en otro dominio que la API (login en /login, API en /api/*).
    _cors_resource_cfg = {
        "origins": origins,
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
    }
    CORS(
        app,
        resources={
            r"/*": _cors_resource_cfg,
        },
    )

    # Asegurar que los preflight OPTIONS jamás caigan en el manejador global
    # de excepciones (que devolvería 500 sin headers CORS).
    @app.before_request
    def _short_circuit_options():
        from flask import request, make_response
        if request.method == 'OPTIONS':
            resp = make_response('', 204)
            origin = request.headers.get('Origin', '')
            allowed = cors_allow_origin(origin)
            if allowed:
                resp.headers['Access-Control-Allow-Origin'] = allowed
                resp.headers['Vary'] = 'Origin'
                resp.headers['Access-Control-Allow-Credentials'] = 'true'
                resp.headers['Access-Control-Allow-Methods'] = (
                    request.headers.get('Access-Control-Request-Method')
                    or 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
                )
                resp.headers['Access-Control-Allow-Headers'] = (
                    request.headers.get('Access-Control-Request-Headers')
                    or 'Content-Type, Authorization'
                )
                resp.headers['Access-Control-Max-Age'] = '600'
            return resp
        return None
    
    # Inicializar base de datos
    try:
        from database.service import trading_db
        logging.info("Base de datos inicializada correctamente")
    except Exception as e:
        logging.warning(f"No se pudo inicializar la base de datos: {e}")
    
    @app.route('/')
    def home():
        return jsonify({
            "status": "online",
            "message": "API de Trading funcionando",
            "version": "2.0.0",
            "endpoints": {
                "test": "/test",
                "trading": "/api/trading/*",
                "strategies": "/api/strategies/*",
                "robot_config": "/api/robot/*",
                "ml": "/api/ml/*",
                "data": "/api/data/*",
                "backtesting": "/api/backtesting/*"
            }
        })
    
    @app.route('/test')
    def test():
        return jsonify({"message": "API funcionando correctamente"})
    
    # Registrar blueprints
    app.register_blueprint(trading_bp, url_prefix='/api/trading')
    app.register_blueprint(quotex_bp, url_prefix='/api/quotex')
    app.register_blueprint(mt5_bp, url_prefix='/api/mt5')
    app.register_blueprint(config_bp, url_prefix='/api/config')
    app.register_blueprint(backtesting_bp, url_prefix='/api/backtesting')
    app.register_blueprint(ml_bp, url_prefix='/api/ml')
    app.register_blueprint(live_trading_bp, url_prefix='/api/live')
    app.register_blueprint(strategy_bp, url_prefix='/api/strategies')
    app.register_blueprint(robot_config_bp, url_prefix='/api/robot')
    app.register_blueprint(data_bp, url_prefix='/api/data')
    app.register_blueprint(assistant_bp, url_prefix='/api/assistant')
    # TradingView Advanced Charts UDF datafeed
    app.register_blueprint(tv_bp, url_prefix='/api/tv')
    
    # Manejador de errores global
    @app.errorhandler(Exception)
    def handle_exception(e):
        from flask import request
        logging.error(f"Unhandled Exception: {str(e)}", exc_info=True)
        resp = jsonify({
            "status": "error",
            "message": "Ocurrió un error inesperado en el servidor",
            "details": str(e),
        })
        # Añadir headers CORS al error para que el navegador NO lo bloquee
        # como un fallo de preflight cuando en realidad es un 500 del endpoint.
        origin = request.headers.get('Origin', '')
        allowed_o = cors_allow_origin(origin)
        if allowed_o:
            resp.headers['Access-Control-Allow-Origin'] = allowed_o
            resp.headers['Vary'] = 'Origin'
            resp.headers['Access-Control-Allow-Credentials'] = 'true'
        return resp, 500

    @app.errorhandler(404)
    def resource_not_found(e):
        return jsonify({
            "status": "error",
            "message": "Recurso no encontrado"
        }), 404

    return app
