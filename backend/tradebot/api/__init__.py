"""API HTTP del backend (la consume el frontend Next.js, el EA TradeBotRemote y los scripts).

Autenticación (todo /api salvo las rutas públicas):
  - Usuarios: cabecera "Authorization: Bearer <token>" obtenido en POST /api/auth/login.
  - Servicios (EA remoto, vigilante): cabecera "X-API-Token: <API_TOKEN>".
  - Tiempo real (EventSource no admite cabeceras): /api/stream?token=<token>.
CORS: solo los orígenes de FRONTEND_ORIGINS (por defecto http://localhost:3000).
"""

from __future__ import annotations

import hmac
import logging

from flask import Flask, Response, g, jsonify, request

from ..app import System
from ..auth import AuthError
from ..broker.models import MT5Error
from .routes import register_routes

logger = logging.getLogger(__name__)

PUBLIC_PATHS = {"/api/health", "/api/auth/login", "/api/auth/setup", "/api/auth/status"}


def create_app(system: System) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.json.ensure_ascii = False
    app.config["SYSTEM"] = system
    origins = set(system.settings.frontend_origins)

    def _cors(resp: Response) -> Response:
        origin = request.headers.get("Origin", "").rstrip("/")
        if origin and origin in origins:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-API-Token"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            resp.headers["Access-Control-Max-Age"] = "600"
        return resp

    @app.before_request
    def _auth():
        if request.method == "OPTIONS":
            return _cors(Response(status=204))
        g.user = None
        if request.path in PUBLIC_PATHS or not request.path.startswith("/api/"):
            return None
        service = system.settings.api_token
        given_service = request.headers.get("X-API-Token", "")
        if service and given_service and hmac.compare_digest(given_service, service):
            g.user = {"id": 0, "username": "servicio", "role": "service"}
            return None
        bearer = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        token = bearer or request.args.get("token", "")
        user = system.auth.verify(token) if token else None
        if user is None:
            return jsonify(error="Sesión no válida o caducada: inicia sesión", code="auth_required"), 401
        g.user = user
        # Los usuarios de solo lectura no pueden cambiar nada (salvo su propia contraseña)
        if user.get("role") == "viewer" and request.method != "GET" and request.path != "/api/auth/password":
            return jsonify(error="Tu usuario es de solo lectura"), 403
        return None

    app.after_request(_cors)

    @app.errorhandler(AuthError)
    def _auth_error(exc):
        return jsonify(error=str(exc)), 400

    @app.errorhandler(MT5Error)
    def _mt5_error(exc):
        return jsonify(error=str(exc), code=exc.code), 503

    @app.errorhandler(ValueError)
    def _value_error(exc):
        return jsonify(error=str(exc)), 400

    @app.errorhandler(RuntimeError)
    def _runtime_error(exc):
        return jsonify(error=str(exc)), 409

    @app.errorhandler(TypeError)
    def _type_error(exc):  # p. ej. parámetro desconocido en la configuración enviada
        return jsonify(error=str(exc)), 400

    @app.errorhandler(404)
    def _not_found(exc):
        return jsonify(error=f"No existe {request.path}"), 404

    register_routes(app)
    return app
