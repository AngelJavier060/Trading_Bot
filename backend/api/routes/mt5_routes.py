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

@mt5_bp.route('/symbols', methods=['GET'])
def get_symbols():
    return controller.get_symbols()

@mt5_bp.route('/historical-data', methods=['GET'])
def get_historical_data():
    symbol = request.args.get('symbol', 'EURUSD')
    timeframe = request.args.get('timeframe', '1h')
    n_candles = int(request.args.get('n_candles', 1000))
    return controller.get_historical_data(symbol, timeframe, n_candles) 