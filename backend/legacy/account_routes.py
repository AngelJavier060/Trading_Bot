from flask import Blueprint, jsonify
import requests
import logging

account_bp = Blueprint('account', __name__)

BASE_URL = "https://api.ipoptions.com/v1"
TOKEN = "tu_token_de_api"

@account_bp.route('/balance', methods=['GET'])
def get_balance():
    try:
        headers = {
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(f"{BASE_URL}/account/balance", headers=headers)
        
        if response.status_code == 200:
            logging.info("Datos de balance obtenidos correctamente")
            return jsonify(response.json()), 200
        else:
            logging.error(f"Error al obtener el balance: {response.status_code} - {response.text}")
            return jsonify({"error": response.text}), response.status_code
    except Exception as e:
        logging.error(f"Error en el endpoint /account/balance: {str(e)}")
        return jsonify({"error": str(e)}), 500
