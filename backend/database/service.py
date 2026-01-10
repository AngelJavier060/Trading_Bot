"""
Database Service - Trading Bot
Servicio de alto nivel para gestión de datos del robot de trading.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import logging

from .repositories import (
    TradeRepository,
    SignalRepository,
    StrategyRepository,
    RobotConfigRepository,
    IndicatorConfigRepository,
    PerformanceRepository
)
from .connection import init_db, get_db_session

logger = logging.getLogger(__name__)


class TradingDatabaseService:
    """
    Servicio principal para operaciones de base de datos del robot de trading.
    Proporciona una interfaz unificada para todas las operaciones de datos.
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._init_db()
            TradingDatabaseService._initialized = True
    
    def _init_db(self):
        """Inicializar base de datos."""
        try:
            init_db()
            self._ensure_default_data()
            logger.info("TradingDatabaseService inicializado correctamente")
        except Exception as e:
            logger.error(f"Error inicializando TradingDatabaseService: {e}")
            raise
    
    def _ensure_default_data(self):
        """Asegurar que existen datos por defecto."""
        try:
            # Crear configuración por defecto si no existe
            config = RobotConfigRepository.get_by_name('default')
            if not config:
                RobotConfigRepository.create_or_update({
                    'mode': 'manual',
                    'platform': 'iqoption',
                    'account_type': 'DEMO',
                    'active_symbols': ['EURUSD', 'GBPUSD', 'USDJPY'],
                    'active_strategies': ['ema_rsi'],
                    'default_amount': 1.0,
                    'max_concurrent_trades': 3,
                    'analysis_interval_seconds': 30,
                    'risk_level': 'medium',
                    'max_daily_trades': 50,
                    'default_timeframe': '5m',
                    'use_ml_predictions': True,
                }, 'default')
                logger.info("Configuración por defecto creada")
            
            # Crear estrategias por defecto
            self._ensure_default_strategies()
            
            # Crear configuraciones de indicadores por defecto
            self._ensure_default_indicators()
            
        except Exception as e:
            logger.warning(f"Error creando datos por defecto: {e}")
    
    def _ensure_default_strategies(self):
        """Crear estrategias por defecto."""
        default_strategies = [
            {
                'name': 'ema_rsi',
                'display_name': 'EMA + RSI',
                'description': 'Estrategia basada en cruce de EMAs con confirmación RSI',
                'version': '1.0.0',
                'indicators_config': {
                    'ema': {'periods': [9, 21], 'timeframe': '5m'},
                    'rsi': {'period': 14, 'overbought': 70, 'oversold': 30}
                },
                'entry_rules': {
                    'ema_cross': True,
                    'rsi_confirmation': True,
                    'min_rsi_call': 30,
                    'max_rsi_put': 70
                },
                'min_confidence': 60.0,
                'allowed_timeframes': ['1m', '5m', '15m'],
            },
            {
                'name': 'macd',
                'display_name': 'MACD Strategy',
                'description': 'Estrategia basada en MACD con histograma',
                'version': '1.0.0',
                'indicators_config': {
                    'macd': {'fast': 12, 'slow': 26, 'signal': 9}
                },
                'entry_rules': {
                    'macd_cross': True,
                    'histogram_confirmation': True
                },
                'min_confidence': 55.0,
                'allowed_timeframes': ['5m', '15m', '1h'],
            },
            {
                'name': 'bollinger',
                'display_name': 'Bollinger Bands',
                'description': 'Estrategia de reversión a la media con Bandas de Bollinger',
                'version': '1.0.0',
                'indicators_config': {
                    'bollinger': {'period': 20, 'std_dev': 2.0}
                },
                'entry_rules': {
                    'touch_band': True,
                    'reversal_candle': True
                },
                'min_confidence': 60.0,
                'allowed_timeframes': ['5m', '15m'],
            },
            {
                'name': 'ichimoku',
                'display_name': 'Ichimoku Cloud',
                'description': 'Estrategia completa con Ichimoku Kinko Hyo',
                'version': '1.0.0',
                'indicators_config': {
                    'ichimoku': {
                        'tenkan': 9,
                        'kijun': 26,
                        'senkou_b': 52
                    }
                },
                'entry_rules': {
                    'price_vs_cloud': True,
                    'tk_cross': True
                },
                'min_confidence': 65.0,
                'allowed_timeframes': ['15m', '1h', '4h'],
            },
            {
                'name': 'multi_strategy',
                'display_name': 'Multi-Estrategia ML',
                'description': 'Combinación de múltiples indicadores optimizada por ML',
                'version': '1.0.0',
                'indicators_config': {
                    'ema': {'periods': [9, 21, 50]},
                    'rsi': {'period': 14},
                    'macd': {'fast': 12, 'slow': 26, 'signal': 9},
                    'bollinger': {'period': 20, 'std_dev': 2.0}
                },
                'entry_rules': {
                    'ml_decision': True,
                    'min_indicators_agree': 2
                },
                'min_confidence': 70.0,
                'is_ml_optimized': True,
                'allowed_timeframes': ['5m', '15m'],
            },
        ]
        
        for strategy_data in default_strategies:
            existing = StrategyRepository.get_by_name(strategy_data['name'])
            if not existing:
                StrategyRepository.create(strategy_data)
                logger.info(f"Estrategia '{strategy_data['name']}' creada")
    
    def _ensure_default_indicators(self):
        """Crear configuraciones de indicadores por defecto."""
        default_indicators = [
            {
                'name': 'ema',
                'display_name': 'EMA (9)',
                'parameters': {'period': 9},
                'used_for': ['entry', 'exit']
            },
            {
                'name': 'ema',
                'display_name': 'EMA (21)',
                'parameters': {'period': 21},
                'used_for': ['entry', 'exit']
            },
            {
                'name': 'ema',
                'display_name': 'EMA (50)',
                'parameters': {'period': 50},
                'used_for': ['confirmation']
            },
            {
                'name': 'ema',
                'display_name': 'EMA (200)',
                'parameters': {'period': 200},
                'used_for': ['trend']
            },
            {
                'name': 'rsi',
                'display_name': 'RSI (14)',
                'parameters': {'period': 14, 'overbought': 70, 'oversold': 30},
                'used_for': ['entry', 'confirmation']
            },
            {
                'name': 'macd',
                'display_name': 'MACD Standard',
                'parameters': {'fast': 12, 'slow': 26, 'signal': 9},
                'used_for': ['entry', 'exit']
            },
            {
                'name': 'bollinger',
                'display_name': 'Bollinger (20, 2)',
                'parameters': {'period': 20, 'std_dev': 2.0},
                'used_for': ['entry', 'exit']
            },
            {
                'name': 'atr',
                'display_name': 'ATR (14)',
                'parameters': {'period': 14},
                'used_for': ['risk']
            },
        ]
        
        existing = IndicatorConfigRepository.get_all(active_only=False)
        if not existing:
            for indicator_data in default_indicators:
                IndicatorConfigRepository.create(indicator_data)
            logger.info("Configuraciones de indicadores por defecto creadas")
    
    # ===== TRADES =====
    
    def record_trade(
        self,
        symbol: str,
        direction: str,
        amount: float,
        platform: str = 'iqoption',
        account_type: str = 'DEMO',
        strategy_name: str = None,
        signal_id: str = None,
        confidence: float = None,
        indicators: Dict = None,
        indicator_values: Dict = None,
        market_trend: str = None,
        technical_justification: str = None,
        entry_reasons: List[str] = None,
        timeframe: str = None,
        expiration_minutes: int = None,
        entry_price: float = None,
        execution_mode: str = 'manual',
        order_id_platform: str = None,
        account_email: str = None,
        **kwargs
    ) -> Dict:
        """
        Registrar una nueva operación en la base de datos.
        Este es el método principal para persistir trades.
        """
        trade_data = {
            'symbol': symbol,
            'direction': direction,
            'amount': amount,
            'platform': platform,
            'account_type': account_type,
            'strategy_name': strategy_name,
            'signal_id': signal_id,
            'confidence_level': confidence,
            'indicators_used': indicators,
            'indicator_values': indicator_values,
            'market_trend': market_trend,
            'technical_justification': technical_justification,
            'entry_reasons': entry_reasons,
            'timeframe': timeframe,
            'expiration_minutes': expiration_minutes,
            'entry_price': entry_price,
            'execution_mode': execution_mode,
            'order_id_platform': order_id_platform,
            'account_email': account_email,
            'opened_at': datetime.utcnow(),
        }
        
        # Agregar campos adicionales
        for key, value in kwargs.items():
            if key not in trade_data:
                trade_data[key] = value
        
        trade = TradeRepository.create(trade_data)
        logger.info(f"Trade registrado: {trade.get('trade_id')} - {symbol} {direction}")
        return trade
    
    def update_trade_result(
        self,
        trade_id: str,
        result: str,
        profit_loss: float,
        exit_price: float = None
    ) -> Optional[Dict]:
        """Actualizar resultado de un trade."""
        trade = TradeRepository.update_result(trade_id, result, profit_loss, exit_price)
        if trade:
            # Actualizar métricas de estrategia
            if trade.get('strategy_name'):
                StrategyRepository.update_metrics(trade['strategy_name'])
            logger.info(f"Trade actualizado: {trade_id} - {result} - P/L: {profit_loss}")
        return trade
    
    def get_trade_history(
        self,
        limit: int = 100,
        platform: str = None,
        account_type: str = None,
        symbol: str = None,
        strategy: str = None,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> List[Dict]:
        """Obtener historial de trades."""
        return TradeRepository.get_history(
            limit=limit,
            platform=platform,
            account_type=account_type,
            symbol=symbol,
            strategy_name=strategy,
            start_date=start_date,
            end_date=end_date
        )
    
    def get_trade_stats(
        self,
        platform: str = None,
        account_type: str = None,
        symbol: str = None,
        strategy: str = None,
        days: int = None
    ) -> Dict:
        """Obtener estadísticas de trading."""
        start_date = None
        if days:
            start_date = datetime.utcnow() - timedelta(days=days)
        
        return TradeRepository.get_stats(
            platform=platform,
            account_type=account_type,
            symbol=symbol,
            strategy_name=strategy,
            start_date=start_date
        )
    
    # ===== SIGNALS =====
    
    def record_signal(
        self,
        symbol: str,
        direction: str,
        confidence: float,
        strategy_name: str = None,
        indicators: Dict = None,
        reasons: List[str] = None,
        ml_prediction: float = None,
        technical_analysis: str = None
    ) -> Dict:
        """Registrar una nueva señal."""
        signal_data = {
            'symbol': symbol,
            'direction': direction,
            'confidence': confidence,
            'strategy_name': strategy_name,
            'indicators': indicators,
            'reasons': reasons,
            'ml_prediction': ml_prediction,
            'technical_analysis': technical_analysis,
        }
        
        signal = SignalRepository.create(signal_data)
        logger.info(f"Señal registrada: {signal.get('signal_id')} - {symbol} {direction} ({confidence}%)")
        return signal
    
    def mark_signal_executed(self, signal_id: str, result: str = None) -> Optional[Dict]:
        """Marcar señal como ejecutada."""
        return SignalRepository.mark_executed(signal_id, result)
    
    def get_recent_signals(self, limit: int = 50, symbol: str = None) -> List[Dict]:
        """Obtener señales recientes."""
        return SignalRepository.get_recent(limit, symbol)
    
    # ===== STRATEGIES =====
    
    def get_strategies(self, active_only: bool = True, visible_only: bool = False) -> List[Dict]:
        """Obtener lista de estrategias."""
        return StrategyRepository.get_all(active_only, visible_only)
    
    def get_strategy(self, name: str) -> Optional[Dict]:
        """Obtener estrategia por nombre."""
        return StrategyRepository.get_by_name(name)
    
    def create_strategy(self, strategy_data: Dict) -> Dict:
        """Crear nueva estrategia."""
        return StrategyRepository.create(strategy_data)
    
    def update_strategy(self, strategy_id: int, update_data: Dict, save_version: bool = True) -> Optional[Dict]:
        """Actualizar estrategia."""
        return StrategyRepository.update(strategy_id, update_data, save_version)
    
    def toggle_strategy(self, strategy_id: int, is_active: bool) -> Optional[Dict]:
        """Activar/desactivar estrategia."""
        return StrategyRepository.toggle_active(strategy_id, is_active)
    
    def get_top_strategies(self, limit: int = 5) -> List[Dict]:
        """Obtener estrategias con mejor rendimiento."""
        return StrategyRepository.get_top_performing(limit)
    
    # ===== CONFIG =====
    
    def get_robot_config(self, config_name: str = 'default') -> Optional[Dict]:
        """Obtener configuración del robot."""
        return RobotConfigRepository.get_by_name(config_name)
    
    def save_robot_config(self, config_data: Dict, config_name: str = 'default') -> Dict:
        """Guardar configuración del robot."""
        return RobotConfigRepository.create_or_update(config_data, config_name)
    
    def update_robot_config(self, update_data: Dict, config_name: str = 'default') -> Optional[Dict]:
        """Actualizar configuración del robot."""
        return RobotConfigRepository.update(config_name, update_data)
    
    # ===== INDICATORS =====
    
    def get_indicator_configs(self, indicator_name: str = None) -> List[Dict]:
        """Obtener configuraciones de indicadores."""
        if indicator_name:
            return IndicatorConfigRepository.get_by_name(indicator_name)
        return IndicatorConfigRepository.get_all()
    
    def create_indicator_config(self, indicator_data: Dict) -> Dict:
        """Crear configuración de indicador."""
        return IndicatorConfigRepository.create(indicator_data)
    
    def update_indicator_config(self, config_id: int, update_data: Dict) -> Optional[Dict]:
        """Actualizar configuración de indicador."""
        return IndicatorConfigRepository.update(config_id, update_data)
    
    # ===== PERFORMANCE / ML =====
    
    def get_daily_performance(self, date: datetime = None) -> Dict:
        """Obtener rendimiento diario."""
        return PerformanceRepository.calculate_daily_metrics(date)
    
    def get_trades_for_ml(self, limit: int = 10000, min_confidence: float = None) -> List[Dict]:
        """Obtener trades para entrenamiento ML."""
        return TradeRepository.get_for_ml_training(limit, min_confidence)
    
    def get_signal_accuracy(self, strategy_name: str = None) -> Dict:
        """Obtener precisión de señales."""
        return SignalRepository.get_accuracy_by_strategy(strategy_name)


# Singleton instance
trading_db = TradingDatabaseService()
