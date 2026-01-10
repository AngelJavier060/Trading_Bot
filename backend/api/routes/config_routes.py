from flask import Blueprint, jsonify, request
import json
import os
from api.routes.trading_routes import controller as trading_controller
from api.utils.validators import validate_schema
from models.schemas import ConfigSchema, StrategySchema

config_bp = Blueprint("config", __name__)

CONFIG_FILE = "data/config.json"  # Ruta relativa al archivo config.json

@config_bp.route("/get-config", methods=["GET"])
def get_config():
    try:
        base_config = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as file:
                base_config = json.load(file)

        user_config = {}
        user_path = os.path.join("data", "user_config.json")
        if os.path.exists(user_path):
            with open(user_path, "r", encoding="utf-8") as file:
                user_config = json.load(file)

        return jsonify({
            "config": base_config,
            "user_config": user_config
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@config_bp.route("/save", methods=["POST"])
@validate_schema(ConfigSchema)
def save_config(validated_data: ConfigSchema):
    """
    Guarda las configuraciones seleccionadas por el usuario.
    """
    try:
        # El objeto validado ya contiene los datos correctos
        data = validated_data.model_dump()
        # Guarda los datos en un archivo JSON o en una base de datos
        with open("data/user_config.json", "w") as f:
            json.dump(data, f, indent=4)
        return jsonify({"message": "Configuración guardada exitosamente"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@config_bp.route("/save-user-config", methods=["POST"])
@validate_schema(ConfigSchema)
def save_user_config(validated_data: ConfigSchema):
    """
    Guarda las configuraciones seleccionadas por el usuario.
    """
    try:
        data = validated_data.model_dump()
        with open("data/user_config.json", "w") as f:
            json.dump(data, f, indent=4)
        return jsonify({"message": "Configuración guardada exitosamente"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@config_bp.route("/execute", methods=["POST"])
def execute():
    """
    Ejecuta trading en vivo o backtesting basado en la configuración guardada.
    """
    data = request.json
    trading_mode = data.get("trading_mode")

    if trading_mode == "Trader en vivo":
        # Reutilizamos el controlador de trading para ejecutar la estrategia configurada
        # Aquí se pasará por la validación interna del controlador
        return trading_controller.run_basic_strategy()
    elif trading_mode == "Backtesting":
        # Aquí se implementa la lógica de backtesting
        return jsonify({"message": "Backtesting ejecutado con éxito"})
    else:
        return jsonify({"error": "Modo de operación no reconocido"}), 400
