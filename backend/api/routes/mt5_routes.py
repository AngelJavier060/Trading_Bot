from flask import Blueprint, request
from api.controllers.mt5_controller import MT5Controller

mt5_bp = Blueprint('mt5', __name__)
controller = MT5Controller()

@mt5_bp.route('/connect', methods=['POST'])
def connect():
    return controller.connect()

@mt5_bp.route('/disconnect', methods=['POST'])
def disconnect():
    return controller.disconnect()

@mt5_bp.route('/status', methods=['GET'])
def get_status():
    return controller.get_status()

@mt5_bp.route('/account-info', methods=['GET'])
def get_account_info():
    return controller.get_account_info()

@mt5_bp.route('/open-trades', methods=['GET'])
def get_open_trades():
    return controller.get_open_trades()

@mt5_bp.route('/symbols', methods=['GET'])
def get_symbols():
    return controller.get_symbols()

@mt5_bp.route('/historical-data', methods=['GET'])
def get_historical_data():
    return controller.get_historical_data()