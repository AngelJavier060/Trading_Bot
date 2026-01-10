"""
Strategy Routes - Trading Bot
Rutas API para gestión de estrategias e indicadores.
"""

from flask import Blueprint
from api.controllers.strategy_controller import strategy_controller, config_controller

strategy_bp = Blueprint('strategies', __name__)
config_bp = Blueprint('robot_config', __name__)

# ===== STRATEGY ROUTES =====

@strategy_bp.route('/', methods=['GET'])
def get_strategies():
    return strategy_controller.get_all_strategies()

@strategy_bp.route('/<string:strategy_name>', methods=['GET'])
def get_strategy(strategy_name):
    return strategy_controller.get_strategy(strategy_name)

@strategy_bp.route('/', methods=['POST'])
def create_strategy():
    return strategy_controller.create_strategy()

@strategy_bp.route('/<int:strategy_id>', methods=['PUT'])
def update_strategy(strategy_id):
    return strategy_controller.update_strategy(strategy_id)

@strategy_bp.route('/<int:strategy_id>/toggle', methods=['POST'])
def toggle_strategy(strategy_id):
    return strategy_controller.toggle_strategy(strategy_id)

@strategy_bp.route('/top', methods=['GET'])
def get_top_strategies():
    return strategy_controller.get_top_strategies()

# ===== INDICATOR ROUTES =====

@strategy_bp.route('/indicators', methods=['GET'])
def get_indicators():
    return strategy_controller.get_indicator_configs()

@strategy_bp.route('/indicators', methods=['POST'])
def create_indicator():
    return strategy_controller.create_indicator_config()

@strategy_bp.route('/indicators/<int:config_id>', methods=['PUT'])
def update_indicator(config_id):
    return strategy_controller.update_indicator_config(config_id)

# ===== CONFIG ROUTES =====

@config_bp.route('/robot', methods=['GET'])
def get_robot_config():
    return config_controller.get_robot_config()

@config_bp.route('/robot', methods=['POST'])
def save_robot_config():
    return config_controller.save_robot_config()

@config_bp.route('/robot', methods=['PATCH'])
def update_robot_config():
    return config_controller.update_robot_config()

@config_bp.route('/stats', methods=['GET'])
def get_performance_stats():
    return config_controller.get_performance_stats()

@config_bp.route('/daily-performance', methods=['GET'])
def get_daily_performance():
    return config_controller.get_daily_performance()

@config_bp.route('/signal-accuracy', methods=['GET'])
def get_signal_accuracy():
    return config_controller.get_signal_accuracy()

# Test routes
@strategy_bp.route('/test', methods=['GET'])
def test_strategies():
    return {"message": "Strategy routes working"}

@config_bp.route('/test', methods=['GET'])
def test_config():
    return {"message": "Config routes working"}
