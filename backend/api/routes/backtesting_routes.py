"""
Backtesting API Routes
======================
Routes for backtesting operations.
"""

from flask import Blueprint
from api.controllers.backtesting_controller import backtesting_controller

backtesting_bp = Blueprint('backtesting', __name__)


@backtesting_bp.route('/strategies', methods=['GET'])
def get_strategies():
    """Get list of available strategies."""
    return backtesting_controller.get_strategies()


@backtesting_bp.route('/strategy', methods=['GET'])
def get_strategy_details():
    """Get details for a specific strategy."""
    return backtesting_controller.get_strategy_details()


@backtesting_bp.route('/run', methods=['POST'])
def run_backtest():
    """Run a full backtest with provided config and data."""
    return backtesting_controller.run_backtest()


@backtesting_bp.route('/quick', methods=['POST'])
def run_quick_backtest():
    """Run a quick backtest with sample data."""
    return backtesting_controller.run_quick_backtest()


@backtesting_bp.route('/result', methods=['GET'])
def get_result():
    """Get a cached backtest result by ID."""
    return backtesting_controller.get_result()


@backtesting_bp.route('/results', methods=['GET'])
def list_results():
    """List saved backtest results."""
    return backtesting_controller.list_results()


@backtesting_bp.route('/compare', methods=['POST'])
def compare_strategies():
    """Compare multiple strategies on the same data."""
    return backtesting_controller.compare_strategies()


@backtesting_bp.route('/analyze', methods=['POST'])
def analyze_signal():
    """Analyze current market data with a strategy."""
    return backtesting_controller.analyze_signal()


@backtesting_bp.route('/test', methods=['GET'])
def test():
    """Test route."""
    return {"message": "Backtesting routes working", "status": "ok"}
