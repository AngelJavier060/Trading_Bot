"""
Machine Learning Service
========================
Unified ML service for trading predictions with XAI.
Supports both IQ Option and MT5 platforms.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
import os
import json

from .feature_engineering import FeatureEngineer, FeatureConfig
from .xgboost_model import XGBoostPredictor, XGBoostConfig
from .lstm_model import LSTMPredictor, LSTMConfig, SimpleLSTMPredictor

logger = logging.getLogger(__name__)


class MLService:
    """
    Unified Machine Learning service for trading predictions.
    
    Features:
    - Multiple model support (XGBoost, LSTM)
    - Automatic feature engineering
    - Platform-agnostic (IQ Option, MT5)
    - XAI explanations
    - Model ensemble predictions
    """
    
    def __init__(self):
        self.feature_engineer = FeatureEngineer()
        self.xgboost_model: Optional[XGBoostPredictor] = None
        self.lstm_model: Optional[LSTMPredictor] = None
        self.models_dir = os.path.join('data', 'models')
        os.makedirs(self.models_dir, exist_ok=True)
        
        # Training state
        self.is_xgboost_trained = False
        self.is_lstm_trained = False
        self.last_training: Optional[datetime] = None
    
    def train_models(
        self,
        df: pd.DataFrame,
        train_xgboost: bool = True,
        train_lstm: bool = True,
        xgboost_config: Optional[XGBoostConfig] = None,
        lstm_config: Optional[LSTMConfig] = None
    ) -> Dict:
        """
        Train ML models on historical data.
        
        Args:
            df: DataFrame with OHLCV data
            train_xgboost: Whether to train XGBoost
            train_lstm: Whether to train LSTM
            xgboost_config: XGBoost configuration
            lstm_config: LSTM configuration
            
        Returns:
            Training results for all models
        """
        results = {'status': 'success', 'models': {}}
        
        try:
            # Prepare data with feature engineering
            logger.info("Starting feature engineering...")
            X_train, X_test, y_train, y_test, feature_names = self.feature_engineer.prepare_ml_data(
                df, train_ratio=0.8, scale=True
            )
            
            logger.info(f"Data prepared: {len(X_train)} train, {len(X_test)} test samples")
            logger.info(f"Features: {len(feature_names)}")
            
            # Train XGBoost
            if train_xgboost:
                logger.info("Training XGBoost model...")
                self.xgboost_model = XGBoostPredictor(xgboost_config or XGBoostConfig())
                xgb_result = self.xgboost_model.train(
                    X_train, y_train, X_test, y_test, feature_names
                )
                results['models']['xgboost'] = xgb_result
                self.is_xgboost_trained = xgb_result.get('status') == 'success'
                
                if self.is_xgboost_trained:
                    self.xgboost_model.save('xgboost_trading')
            
            # Train LSTM
            if train_lstm:
                logger.info("Training LSTM model...")
                try:
                    self.lstm_model = LSTMPredictor(lstm_config or LSTMConfig())
                    lstm_result = self.lstm_model.train(
                        X_train, y_train, X_test, y_test, feature_names
                    )
                    results['models']['lstm'] = lstm_result
                    self.is_lstm_trained = lstm_result.get('status') == 'success'
                    
                    if self.is_lstm_trained:
                        self.lstm_model.save('lstm_trading')
                except Exception as e:
                    logger.warning(f"LSTM training failed: {e}. Using simplified model.")
                    self.lstm_model = SimpleLSTMPredictor(sequence_length=30)
                    lstm_result = self.lstm_model.train(X_train, y_train)
                    results['models']['lstm'] = lstm_result
                    self.is_lstm_trained = True
            
            self.last_training = datetime.now()
            results['training_time'] = self.last_training.isoformat()
            results['n_features'] = len(feature_names)
            results['feature_names'] = feature_names[:20]  # Top 20
            
        except Exception as e:
            logger.error(f"Training error: {e}")
            results['status'] = 'error'
            results['message'] = str(e)
        
        return results
    
    def predict(
        self,
        df: pd.DataFrame,
        use_ensemble: bool = True,
        model_type: Optional[str] = None
    ) -> Dict:
        """
        Make prediction on new data.
        
        Args:
            df: DataFrame with recent OHLCV data
            use_ensemble: Whether to combine model predictions
            model_type: Specific model to use ('xgboost' or 'lstm')
            
        Returns:
            Prediction result with XAI explanation
        """
        if not self.is_xgboost_trained and not self.is_lstm_trained:
            return {
                'status': 'error',
                'message': 'No trained models available. Train first.'
            }
        
        try:
            # Prepare features
            X = self.feature_engineer.prepare_prediction_data(df)
            
            if len(X) == 0:
                return {
                    'status': 'error',
                    'message': 'Not enough data for prediction'
                }
            
            predictions = {}
            
            # XGBoost prediction
            if model_type in [None, 'xgboost'] and self.is_xgboost_trained and self.xgboost_model:
                xgb_result = self.xgboost_model.predict(X[-1])
                predictions['xgboost'] = xgb_result.to_dict()
            
            # LSTM prediction
            if model_type in [None, 'lstm'] and self.is_lstm_trained and self.lstm_model:
                try:
                    if hasattr(self.lstm_model, 'predict'):
                        lstm_result = self.lstm_model.predict(X)
                        if isinstance(lstm_result, dict):
                            predictions['lstm'] = lstm_result
                        else:
                            predictions['lstm'] = lstm_result.to_dict()
                except Exception as e:
                    logger.warning(f"LSTM prediction failed: {e}")
            
            # Ensemble prediction
            if use_ensemble and len(predictions) > 1:
                ensemble_result = self._ensemble_predict(predictions)
                predictions['ensemble'] = ensemble_result
            
            # Select final prediction
            if use_ensemble and 'ensemble' in predictions:
                final_prediction = predictions['ensemble']
            elif 'xgboost' in predictions:
                final_prediction = predictions['xgboost']
            elif 'lstm' in predictions:
                final_prediction = predictions['lstm']
            else:
                return {'status': 'error', 'message': 'No predictions available'}
            
            return {
                'status': 'success',
                'prediction': final_prediction,
                'all_models': predictions,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def _ensemble_predict(self, predictions: Dict) -> Dict:
        """Combine predictions from multiple models."""
        probabilities = []
        weights = {'xgboost': 0.6, 'lstm': 0.4}  # XGBoost usually more reliable
        
        for model_name, pred in predictions.items():
            if model_name in weights and 'probability' in pred:
                prob = pred['probability']
                weight = weights[model_name]
                probabilities.append((prob, weight))
        
        if not probabilities:
            return predictions.get('xgboost', predictions.get('lstm', {}))
        
        # Weighted average
        total_weight = sum(w for _, w in probabilities)
        weighted_prob = sum(p * w for p, w in probabilities) / total_weight
        
        prediction = int(weighted_prob > 0.5)
        confidence = abs(weighted_prob - 0.5) * 200
        
        if confidence < 30:
            signal = 'none'
        elif prediction == 1:
            signal = 'call'
        else:
            signal = 'put'
        
        return {
            'prediction': prediction,
            'probability': round(weighted_prob, 4),
            'confidence': round(confidence, 2),
            'signal': signal,
            'method': 'ensemble',
            'explanation': f"Ensemble de {len(probabilities)} modelos con confianza {confidence:.1f}%"
        }
    
    def analyze_with_strategy(
        self,
        df: pd.DataFrame,
        strategy_name: str = 'ema_rsi'
    ) -> Dict:
        """
        Combine ML prediction with traditional strategy.
        
        Returns unified signal with both ML and strategy analysis.
        """
        from services.strategies import get_strategy
        
        result = {
            'status': 'success',
            'ml_prediction': None,
            'strategy_signal': None,
            'combined_signal': None
        }
        
        # Get ML prediction
        if self.is_xgboost_trained or self.is_lstm_trained:
            ml_result = self.predict(df)
            if ml_result.get('status') == 'success':
                result['ml_prediction'] = ml_result.get('prediction')
        
        # Get strategy signal
        try:
            strategy = get_strategy(strategy_name)
            candles = df.to_dict('records')
            strategy_signal = strategy.analyze(candles)
            result['strategy_signal'] = strategy_signal.to_dict()
        except Exception as e:
            logger.warning(f"Strategy analysis failed: {e}")
        
        # Combine signals
        result['combined_signal'] = self._combine_signals(
            result['ml_prediction'],
            result['strategy_signal']
        )
        
        return result
    
    def _combine_signals(self, ml_pred: Optional[Dict], strategy_signal: Optional[Dict]) -> Dict:
        """Combine ML and strategy signals."""
        if not ml_pred and not strategy_signal:
            return {'signal': 'none', 'confidence': 0, 'reason': 'No signals available'}
        
        if not ml_pred:
            return {
                'signal': strategy_signal.get('signal', 'none'),
                'confidence': strategy_signal.get('confidence', 0),
                'reason': 'Strategy only (ML not trained)'
            }
        
        if not strategy_signal:
            return {
                'signal': ml_pred.get('signal', 'none'),
                'confidence': ml_pred.get('confidence', 0),
                'reason': 'ML only (Strategy failed)'
            }
        
        # Both available - weighted combination
        ml_signal = ml_pred.get('signal', 'none')
        ml_conf = ml_pred.get('confidence', 0)
        
        strat_signal = strategy_signal.get('signal', 'none')
        strat_conf = strategy_signal.get('confidence', 0)
        
        # Agreement check
        if ml_signal == strat_signal and ml_signal != 'none':
            # Both agree - high confidence
            combined_conf = min(95, (ml_conf + strat_conf) / 2 * 1.2)
            return {
                'signal': ml_signal,
                'confidence': round(combined_conf, 1),
                'reason': f'ML y estrategia concuerdan ({ml_signal})',
                'ml_confidence': ml_conf,
                'strategy_confidence': strat_conf
            }
        elif ml_signal != 'none' and strat_signal != 'none' and ml_signal != strat_signal:
            # Disagreement - use higher confidence
            if ml_conf > strat_conf:
                return {
                    'signal': ml_signal,
                    'confidence': round(ml_conf * 0.7, 1),
                    'reason': 'ML prevalece (mayor confianza)',
                    'ml_confidence': ml_conf,
                    'strategy_confidence': strat_conf
                }
            else:
                return {
                    'signal': strat_signal,
                    'confidence': round(strat_conf * 0.7, 1),
                    'reason': 'Estrategia prevalece (mayor confianza)',
                    'ml_confidence': ml_conf,
                    'strategy_confidence': strat_conf
                }
        else:
            # One is 'none'
            signal = ml_signal if ml_signal != 'none' else strat_signal
            conf = ml_conf if ml_signal != 'none' else strat_conf
            return {
                'signal': signal,
                'confidence': round(conf * 0.8, 1),
                'reason': 'Señal única disponible',
                'ml_confidence': ml_conf,
                'strategy_confidence': strat_conf
            }
    
    def get_feature_importance(self) -> Dict:
        """Get feature importance from trained models."""
        result = {}
        
        if self.is_xgboost_trained and self.xgboost_model:
            result['xgboost'] = self.xgboost_model.get_feature_importance()[:20]
        
        return result
    
    def load_models(self) -> Dict:
        """Load saved models from disk."""
        results = {}
        
        # Load XGBoost
        self.xgboost_model = XGBoostPredictor()
        if self.xgboost_model.load('xgboost_trading'):
            self.is_xgboost_trained = True
            results['xgboost'] = 'loaded'
        else:
            results['xgboost'] = 'not found'
        
        # Load LSTM
        try:
            self.lstm_model = LSTMPredictor()
            if self.lstm_model.load('lstm_trading'):
                self.is_lstm_trained = True
                results['lstm'] = 'loaded'
            else:
                results['lstm'] = 'not found'
        except Exception as e:
            results['lstm'] = f'error: {str(e)}'
        
        return results
    
    def get_status(self) -> Dict:
        """Get service status."""
        return {
            'xgboost_trained': self.is_xgboost_trained,
            'lstm_trained': self.is_lstm_trained,
            'last_training': self.last_training.isoformat() if self.last_training else None,
            'xgboost_info': self.xgboost_model.get_model_info() if self.xgboost_model else None,
            'lstm_info': self.lstm_model.get_model_info() if self.lstm_model and hasattr(self.lstm_model, 'get_model_info') else None
        }


# Singleton instance
ml_service = MLService()
