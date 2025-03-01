from flask import Blueprint, jsonify, request
import json
import os

config_bp = Blueprint("config", __name__)

CONFIG_FILE = "data/config.json"  # Ruta relativa al archivo config.json

@config_bp.route("/save", methods=["POST"])
def save_config():
    """
    Guarda las configuraciones seleccionadas por el usuario.
    """
    data = request.json
    try:
        # Guarda los datos en un archivo JSON o en una base de datos
        with open("data/user_config.json", "w") as f:
            json.dump(data, f, indent=4)
        return jsonify({"message": "Configuración guardada exitosamente"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


    with open(CONFIG_FILE, "r") as file:
        config = json.load(file)
    return jsonify(config)

@config_bp.route("/save-user-config", methods=["POST"])
def save_user_config():
    """
    Guarda las configuraciones seleccionadas por el usuario.
    """
    data = request.json
    try:
        # Guarda los datos en un archivo JSON o en una base de datos
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
        # Aquí se implementa la lógica de trading en vivo
        return jsonify({"message": "Trader en vivo ejecutado con éxito"})
    elif trading_mode == "Backtesting":
        # Aquí se implementa la lógica de backtesting
        return jsonify({"message": "Backtesting ejecutado con éxito"})
    else:
        return jsonify({"error": "Modo de operación no reconocido"}), 400
