from flask import Blueprint, request, jsonify
from api.controllers.trading_controller import TradingController

trading_bp = Blueprint('trading', __name__)
controller = TradingController()

@trading_bp.route('/connect', methods=['POST'])
def connect():
    return controller.connect()

@trading_bp.route('/switch-account', methods=['POST'])
def switch_account():
    return controller.switch_account()

@trading_bp.route('/account-info', methods=['GET'])
def get_account_info():
    return controller.get_account_info()

@trading_bp.route('/check-connection', methods=['GET'])
def check_connection():
    return controller.check_connection()

@trading_bp.route('/disconnect', methods=['POST'])
def disconnect():
    return controller.disconnect()

@trading_bp.route('/save-config', methods=['POST'])
def save_config():
    return controller.save_config()

# Ruta de prueba para el blueprint
@trading_bp.route('/test', methods=['GET'])
def test():
    return {"message": "Trading routes funcionando"}

