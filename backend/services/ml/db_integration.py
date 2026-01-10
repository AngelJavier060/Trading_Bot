"""
ML Database Integration
========================
Integration between ML service and trading database for:
- Loading historical trades for training
- Pattern analysis from trade history
- Strategy performance optimization
- Automated learning from results
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Import database service
try:
    from database.service import trading_db
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    logger.warning("Database service not available for ML integration")


class MLDatabaseIntegration:
    """
    Integration layer between ML models and trading database.
    
    Responsibilities:
    - Extract training data from historical trades
    - Analyze patterns in winning/losing trades
    - Optimize strategy parameters based on results
    - Track ML model performance over time
    """
    
    def __init__(self):
        self.db_available = DB_AVAILABLE
    
    def get_training_data_from_history(
        self,
        min_trades: int = 100,
        days_back: int = 90,
        symbol: str = None,
        strategy: str = None
    ) -> Optional[pd.DataFrame]:
        """
        Extract training data from historical trades.
        
        Returns DataFrame with features extracted from trade history:
        - Indicator values at entry
        - Market conditions
        - Trade results (labels)
        """
        if not self.db_available:
            logger.warning("Database not available for training data extraction")
            return None
        
        try:
            start_date = datetime.utcnow() - timedelta(days=days_back)
            
            trades = trading_db.get_trade_history(
                limit=10000,
                symbol=symbol,
                strategy=strategy,
                start_date=start_date
            )
            
            if len(trades) < min_trades:
                logger.warning(f"Insufficient trades for training: {len(trades)} < {min_trades}")
                return None
            
            # Convert to DataFrame
            df = pd.DataFrame(trades)
            
            # Filter only completed trades
            df = df[df['result'].isin(['win', 'loss'])]
            
            if len(df) < min_trades:
                logger.warning(f"Insufficient completed trades: {len(df)}")
                return None
            
            # Create target variable
            df['target'] = (df['result'] == 'win').astype(int)
            
            # Extract features from indicator_values if available
            feature_cols = []
            
            if 'indicator_values' in df.columns:
                indicator_df = df['indicator_values'].apply(
                    lambda x: pd.Series(x) if isinstance(x, dict) else pd.Series()
                )
                df = pd.concat([df, indicator_df], axis=1)
                feature_cols.extend(indicator_df.columns.tolist())
            
            # Add confidence as feature
            if 'confidence_level' in df.columns:
                feature_cols.append('confidence_level')
            
            # Add time-based features
            df['hour'] = pd.to_datetime(df['created_at']).dt.hour
            df['day_of_week'] = pd.to_datetime(df['created_at']).dt.dayofweek
            feature_cols.extend(['hour', 'day_of_week'])
            
            # Add direction encoding
            df['direction_encoded'] = (df['direction'] == 'call').astype(int)
            feature_cols.append('direction_encoded')
            
            logger.info(f"Extracted {len(df)} trades with {len(feature_cols)} features")
            
            return df[feature_cols + ['target', 'symbol', 'strategy_name', 'result', 'profit_loss']]
            
        except Exception as e:
            logger.error(f"Error extracting training data: {e}")
            return None
    
    def analyze_winning_patterns(
        self,
        symbol: str = None,
        strategy: str = None,
        min_trades: int = 50
    ) -> Dict[str, Any]:
        """
        Analyze patterns in winning trades vs losing trades.
        
        Returns insights about:
        - Best performing timeframes
        - Optimal confidence thresholds
        - Indicator value ranges for wins
        - Time-of-day patterns
        """
        if not self.db_available:
            return {'error': 'Database not available'}
        
        try:
            trades = trading_db.get_trade_history(
                limit=5000,
                symbol=symbol,
                strategy=strategy
            )
            
            if len(trades) < min_trades:
                return {'error': f'Insufficient trades: {len(trades)}'}
            
            df = pd.DataFrame(trades)
            df = df[df['result'].isin(['win', 'loss'])]
            
            wins = df[df['result'] == 'win']
            losses = df[df['result'] == 'loss']
            
            analysis = {
                'total_trades': len(df),
                'wins': len(wins),
                'losses': len(losses),
                'win_rate': len(wins) / len(df) * 100 if len(df) > 0 else 0,
            }
            
            # Confidence analysis
            if 'confidence_level' in df.columns:
                df['confidence_level'] = pd.to_numeric(df['confidence_level'], errors='coerce')
                analysis['confidence'] = {
                    'avg_winning': wins['confidence_level'].mean(),
                    'avg_losing': losses['confidence_level'].mean(),
                    'optimal_threshold': self._find_optimal_confidence(df),
                }
            
            # Timeframe analysis
            if 'timeframe' in df.columns:
                timeframe_stats = df.groupby('timeframe').apply(
                    lambda x: len(x[x['result'] == 'win']) / len(x) * 100 if len(x) > 0 else 0
                ).to_dict()
                analysis['timeframe_performance'] = timeframe_stats
            
            # Time of day analysis
            df['hour'] = pd.to_datetime(df['created_at']).dt.hour
            hour_stats = df.groupby('hour').apply(
                lambda x: len(x[x['result'] == 'win']) / len(x) * 100 if len(x) > 0 else 0
            ).to_dict()
            analysis['hour_performance'] = hour_stats
            
            # Strategy analysis
            if 'strategy_name' in df.columns:
                strategy_stats = df.groupby('strategy_name').agg({
                    'result': lambda x: (x == 'win').sum() / len(x) * 100,
                    'profit_loss': 'sum'
                }).to_dict('index')
                analysis['strategy_performance'] = strategy_stats
            
            # Direction analysis
            if 'direction' in df.columns:
                call_df = df[df['direction'] == 'call']
                put_df = df[df['direction'] == 'put']
                analysis['direction_performance'] = {
                    'call_win_rate': len(call_df[call_df['result'] == 'win']) / len(call_df) * 100 if len(call_df) > 0 else 0,
                    'put_win_rate': len(put_df[put_df['result'] == 'win']) / len(put_df) * 100 if len(put_df) > 0 else 0,
                }
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing patterns: {e}")
            return {'error': str(e)}
    
    def _find_optimal_confidence(self, df: pd.DataFrame) -> float:
        """Find the optimal confidence threshold that maximizes win rate."""
        best_threshold = 60
        best_win_rate = 0
        
        for threshold in range(50, 95, 5):
            filtered = df[df['confidence_level'] >= threshold]
            if len(filtered) >= 20:
                win_rate = len(filtered[filtered['result'] == 'win']) / len(filtered) * 100
                if win_rate > best_win_rate:
                    best_win_rate = win_rate
                    best_threshold = threshold
        
        return best_threshold
    
    def get_strategy_optimization_suggestions(
        self,
        strategy_name: str,
        min_trades: int = 30
    ) -> Dict[str, Any]:
        """
        Analyze a strategy's performance and suggest optimizations.
        """
        if not self.db_available:
            return {'error': 'Database not available'}
        
        try:
            trades = trading_db.get_trade_history(
                limit=1000,
                strategy=strategy_name
            )
            
            if len(trades) < min_trades:
                return {
                    'status': 'insufficient_data',
                    'trades_found': len(trades),
                    'min_required': min_trades
                }
            
            df = pd.DataFrame(trades)
            df = df[df['result'].isin(['win', 'loss'])]
            
            suggestions = {
                'strategy': strategy_name,
                'trades_analyzed': len(df),
                'current_win_rate': len(df[df['result'] == 'win']) / len(df) * 100,
                'suggestions': []
            }
            
            # Analyze confidence levels
            if 'confidence_level' in df.columns:
                df['confidence_level'] = pd.to_numeric(df['confidence_level'], errors='coerce')
                optimal_conf = self._find_optimal_confidence(df)
                current_avg = df['confidence_level'].mean()
                
                if optimal_conf > current_avg:
                    suggestions['suggestions'].append({
                        'type': 'confidence_threshold',
                        'message': f'Aumentar umbral de confianza mínimo a {optimal_conf}%',
                        'current': current_avg,
                        'suggested': optimal_conf
                    })
            
            # Analyze time patterns
            df['hour'] = pd.to_datetime(df['created_at']).dt.hour
            hour_perf = df.groupby('hour').apply(
                lambda x: len(x[x['result'] == 'win']) / len(x) * 100 if len(x) > 5 else None
            ).dropna()
            
            if len(hour_perf) > 0:
                best_hours = hour_perf[hour_perf > hour_perf.mean() + 5].index.tolist()
                worst_hours = hour_perf[hour_perf < hour_perf.mean() - 10].index.tolist()
                
                if best_hours:
                    suggestions['suggestions'].append({
                        'type': 'best_hours',
                        'message': f'Mejores horas para operar: {best_hours}',
                        'hours': best_hours
                    })
                
                if worst_hours:
                    suggestions['suggestions'].append({
                        'type': 'avoid_hours',
                        'message': f'Evitar operar en horas: {worst_hours}',
                        'hours': worst_hours
                    })
            
            # Analyze symbols
            if 'symbol' in df.columns:
                symbol_perf = df.groupby('symbol').apply(
                    lambda x: len(x[x['result'] == 'win']) / len(x) * 100 if len(x) > 10 else None
                ).dropna()
                
                if len(symbol_perf) > 1:
                    best_symbols = symbol_perf[symbol_perf > 55].index.tolist()
                    if best_symbols:
                        suggestions['suggestions'].append({
                            'type': 'best_symbols',
                            'message': f'Símbolos con mejor rendimiento: {best_symbols}',
                            'symbols': best_symbols
                        })
            
            return suggestions
            
        except Exception as e:
            logger.error(f"Error generating suggestions: {e}")
            return {'error': str(e)}
    
    def record_ml_prediction(
        self,
        signal_id: str,
        prediction: float,
        model_version: str,
        features_used: Dict = None
    ) -> bool:
        """Record an ML prediction for later analysis."""
        if not self.db_available:
            return False
        
        try:
            trading_db.record_signal(
                symbol='ML_PREDICTION',
                direction='call' if prediction > 0.5 else 'put',
                confidence=prediction * 100,
                strategy_name='ml_model',
                ml_prediction=prediction,
                indicators=features_used
            )
            return True
        except Exception as e:
            logger.error(f"Error recording ML prediction: {e}")
            return False
    
    def get_ml_model_performance(self, days_back: int = 30) -> Dict[str, Any]:
        """Get performance metrics for ML-based predictions."""
        if not self.db_available:
            return {'error': 'Database not available'}
        
        try:
            start_date = datetime.utcnow() - timedelta(days=days_back)
            
            # Get ML-based trades
            trades = trading_db.get_trade_history(
                limit=1000,
                strategy='ml_model',
                start_date=start_date
            )
            
            if not trades:
                return {
                    'status': 'no_data',
                    'message': 'No ML-based trades found'
                }
            
            df = pd.DataFrame(trades)
            df = df[df['result'].isin(['win', 'loss'])]
            
            if len(df) == 0:
                return {
                    'status': 'no_completed_trades',
                    'pending_trades': len(trades)
                }
            
            return {
                'status': 'success',
                'total_trades': len(df),
                'wins': len(df[df['result'] == 'win']),
                'losses': len(df[df['result'] == 'loss']),
                'win_rate': len(df[df['result'] == 'win']) / len(df) * 100,
                'total_profit': df['profit_loss'].sum(),
                'avg_profit': df['profit_loss'].mean(),
            }
            
        except Exception as e:
            logger.error(f"Error getting ML performance: {e}")
            return {'error': str(e)}


# Singleton instance
ml_db_integration = MLDatabaseIntegration()
