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

@trading_bp.route('/assets', methods=['GET'])
def get_assets():
    return controller.get_assets()

@trading_bp.route('/risk-state', methods=['GET'])
def risk_state():
    return controller.get_risk_state_api()

@trading_bp.route('/trades', methods=['GET'])
def trades():
    return controller.get_trades()

@trading_bp.route('/scan', methods=['GET'])
def scan_assets():
    return controller.scan_assets()

@trading_bp.route('/order', methods=['POST'])
def place_order():
    return controller.place_order()

@trading_bp.route('/close-order', methods=['POST'])
def close_order():
    return controller.close_order()

@trading_bp.route('/basic-strategy', methods=['POST'])
def basic_strategy():
    return controller.run_basic_strategy()

@trading_bp.route('/status', methods=['GET'])
def trading_status():
    return controller.get_trading_status()

@trading_bp.route('/history', methods=['GET'])
def platform_history():
    return controller.get_platform_history()

@trading_bp.route('/order/<order_id>', methods=['GET'])
def order_status(order_id):
    return controller.get_order_status(order_id)

@trading_bp.route('/sync', methods=['POST'])
def sync_platform():
    return controller.sync_with_platform()

@trading_bp.route('/account', methods=['GET'])
def get_account():
    return controller.get_account_info()

@trading_bp.route('/economic-calendar', methods=['GET'])
def economic_calendar():
    return controller.get_economic_calendar()

@trading_bp.route('/config', methods=['POST'])
def save_trading_config():
    return controller.save_config()

# Ruta de prueba para el blueprint
@trading_bp.route('/test', methods=['GET'])
def test():
    return {"message": "Trading routes funcionando"}

