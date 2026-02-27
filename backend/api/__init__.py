from flask import Flask, jsonify
from flask_cors import CORS
import logging
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
from config.settings import SECRET_KEY

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = SECRET_KEY
    
    # Habilitar CORS con configuración completa
    CORS(app, resources={
        r"/api/*": {
            "origins": ["http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:62824"],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })
    
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
    
    # Manejador de errores global
    @app.errorhandler(Exception)
    def handle_exception(e):
        # Log del error completo
        logging.error(f"Unhandled Exception: {str(e)}", exc_info=True)
        
        # Devolver JSON consistente
        return jsonify({
            "status": "error",
            "message": "Ocurrió un error inesperado en el servidor",
            "details": str(e)
        }), 500

    @app.errorhandler(404)
    def resource_not_found(e):
        return jsonify({
            "status": "error",
            "message": "Recurso no encontrado"
        }), 404

    return app
