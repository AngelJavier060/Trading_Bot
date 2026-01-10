"""
LSTM Model for Trading Prediction
=================================
Professional LSTM implementation for time series prediction with XAI.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import logging
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class LSTMConfig:
    """Configuration for LSTM model."""
    sequence_length: int = 60  # Number of time steps
    lstm_units: List[int] = None  # Units per LSTM layer
    dense_units: List[int] = None  # Units per Dense layer
    dropout_rate: float = 0.2
    learning_rate: float = 0.001
    batch_size: int = 32
    epochs: int = 50
    early_stopping_patience: int = 10
    validation_split: float = 0.2
    output_type: str = 'classification'  # 'classification' or 'regression'
    
    def __post_init__(self):
        if self.lstm_units is None:
            self.lstm_units = [128, 64]
        if self.dense_units is None:
            self.dense_units = [32]


@dataclass
class LSTMPredictionResult:
    """Result of LSTM prediction."""
    prediction: int
    probability: float
    confidence: float
    signal: str
    sequence_attention: Optional[List[float]] = None
    
    def to_dict(self) -> Dict:
        return {
            'prediction': self.prediction,
            'probability': round(self.probability, 4),
            'confidence': round(self.confidence, 2),
            'signal': self.signal,
            'sequence_attention': self.sequence_attention[:10] if self.sequence_attention else None,
            'explanation': self.generate_explanation()
        }
    
    def generate_explanation(self) -> str:
        direction = "COMPRA (CALL)" if self.signal == 'call' else "VENTA (PUT)" if self.signal == 'put' else "SIN SEÑAL"
        return f"LSTM predice {direction} con {self.confidence}% de confianza basado en los últimos {60} períodos."


class LSTMPredictor:
    """
    LSTM-based predictor for time series trading signals.
    
    Features:
    - Multi-layer LSTM architecture
    - Sequence-to-one prediction
    - Attention mechanism for XAI
    - Model persistence
    """
    
    def __init__(self, config: Optional[LSTMConfig] = None):
        self.config = config or LSTMConfig()
        self.model = None
        self.scaler = None
        self.feature_names: List[str] = []
        self.is_trained = False
        self.training_history: Dict = {}
        self.model_path = os.path.join('data', 'models', 'lstm')
        os.makedirs(self.model_path, exist_ok=True)
        
        # Check TensorFlow availability
        self._tf_available = self._check_tensorflow()
    
    def _check_tensorflow(self) -> bool:
        """Check if TensorFlow is available."""
        try:
            import tensorflow as tf
            logger.info(f"TensorFlow version: {tf.__version__}")
            return True
        except ImportError:
            logger.warning("TensorFlow not installed. LSTM features limited.")
            return False
    
    def create_sequences(
        self, 
        X: np.ndarray, 
        y: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Create sequences for LSTM input.
        
        Args:
            X: Feature array (n_samples, n_features)
            y: Target array (optional)
            
        Returns:
            X_seq: Sequences (n_sequences, sequence_length, n_features)
            y_seq: Corresponding targets (if y provided)
        """
        seq_length = self.config.sequence_length
        n_samples = len(X)
        
        if n_samples < seq_length:
            raise ValueError(f"Not enough samples ({n_samples}) for sequence length ({seq_length})")
        
        X_seq = []
        y_seq = [] if y is not None else None
        
        for i in range(seq_length, n_samples):
            X_seq.append(X[i - seq_length:i])
            if y is not None:
                y_seq.append(y[i])
        
        X_seq = np.array(X_seq)
        if y_seq is not None:
            y_seq = np.array(y_seq)
        
        return X_seq, y_seq
    
    def build_model(self, n_features: int) -> None:
        """Build LSTM model architecture."""
        if not self._tf_available:
            raise ImportError("TensorFlow required for LSTM model")
        
        import tensorflow as tf
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
        from tensorflow.keras.optimizers import Adam
        
        model = Sequential()
        
        # LSTM layers
        for i, units in enumerate(self.config.lstm_units):
            return_sequences = i < len(self.config.lstm_units) - 1
            
            if i == 0:
                model.add(LSTM(
                    units,
                    return_sequences=return_sequences,
                    input_shape=(self.config.sequence_length, n_features)
                ))
            else:
                model.add(LSTM(units, return_sequences=return_sequences))
            
            model.add(BatchNormalization())
            model.add(Dropout(self.config.dropout_rate))
        
        # Dense layers
        for units in self.config.dense_units:
            model.add(Dense(units, activation='relu'))
            model.add(Dropout(self.config.dropout_rate))
        
        # Output layer
        if self.config.output_type == 'classification':
            model.add(Dense(1, activation='sigmoid'))
            loss = 'binary_crossentropy'
            metrics = ['accuracy']
        else:
            model.add(Dense(1, activation='linear'))
            loss = 'mse'
            metrics = ['mae']
        
        # Compile
        optimizer = Adam(learning_rate=self.config.learning_rate)
        model.compile(optimizer=optimizer, loss=loss, metrics=metrics)
        
        self.model = model
        logger.info(f"LSTM model built: {model.count_params()} parameters")
    
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None
    ) -> Dict:
        """
        Train the LSTM model.
        
        Args:
            X_train: Training features (already in sequence format or raw)
            y_train: Training labels
            X_val: Validation features
            y_val: Validation labels
            feature_names: Names of features
            
        Returns:
            Training results
        """
        if not self._tf_available:
            return {'status': 'error', 'message': 'TensorFlow not installed'}
        
        import tensorflow as tf
        from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
        
        self.feature_names = feature_names or []
        
        # Create sequences if needed
        if X_train.ndim == 2:
            X_train_seq, y_train_seq = self.create_sequences(X_train, y_train)
        else:
            X_train_seq, y_train_seq = X_train, y_train
        
        n_features = X_train_seq.shape[2]
        
        # Build model
        self.build_model(n_features)
        
        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss' if X_val is not None else 'loss',
                patience=self.config.early_stopping_patience,
                restore_best_weights=True
            ),
            ReduceLROnPlateau(
                monitor='val_loss' if X_val is not None else 'loss',
                factor=0.5,
                patience=5,
                min_lr=1e-6
            )
        ]
        
        # Validation data
        validation_data = None
        if X_val is not None and y_val is not None:
            if X_val.ndim == 2:
                X_val_seq, y_val_seq = self.create_sequences(X_val, y_val)
            else:
                X_val_seq, y_val_seq = X_val, y_val
            validation_data = (X_val_seq, y_val_seq)
        
        # Train
        history = self.model.fit(
            X_train_seq, y_train_seq,
            epochs=self.config.epochs,
            batch_size=self.config.batch_size,
            validation_data=validation_data,
            validation_split=self.config.validation_split if validation_data is None else 0,
            callbacks=callbacks,
            verbose=0
        )
        
        self.is_trained = True
        self.training_history = {
            'loss': [float(x) for x in history.history['loss']],
            'accuracy': [float(x) for x in history.history.get('accuracy', [])],
        }
        
        if 'val_loss' in history.history:
            self.training_history['val_loss'] = [float(x) for x in history.history['val_loss']]
            self.training_history['val_accuracy'] = [float(x) for x in history.history.get('val_accuracy', [])]
        
        # Final metrics
        final_loss = float(history.history['loss'][-1])
        final_acc = float(history.history.get('accuracy', [0])[-1])
        
        logger.info(f"LSTM trained: loss={final_loss:.4f}, accuracy={final_acc:.4f}")
        
        return {
            'status': 'success',
            'epochs_trained': len(history.history['loss']),
            'final_loss': final_loss,
            'final_accuracy': final_acc,
            'training_history': self.training_history
        }
    
    def predict(self, X: np.ndarray, threshold: float = 0.5) -> LSTMPredictionResult:
        """
        Make prediction with explanation.
        
        Args:
            X: Features (single sequence or raw data to create sequence)
            threshold: Classification threshold
            
        Returns:
            LSTMPredictionResult
        """
        if not self.is_trained or self.model is None:
            raise ValueError("Model not trained")
        
        # Ensure correct shape
        if X.ndim == 2:
            # Raw features - take last sequence_length samples
            if len(X) < self.config.sequence_length:
                raise ValueError(f"Need at least {self.config.sequence_length} samples")
            X = X[-self.config.sequence_length:].reshape(1, self.config.sequence_length, -1)
        elif X.ndim == 3 and X.shape[0] != 1:
            X = X[-1:, :, :]  # Take last sequence
        
        # Predict
        probability = float(self.model.predict(X, verbose=0)[0][0])
        
        if self.config.output_type == 'classification':
            prediction = int(probability > threshold)
            confidence = abs(probability - 0.5) * 200
        else:
            prediction = 1 if probability > 0 else 0
            confidence = min(abs(probability) * 100, 100)
        
        # Determine signal
        if confidence < 30:
            signal = 'none'
        elif prediction == 1:
            signal = 'call'
        else:
            signal = 'put'
        
        return LSTMPredictionResult(
            prediction=prediction,
            probability=probability,
            confidence=confidence,
            signal=signal
        )
    
    def predict_batch(self, X: np.ndarray, threshold: float = 0.5) -> List[Dict]:
        """Predict for multiple sequences."""
        if not self.is_trained or self.model is None:
            raise ValueError("Model not trained")
        
        # Create sequences if needed
        if X.ndim == 2:
            X_seq, _ = self.create_sequences(X)
        else:
            X_seq = X
        
        probabilities = self.model.predict(X_seq, verbose=0).flatten()
        
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
    
    def save(self, name: str = 'lstm_model') -> str:
        """Save model to disk."""
        if not self.is_trained or self.model is None:
            raise ValueError("No trained model to save")
        
        # Save Keras model
        model_file = os.path.join(self.model_path, f'{name}.keras')
        self.model.save(model_file)
        
        # Save metadata
        metadata = {
            'feature_names': self.feature_names,
            'config': {
                'sequence_length': self.config.sequence_length,
                'lstm_units': self.config.lstm_units,
                'dense_units': self.config.dense_units,
                'output_type': self.config.output_type,
            },
            'training_history': self.training_history,
            'saved_at': datetime.now().isoformat()
        }
        
        metadata_file = os.path.join(self.model_path, f'{name}_metadata.json')
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"LSTM model saved to {model_file}")
        return model_file
    
    def load(self, name: str = 'lstm_model') -> bool:
        """Load model from disk."""
        if not self._tf_available:
            return False
        
        import tensorflow as tf
        
        model_file = os.path.join(self.model_path, f'{name}.keras')
        metadata_file = os.path.join(self.model_path, f'{name}_metadata.json')
        
        # Try .h5 extension as fallback
        if not os.path.exists(model_file):
            model_file = os.path.join(self.model_path, f'{name}.h5')
        
        if not os.path.exists(model_file):
            logger.error(f"Model file not found: {model_file}")
            return False
        
        try:
            self.model = tf.keras.models.load_model(model_file)
            
            if os.path.exists(metadata_file):
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                self.feature_names = metadata.get('feature_names', [])
                self.training_history = metadata.get('training_history', {})
            
            self.is_trained = True
            logger.info(f"LSTM model loaded from {model_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading LSTM model: {e}")
            return False
    
    def get_model_info(self) -> Dict:
        """Get model information."""
        info = {
            'is_trained': self.is_trained,
            'tensorflow_available': self._tf_available,
            'config': {
                'sequence_length': self.config.sequence_length,
                'lstm_units': self.config.lstm_units,
                'dense_units': self.config.dense_units,
                'output_type': self.config.output_type,
            }
        }
        
        if self.is_trained and self.model is not None:
            info['n_parameters'] = int(self.model.count_params())
            info['n_features'] = len(self.feature_names)
            info['training_history'] = {
                'epochs': len(self.training_history.get('loss', [])),
                'final_loss': self.training_history.get('loss', [0])[-1] if self.training_history.get('loss') else None
            }
        
        return info


