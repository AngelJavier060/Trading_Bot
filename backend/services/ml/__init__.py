"""
Machine Learning Module
=======================
Professional ML models for trading prediction with XAI capabilities.
Machine Learning Services Package
"""

from .ml_service import MLService
from .feature_engineering import FeatureEngineer, FeatureConfig
from .xgboost_model import XGBoostPredictor, XGBoostConfig
from .db_integration import MLDatabaseIntegration, ml_db_integration

# Singleton instance
ml_service = MLService()

__all__ = [
    'MLService',
    'ml_service',
    'FeatureEngineer',
    'FeatureConfig',
    'XGBoostPredictor',
    'XGBoostConfig',
    'MLDatabaseIntegration',
    'ml_db_integration'
]
