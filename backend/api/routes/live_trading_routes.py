"""
Live Trading API Routes
=======================
Routes for live trading operations with real-time status.
"""

from flask import Blueprint
from api.controllers.live_trading_controller import live_trading_controller

live_trading_bp = Blueprint('live_trading', __name__)


@live_trading_bp.route('/status', methods=['GET'])
def get_bot_status():
    """Get current bot status."""
    return live_trading_controller.get_bot_status()


@live_trading_bp.route('/start', methods=['POST'])
def start_bot():
    """Start the trading bot."""
    return live_trading_controller.start_bot()


@live_trading_bp.route('/stop', methods=['POST'])
def stop_bot():
    """Stop the trading bot."""
    return live_trading_controller.stop_bot()


@live_trading_bp.route('/scan', methods=['POST'])
def scan_and_analyze():
    """Scan market and analyze for signals."""
    return live_trading_controller.scan_and_analyze()


@live_trading_bp.route('/execute', methods=['POST'])
def execute_trade():
    """Execute a trade with XAI explanation."""
    return live_trading_controller.execute_trade()


@live_trading_bp.route('/complete', methods=['POST'])
def complete_trade():
    """Complete a pending trade."""
    return live_trading_controller.complete_trade()


@live_trading_bp.route('/history', methods=['GET'])
def get_trade_history():
    """Get trade history."""
    return live_trading_controller.get_trade_history()


@live_trading_bp.route('/history/advanced', methods=['GET'])
def get_trade_history_advanced():
    """Get filtered trade history."""
    return live_trading_controller.get_trade_history_advanced()


@live_trading_bp.route('/history/export', methods=['GET'])
def export_trade_history():
    """Export filtered trade history."""
    return live_trading_controller.export_trade_history()


@live_trading_bp.route('/signals', methods=['GET'])
def get_signal_log():
    """Get recent signals."""
    return live_trading_controller.get_signal_log()


@live_trading_bp.route('/loss-analysis', methods=['GET'])
def get_loss_analysis():
    """Get loss pattern analysis."""
    return live_trading_controller.get_loss_analysis()


@live_trading_bp.route('/test', methods=['GET'])
def test():
    """Test route."""
    return {"message": "Live trading routes working", "status": "ok"}
