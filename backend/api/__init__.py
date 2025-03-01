from flask import Flask, jsonify
from api.routes.trading_routes import trading_bp
from api.routes.quotex_routes import quotex_bp
from api.routes.mt5_routes import mt5_bp

def create_app():
    app = Flask(__name__)
    
    @app.route('/')
    def home():
        return jsonify({
            "status": "online",
            "message": "API de Trading funcionando",
            "endpoints": {
                "test": "/test",
                "trading": "/api/trading/*"
            }
        })
    
    @app.route('/test')
    def test():
        return jsonify({"message": "API funcionando correctamente"})
    
    # Registrar blueprints
    app.register_blueprint(trading_bp, url_prefix='/api/trading')
    app.register_blueprint(quotex_bp, url_prefix='/api/quotex')
    app.register_blueprint(mt5_bp, url_prefix='/api/mt5')
    
    return app
