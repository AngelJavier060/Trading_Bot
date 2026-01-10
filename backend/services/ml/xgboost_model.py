"""
XGBoost Model for Trading Prediction
====================================
Professional XGBoost implementation with XAI capabilities.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import logging
import pickle
import os
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class XGBoostConfig:
    """Configuration for XGBoost model."""
    n_estimators: int = 100
    max_depth: int = 6
    learning_rate: float = 0.1
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    min_child_weight: int = 1
    gamma: float = 0
    reg_alpha: float = 0
    reg_lambda: float = 1
    objective: str = 'binary:logistic'
    eval_metric: str = 'auc'
    use_gpu: bool = False
    random_state: int = 42


@dataclass
class PredictionResult:
    """Result of a prediction with XAI."""
    prediction: int  # 0 or 1
    probability: float  # Probability of class 1
    confidence: float  # Confidence score
    signal: str  # 'call', 'put', or 'none'
    feature_importance: List[Dict]  # Top contributing features
    shap_values: Optional[Dict] = None  # SHAP explanation
    
    def to_dict(self) -> Dict:
        return {
            'prediction': self.prediction,
            'probability': round(self.probability, 4),
            'confidence': round(self.confidence, 2),
            'signal': self.signal,
            'feature_importance': self.feature_importance[:10],  # Top 10
            'explanation': self.generate_explanation()
        }
    
    def generate_explanation(self) -> str:
        """Generate human-readable explanation."""
        direction = "COMPRA (CALL)" if self.signal == 'call' else "VENTA (PUT)" if self.signal == 'put' else "SIN SEÑAL"
        
        explanation = f"Señal: {direction} con {self.confidence}% de confianza.\n"
        explanation += "Factores principales:\n"
        
        for feat in self.feature_importance[:5]:
            impact = "positivo" if feat.get('impact', 0) > 0 else "negativo"
            explanation += f"  • {feat['feature']}: impacto {impact} ({feat['importance']:.4f})\n"
        
        return explanation


class XGBoostPredictor:
    """
    XGBoost-based predictor for trading signals.
    
    Features:
    - Binary classification for direction prediction
    - Feature importance analysis
    - SHAP-based explanations (XAI)
    - Model persistence
    """
    
    def __init__(self, config: Optional[XGBoostConfig] = None):
        self.config = config or XGBoostConfig()
        self.model = None
        self.feature_names: List[str] = []
        self.is_trained = False
        self.training_metrics: Dict = {}
        self.model_path = os.path.join('data', 'models', 'xgboost')
        os.makedirs(self.model_path, exist_ok=True)
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None
    ) -> Dict:
        """
        Train the XGBoost model.
        
        Args:
            X_train: Training features
            y_train: Training labels
            X_val: Validation features (optional)
            y_val: Validation labels (optional)
            feature_names: Names of features
            
        Returns:
            Training metrics
        """
        try:
            import xgboost as xgb
        except ImportError:
            logger.error("XGBoost not installed. Install with: pip install xgboost")
            return {'status': 'error', 'message': 'XGBoost not installed'}
        
        self.feature_names = feature_names or [f'feature_{i}' for i in range(X_train.shape[1])]
        
        # Create DMatrix
        dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=self.feature_names)
        
        # Parameters
        params = {
            'max_depth': self.config.max_depth,
            'learning_rate': self.config.learning_rate,
            'subsample': self.config.subsample,
            'colsample_bytree': self.config.colsample_bytree,
            'min_child_weight': self.config.min_child_weight,
            'gamma': self.config.gamma,
            'reg_alpha': self.config.reg_alpha,
            'reg_lambda': self.config.reg_lambda,
            'objective': self.config.objective,
            'eval_metric': self.config.eval_metric,
            'seed': self.config.random_state,
        }
        
        if self.config.use_gpu:
            params['tree_method'] = 'gpu_hist'
        
        # Evaluation set
        evals = [(dtrain, 'train')]
        if X_val is not None and y_val is not None:
            dval = xgb.DMatrix(X_val, label=y_val, feature_names=self.feature_names)
            evals.append((dval, 'val'))
        
        # Train
        evals_result = {}
        self.model = xgb.train(
            params,
            dtrain,
            num_boost_round=self.config.n_estimators,
            evals=evals,
            evals_result=evals_result,
            early_stopping_rounds=20 if X_val is not None else None,
            verbose_eval=False
        )
        
        self.is_trained = True
        
        # Calculate metrics
        train_pred = (self.model.predict(dtrain) > 0.5).astype(int)
        train_accuracy = (train_pred == y_train).mean()
        
        self.training_metrics = {
            'train_accuracy': float(train_accuracy),
            'train_samples': len(y_train),
            'n_features': X_train.shape[1],
            'best_iteration': self.model.best_iteration if hasattr(self.model, 'best_iteration') else self.config.n_estimators,
        }
        
        if X_val is not None:
            val_pred = (self.model.predict(dval) > 0.5).astype(int)
            val_accuracy = (val_pred == y_val).mean()
            self.training_metrics['val_accuracy'] = float(val_accuracy)
            self.training_metrics['val_samples'] = len(y_val)
        
        logger.info(f"XGBoost trained: accuracy={train_accuracy:.4f}")
        
        return {
            'status': 'success',
            'metrics': self.training_metrics
        }
    
    def predict(self, X: np.ndarray, threshold: float = 0.5) -> PredictionResult:
        """
        Make prediction with XAI explanation.
        
        Args:
            X: Features (single sample or batch)
            threshold: Probability threshold for positive class
            
        Returns:
            PredictionResult with prediction and explanation
        """
        if not self.is_trained or self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        try:
            import xgboost as xgb
        except ImportError:
            raise ImportError("XGBoost not installed")
        
        # Handle single sample
        if X.ndim == 1:
            X = X.reshape(1, -1)
        
        # Create DMatrix
        dtest = xgb.DMatrix(X, feature_names=self.feature_names)
        
        # Get probability
        probability = float(self.model.predict(dtest)[0])
        prediction = int(probability > threshold)
        
        # Calculate confidence
        confidence = abs(probability - 0.5) * 200  # 0-100 scale
        
        # Determine signal
        if confidence < 30:
            signal = 'none'
        elif prediction == 1:
            signal = 'call'
        else:
            signal = 'put'
        
        # Get feature importance for this prediction
        feature_importance = self._get_prediction_importance(X[0])
        
        return PredictionResult(
            prediction=prediction,
            probability=probability,
            confidence=confidence,
            signal=signal,
            feature_importance=feature_importance
        )
    
    def predict_batch(self, X: np.ndarray, threshold: float = 0.5) -> List[Dict]:
        """Predict for multiple samples."""
        if not self.is_trained or self.model is None:
            raise ValueError("Model not trained")
        
        try:
            import xgboost as xgb
        except ImportError:
            raise ImportError("XGBoost not installed")
        
        dtest = xgb.DMatrix(X, feature_names=self.feature_names)
        probabilities = self.model.predict(dtest)
        
        results = []
        for prob in probabilities:
            prediction = int(prob > threshold)
            confidence = abs(prob - 0.5) * 200
            
            if confidence < 30:
                signal = 'none'
            elif prediction == 1:
                signal = 'call'
            else:
                signal = 'put'
            
            results.append({
                'prediction': prediction,
                'probability': round(float(prob), 4),
                'confidence': round(confidence, 2),
                'signal': signal
            })
        
        return results
    
    def _get_prediction_importance(self, x: np.ndarray) -> List[Dict]:
        """Get feature importance for a specific prediction."""
        # Get global feature importance
        importance = self.model.get_score(importance_type='gain')
        
        # Calculate contribution for this sample
        contributions = []
        for i, (name, value) in enumerate(zip(self.feature_names, x)):
            imp = importance.get(name, 0)
            contributions.append({
                'feature': name,
                'value': float(value),
                'importance': float(imp),
                'impact': float(value * imp) if imp > 0 else 0
            })
        
        # Sort by absolute impact
        contributions.sort(key=lambda x: abs(x['impact']), reverse=True)
        
        return contributions
    
    def get_feature_importance(self, importance_type: str = 'gain') -> List[Dict]:
        """Get global feature importance."""
        if not self.is_trained or self.model is None:
            return []
        
        importance = self.model.get_score(importance_type=importance_type)
        
        result = []
        for name in self.feature_names:
            result.append({
                'feature': name,
                'importance': importance.get(name, 0)
            })
        
        result.sort(key=lambda x: x['importance'], reverse=True)
        return result
    
    def save(self, name: str = 'xgboost_model') -> str:
        """Save model to disk."""
        if not self.is_trained or self.model is None:
            raise ValueError("No trained model to save")
        
        filepath = os.path.join(self.model_path, f'{name}.pkl')
        
        save_data = {
            'model': self.model,
            'feature_names': self.feature_names,
            'config': self.config,
            'training_metrics': self.training_metrics,
            'saved_at': datetime.now().isoformat()
        }
        
        with open(filepath, 'wb') as f:
            pickle.dump(save_data, f)
        
        logger.info(f"Model saved to {filepath}")
        return filepath
    
    def load(self, name: str = 'xgboost_model') -> bool:
        """Load model from disk."""
        filepath = os.path.join(self.model_path, f'{name}.pkl')
        
        if not os.path.exists(filepath):
            logger.error(f"Model file not found: {filepath}")
            return False
        
        try:
            with open(filepath, 'rb') as f:
                save_data = pickle.load(f)
            
            self.model = save_data['model']
            self.feature_names = save_data['feature_names']
            self.config = save_data.get('config', self.config)
            self.training_metrics = save_data.get('training_metrics', {})
            self.is_trained = True
            
            logger.info(f"Model loaded from {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False
    
    def get_model_info(self) -> Dict:
        """Get model information."""
        return {
            'is_trained': self.is_trained,
            'n_features': len(self.feature_names),
            'feature_names': self.feature_names[:20],  # First 20
            'config': {
                'n_estimators': self.config.n_estimators,
                'max_depth': self.config.max_depth,
                'learning_rate': self.config.learning_rate,
            },
            'training_metrics': self.training_metrics
        }
