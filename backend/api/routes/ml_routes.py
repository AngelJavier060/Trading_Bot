"""
Machine Learning API Routes
===========================
Routes for ML predictions and training.
"""

from flask import Blueprint
from api.controllers.ml_controller import ml_controller

ml_bp = Blueprint('ml', __name__)


@ml_bp.route('/status', methods=['GET'])
def get_status():
    """Get ML service status."""
    return ml_controller.get_status()


@ml_bp.route('/train', methods=['POST'])
def train():
    """Train ML models."""
    return ml_controller.train()


@ml_bp.route('/quick-train', methods=['POST'])
def quick_train():
    """Quick train with demo data."""
    return ml_controller.quick_train()


@ml_bp.route('/predict', methods=['POST'])
def predict():
    """Make ML prediction."""
    return ml_controller.predict()


@ml_bp.route('/analyze', methods=['POST'])
def analyze():
    """Analyze with ML + Strategy."""
    return ml_controller.analyze()


@ml_bp.route('/feature-importance', methods=['GET'])
def get_feature_importance():
    """Get feature importance."""
    return ml_controller.get_feature_importance()


@ml_bp.route('/features', methods=['GET'])
def get_features():
    """Get list of features."""
    return ml_controller.get_features()


@ml_bp.route('/load', methods=['POST'])
def load_models():
    """Load saved models."""
    return ml_controller.load_models()


@ml_bp.route('/patterns', methods=['GET'])
def analyze_patterns():
    """Analyze winning patterns from trade history."""
    return ml_controller.analyze_patterns()


@ml_bp.route('/optimize/<strategy_name>', methods=['GET'])
def optimize_strategy(strategy_name):
    """Get optimization suggestions for a strategy."""
    return ml_controller.get_optimization_suggestions(strategy_name)


@ml_bp.route('/performance', methods=['GET'])
def ml_performance():
    """Get ML model performance metrics."""
    return ml_controller.get_ml_performance()


@ml_bp.route('/train-from-history', methods=['POST'])
def train_from_history():
    """Train models using trade history from database."""
    return ml_controller.train_from_history()


@ml_bp.route('/test', methods=['GET'])
def test():
    """Test route."""
    return {"message": "ML routes working", "status": "ok"}
