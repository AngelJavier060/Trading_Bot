"""
Machine Learning Controller
============================
API controller for ML predictions and training.
"""

import logging
from typing import Dict, Optional
from flask import request, jsonify
import pandas as pd
import numpy as np

from services.ml import MLService, FeatureEngineer, ml_db_integration
from services.data import unified_data_service

logger = logging.getLogger(__name__)


class MLController:
    """Controller for Machine Learning operations."""
    
    def __init__(self):
        self.ml_service = MLService()
        self.feature_engineer = FeatureEngineer()
    
    def get_status(self):
        """Get ML service status."""
        try:
            status = self.ml_service.get_status()
            return jsonify({
                'status': 'success',
                'ml_status': status
            })
        except Exception as e:
            logger.error(f"Error getting ML status: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def train(self):
        """
        Train ML models on provided or fetched data.
        
        Expected JSON body:
        {
            "platform": "iqoption" | "mt5" | "demo",
            "symbol": "EURUSD",
            "timeframe": "5m",
            "candles": 1000,
            "train_xgboost": true,
            "train_lstm": true,
            "data": [...] (optional, if not using platform)
        }
        """
        try:
            data = request.get_json() or {}
            
            # Get training data
            if 'data' in data and data['data']:
                # Use provided data
                df = pd.DataFrame(data['data'])
            else:
                # Fetch from platform
                platform = data.get('platform', 'demo')
                symbol = data.get('symbol', 'EURUSD')
                timeframe = data.get('timeframe', '5m')
                n_candles = min(int(data.get('candles', 1000)), 5000)
                
                # Connect to demo if not connected
                if not unified_data_service.is_connected():
                    unified_data_service.connect('demo', {})
                
                df = unified_data_service.get_candles(symbol, timeframe, n_candles)
                
                if df.empty:
                    return jsonify({
                        'status': 'error',
                        'message': 'Could not fetch training data'
                    }), 400
            
            # Train models
            result = self.ml_service.train_models(
                df,
                train_xgboost=data.get('train_xgboost', True),
                train_lstm=data.get('train_lstm', True)
            )
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Training error: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def predict(self):
        """
        Make ML prediction.
        
        Expected JSON body:
        {
            "platform": "iqoption" | "mt5" | "demo",
            "symbol": "EURUSD",
            "timeframe": "5m",
            "candles": 100,
            "model": "xgboost" | "lstm" | "ensemble",
            "data": [...] (optional)
        }
        """
        try:
            data = request.get_json() or {}
            
            # Get prediction data
            if 'data' in data and data['data']:
                df = pd.DataFrame(data['data'])
            else:
                platform = data.get('platform', 'demo')
                symbol = data.get('symbol', 'EURUSD')
                timeframe = data.get('timeframe', '5m')
                n_candles = min(int(data.get('candles', 100)), 500)
                
                if not unified_data_service.is_connected():
                    unified_data_service.connect('demo', {})
                
                df = unified_data_service.get_candles(symbol, timeframe, n_candles)
                
                if df.empty:
                    return jsonify({
                        'status': 'error',
                        'message': 'Could not fetch prediction data'
                    }), 400
            
            # Make prediction
            model_type = data.get('model')
            use_ensemble = model_type == 'ensemble' or model_type is None
            
            result = self.ml_service.predict(
                df,
                use_ensemble=use_ensemble,
                model_type=model_type if model_type in ['xgboost', 'lstm'] else None
            )
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def analyze(self):
        """
        Analyze with ML + Strategy combination.
        
        Expected JSON body:
        {
            "symbol": "EURUSD",
            "timeframe": "5m",
            "strategy": "ema_rsi",
            "data": [...] (optional)
        }
        """
        try:
            data = request.get_json() or {}
            
            # Get data
            if 'data' in data and data['data']:
                df = pd.DataFrame(data['data'])
            else:
                symbol = data.get('symbol', 'EURUSD')
                timeframe = data.get('timeframe', '5m')
                n_candles = 200
                
                if not unified_data_service.is_connected():
                    unified_data_service.connect('demo', {})
                
                df = unified_data_service.get_candles(symbol, timeframe, n_candles)
                
                if df.empty:
                    return jsonify({
                        'status': 'error',
                        'message': 'Could not fetch data'
                    }), 400
            
            # Analyze
            strategy_name = data.get('strategy', 'ema_rsi')
            result = self.ml_service.analyze_with_strategy(df, strategy_name)
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Analysis error: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_feature_importance(self):
        """Get feature importance from trained models."""
        try:
            importance = self.ml_service.get_feature_importance()
            return jsonify({
                'status': 'success',
                'feature_importance': importance
            })
        except Exception as e:
            logger.error(f"Error getting feature importance: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def load_models(self):
        """Load saved models from disk."""
        try:
            result = self.ml_service.load_models()
            return jsonify({
                'status': 'success',
                'loaded': result
            })
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def quick_train(self):
        """Quick train with demo data for testing."""
        try:
            # Generate demo data
            if not unified_data_service.is_connected():
                unified_data_service.connect('demo', {})
            
            df = unified_data_service.get_candles('EURUSD', '5m', 1000)
            
            # Train only XGBoost (faster)
            result = self.ml_service.train_models(
                df,
                train_xgboost=True,
                train_lstm=False
            )
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Quick train error: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_features(self):
        """Get list of features used by the model."""
        try:
            features = self.feature_engineer.feature_names
            return jsonify({
                'status': 'success',
                'features': features,
                'count': len(features)
            })
        except Exception as e:
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500


    def analyze_patterns(self):
        """Analyze winning patterns from trade history."""
        try:
            symbol = request.args.get('symbol')
            strategy = request.args.get('strategy')
            
            analysis = ml_db_integration.analyze_winning_patterns(
                symbol=symbol,
                strategy=strategy
            )
            
            return jsonify({
                'status': 'success',
                'analysis': analysis
            })
        except Exception as e:
            logger.error(f"Error analyzing patterns: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_optimization_suggestions(self, strategy_name: str):
        """Get optimization suggestions for a strategy."""
        try:
            suggestions = ml_db_integration.get_strategy_optimization_suggestions(
                strategy_name=strategy_name
            )
            
            return jsonify({
                'status': 'success',
                'suggestions': suggestions
            })
        except Exception as e:
            logger.error(f"Error getting suggestions: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_ml_performance(self):
        """Get ML model performance metrics."""
        try:
            days = request.args.get('days', 30, type=int)
            performance = ml_db_integration.get_ml_model_performance(days_back=days)
            
            return jsonify({
                'status': 'success',
                'performance': performance
            })
        except Exception as e:
            logger.error(f"Error getting ML performance: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def train_from_history(self):
        """Train models using trade history from database."""
        try:
            data = request.get_json() or {}
            
            days_back = data.get('days_back', 90)
            symbol = data.get('symbol')
            strategy = data.get('strategy')
            min_trades = data.get('min_trades', 100)
            
            # Get training data from database
            training_df = ml_db_integration.get_training_data_from_history(
                min_trades=min_trades,
                days_back=days_back,
                symbol=symbol,
                strategy=strategy
            )
            
            if training_df is None or len(training_df) < min_trades:
                return jsonify({
                    'status': 'error',
                    'message': f'Insufficient training data. Need at least {min_trades} trades.'
                }), 400
            
            # Train with the historical data
            result = self.ml_service.train_models(
                training_df,
                train_xgboost=data.get('train_xgboost', True),
                train_lstm=data.get('train_lstm', False)
            )
            
            result['trades_used'] = len(training_df)
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Error training from history: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500


# Singleton instance
ml_controller = MLController()