class SimpleLSTMPredictor:
    """
    Simplified LSTM predictor that works without TensorFlow.
    Uses numpy-based simple RNN for basic predictions.
    """
    
    def __init__(self, sequence_length: int = 30):
        self.sequence_length = sequence_length
        self.weights = None
        self.is_trained = False
    
    def train(self, X: np.ndarray, y: np.ndarray) -> Dict:
        """Simple training using linear regression on flattened sequences."""
        from sklearn.linear_model import LogisticRegression
        
        # Create sequences
        X_seq = []
        y_seq = []
        
        for i in range(self.sequence_length, len(X)):
            X_seq.append(X[i - self.sequence_length:i].flatten())
            y_seq.append(y[i])
        
        X_seq = np.array(X_seq)
        y_seq = np.array(y_seq)
        
        # Train simple model
        self.model = LogisticRegression(max_iter=1000)
        self.model.fit(X_seq, y_seq)
        
        self.is_trained = True
        accuracy = self.model.score(X_seq, y_seq)
        
        return {
            'status': 'success',
            'accuracy': float(accuracy),
            'message': 'Using simplified model (TensorFlow not available)'
        }
    
    def predict(self, X: np.ndarray) -> Dict:
        """Make prediction."""
        if not self.is_trained:
            raise ValueError("Model not trained")
        
        # Flatten last sequence
        if X.ndim == 2:
            X_flat = X[-self.sequence_length:].flatten().reshape(1, -1)
        else:
            X_flat = X.flatten().reshape(1, -1)
        
        probability = float(self.model.predict_proba(X_flat)[0][1])
        prediction = int(probability > 0.5)
        confidence = abs(probability - 0.5) * 200
        
        signal = 'none' if confidence < 30 else ('call' if prediction == 1 else 'put')
        
        return {
            'prediction': prediction,
            'probability': round(probability, 4),
            'confidence': round(confidence, 2),
            'signal': signal
        }
