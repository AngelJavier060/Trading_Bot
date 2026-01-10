"""
Database Repositories - Trading Bot
Repositorios para operaciones CRUD con la base de datos.
"""

from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy import func, and_, or_, desc
from sqlalchemy.orm import Session
import logging

from .connection import get_db_session, session_scope
from .models import (
    Trade, Signal, Strategy, StrategyVersion,
    IndicatorConfig, MarketCondition, RobotConfig, PerformanceMetrics
)

logger = logging.getLogger(__name__)


class TradeRepository:
    """Repositorio para operaciones con trades."""
    
    @staticmethod
    def create(trade_data: Dict[str, Any]) -> Trade:
        """Crear un nuevo trade."""
        with session_scope() as session:
            trade = Trade(**trade_data)
            session.add(trade)
            session.flush()
            trade_id = trade.id
            trade_dict = trade.to_dict()
        return trade_dict
    
    @staticmethod
    def get_by_id(trade_id: int) -> Optional[Dict]:
        """Obtener trade por ID."""
        session = get_db_session()
        trade = session.query(Trade).filter(Trade.id == trade_id).first()
        return trade.to_dict() if trade else None
    
    @staticmethod
    def get_by_trade_id(trade_id: str) -> Optional[Dict]:
        """Obtener trade por trade_id único."""
        session = get_db_session()
        trade = session.query(Trade).filter(Trade.trade_id == trade_id).first()
        return trade.to_dict() if trade else None
    
    @staticmethod
    def update(trade_id: int, update_data: Dict[str, Any]) -> Optional[Dict]:
        """Actualizar un trade existente."""
        with session_scope() as session:
            trade = session.query(Trade).filter(Trade.id == trade_id).first()
            if trade:
                for key, value in update_data.items():
                    if hasattr(trade, key):
                        setattr(trade, key, value)
                session.flush()
                return trade.to_dict()
        return None
    
    @staticmethod
    def update_result(trade_id: str, result: str, profit_loss: float, exit_price: float = None) -> Optional[Dict]:
        """Actualizar resultado de un trade."""
        with session_scope() as session:
            trade = session.query(Trade).filter(Trade.trade_id == trade_id).first()
            if trade:
                trade.result = result
                trade.profit_loss = profit_loss
                trade.exit_price = exit_price
                trade.closed_at = datetime.utcnow()
                session.flush()
                return trade.to_dict()
        return None
    
    @staticmethod
    def get_history(
        limit: int = 100,
        offset: int = 0,
        platform: str = None,
        account_type: str = None,
        symbol: str = None,
        strategy_name: str = None,
        result: str = None,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> List[Dict]:
        """Obtener historial de trades con filtros."""
        session = get_db_session()
        query = session.query(Trade)
        
        if platform:
            query = query.filter(Trade.platform == platform)
        if account_type:
            query = query.filter(Trade.account_type == account_type)
        if symbol:
            query = query.filter(Trade.symbol == symbol)
        if strategy_name:
            query = query.filter(Trade.strategy_name == strategy_name)
        if result:
            query = query.filter(Trade.result == result)
        if start_date:
            query = query.filter(Trade.created_at >= start_date)
        if end_date:
            query = query.filter(Trade.created_at <= end_date)
        
        trades = query.order_by(desc(Trade.created_at)).offset(offset).limit(limit).all()
        return [t.to_dict() for t in trades]
    
    @staticmethod
    def get_stats(
        platform: str = None,
        account_type: str = None,
        symbol: str = None,
        strategy_name: str = None,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> Dict:
        """Obtener estadísticas agregadas de trades."""
        session = get_db_session()
        query = session.query(Trade)
        
        if platform:
            query = query.filter(Trade.platform == platform)
        if account_type:
            query = query.filter(Trade.account_type == account_type)
        if symbol:
            query = query.filter(Trade.symbol == symbol)
        if strategy_name:
            query = query.filter(Trade.strategy_name == strategy_name)
        if start_date:
            query = query.filter(Trade.created_at >= start_date)
        if end_date:
            query = query.filter(Trade.created_at <= end_date)
        
        total = query.count()
        wins = query.filter(Trade.result == 'win').count()
        losses = query.filter(Trade.result == 'loss').count()
        
        total_profit = session.query(func.sum(Trade.profit_loss)).filter(
            Trade.result == 'win'
        ).scalar() or 0
        
        total_loss = session.query(func.sum(Trade.profit_loss)).filter(
            Trade.result == 'loss'
        ).scalar() or 0
        
        return {
            'total_trades': total,
            'winning_trades': wins,
            'losing_trades': losses,
            'win_rate': (wins / total * 100) if total > 0 else 0,
            'total_profit': total_profit,
            'total_loss': abs(total_loss),
            'net_profit': total_profit + total_loss,
        }
    
    @staticmethod
    def get_for_ml_training(
        limit: int = 10000,
        min_confidence: float = None
    ) -> List[Dict]:
        """Obtener trades para entrenamiento de ML."""
        session = get_db_session()
        query = session.query(Trade).filter(
            Trade.result.in_(['win', 'loss'])
        )
        
        if min_confidence:
            query = query.filter(Trade.confidence_level >= min_confidence)
        
        trades = query.order_by(desc(Trade.created_at)).limit(limit).all()
        return [t.to_dict() for t in trades]


class SignalRepository:
    """Repositorio para operaciones con señales."""
    
    @staticmethod
    def create(signal_data: Dict[str, Any]) -> Dict:
        """Crear una nueva señal."""
        with session_scope() as session:
            signal = Signal(**signal_data)
            session.add(signal)
            session.flush()
            return signal.to_dict()
    
    @staticmethod
    def get_by_signal_id(signal_id: str) -> Optional[Dict]:
        """Obtener señal por ID único."""
        session = get_db_session()
        signal = session.query(Signal).filter(Signal.signal_id == signal_id).first()
        return signal.to_dict() if signal else None
    
    @staticmethod
    def mark_executed(signal_id: str, trade_result: str = None) -> Optional[Dict]:
        """Marcar señal como ejecutada."""
        with session_scope() as session:
            signal = session.query(Signal).filter(Signal.signal_id == signal_id).first()
            if signal:
                signal.is_executed = True
                signal.executed_at = datetime.utcnow()
                if trade_result:
                    signal.actual_result = trade_result
                session.flush()
                return signal.to_dict()
        return None
    
    @staticmethod
    def get_recent(limit: int = 50, symbol: str = None) -> List[Dict]:
        """Obtener señales recientes."""
        session = get_db_session()
        query = session.query(Signal)
        
        if symbol:
            query = query.filter(Signal.symbol == symbol)
        
        signals = query.order_by(desc(Signal.created_at)).limit(limit).all()
        return [s.to_dict() for s in signals]
    
    @staticmethod
    def get_accuracy_by_strategy(strategy_name: str = None) -> Dict:
        """Obtener precisión de señales por estrategia."""
        session = get_db_session()
        query = session.query(Signal).filter(Signal.is_executed == True)
        
        if strategy_name:
            query = query.filter(Signal.strategy_name == strategy_name)
        
        total = query.count()
        correct = query.filter(Signal.actual_result == 'win').count()
        
        return {
            'total_signals': total,
            'correct_signals': correct,
            'accuracy': (correct / total * 100) if total > 0 else 0,
        }


class StrategyRepository:
    """Repositorio para operaciones con estrategias."""
    
    @staticmethod
    def create(strategy_data: Dict[str, Any]) -> Dict:
        """Crear una nueva estrategia."""
        with session_scope() as session:
            strategy = Strategy(**strategy_data)
            session.add(strategy)
            session.flush()
            return strategy.to_dict()
    
    @staticmethod
    def get_all(active_only: bool = True, visible_only: bool = False) -> List[Dict]:
        """Obtener todas las estrategias."""
        session = get_db_session()
        query = session.query(Strategy)
        
        if active_only:
            query = query.filter(Strategy.is_active == True)
        if visible_only:
            query = query.filter(Strategy.is_visible == True)
        
        strategies = query.all()
        return [s.to_dict() for s in strategies]
    
    @staticmethod
    def get_by_name(name: str) -> Optional[Dict]:
        """Obtener estrategia por nombre."""
        session = get_db_session()
        strategy = session.query(Strategy).filter(Strategy.name == name).first()
        return strategy.to_dict() if strategy else None
    
    @staticmethod
    def get_by_id(strategy_id: int) -> Optional[Dict]:
        """Obtener estrategia por ID."""
        session = get_db_session()
        strategy = session.query(Strategy).filter(Strategy.id == strategy_id).first()
        return strategy.to_dict() if strategy else None
    
    @staticmethod
    def update(strategy_id: int, update_data: Dict[str, Any], save_version: bool = True) -> Optional[Dict]:
        """Actualizar estrategia con versionado opcional."""
        with session_scope() as session:
            strategy = session.query(Strategy).filter(Strategy.id == strategy_id).first()
            if strategy:
                # Guardar versión anterior
                if save_version:
                    version = StrategyVersion(
                        strategy_id=strategy.id,
                        version=strategy.version,
                        config_snapshot={
                            'indicators_config': strategy.indicators_config,
                            'entry_rules': strategy.entry_rules,
                            'exit_rules': strategy.exit_rules,
                            'min_confidence': strategy.min_confidence,
                        },
                        metrics_snapshot={
                            'total_trades': strategy.total_trades,
                            'win_rate': strategy.win_rate,
                            'total_profit': strategy.total_profit,
                        }
                    )
                    session.add(version)
                
                # Actualizar
                for key, value in update_data.items():
                    if hasattr(strategy, key):
                        setattr(strategy, key, value)
                
                session.flush()
                return strategy.to_dict()
        return None
    
    @staticmethod
    def update_metrics(strategy_name: str) -> Optional[Dict]:
        """Actualizar métricas de rendimiento de una estrategia."""
        with session_scope() as session:
            strategy = session.query(Strategy).filter(Strategy.name == strategy_name).first()
            if strategy:
                # Calcular métricas desde trades
                trades = session.query(Trade).filter(
                    Trade.strategy_name == strategy_name,
                    Trade.result.in_(['win', 'loss'])
                ).all()
                
                total = len(trades)
                wins = len([t for t in trades if t.result == 'win'])
                profit = sum(t.profit_loss for t in trades)
                
                strategy.total_trades = total
                strategy.winning_trades = wins
                strategy.losing_trades = total - wins
                strategy.win_rate = (wins / total * 100) if total > 0 else 0
                strategy.total_profit = profit
                strategy.avg_profit_per_trade = (profit / total) if total > 0 else 0
                
                session.flush()
                return strategy.to_dict()
        return None
    
    @staticmethod
    def toggle_active(strategy_id: int, is_active: bool) -> Optional[Dict]:
        """Activar/desactivar estrategia."""
        with session_scope() as session:
            strategy = session.query(Strategy).filter(Strategy.id == strategy_id).first()
            if strategy:
                strategy.is_active = is_active
                session.flush()
                return strategy.to_dict()
        return None
    
    @staticmethod
    def get_top_performing(limit: int = 5) -> List[Dict]:
        """Obtener estrategias con mejor rendimiento."""
        session = get_db_session()
        strategies = session.query(Strategy).filter(
            Strategy.total_trades >= 10,
            Strategy.is_active == True
        ).order_by(desc(Strategy.win_rate)).limit(limit).all()
        return [s.to_dict() for s in strategies]


class RobotConfigRepository:
    """Repositorio para configuración del robot."""
    
    @staticmethod
    def get_active() -> Optional[Dict]:
        """Obtener configuración activa."""
        session = get_db_session()
        config = session.query(RobotConfig).filter(
            RobotConfig.is_active == True
        ).first()
        return config.to_dict() if config else None
    
    @staticmethod
    def get_by_name(config_name: str = 'default') -> Optional[Dict]:
        """Obtener configuración por nombre."""
        session = get_db_session()
        config = session.query(RobotConfig).filter(
            RobotConfig.config_name == config_name
        ).first()
        return config.to_dict() if config else None
    
    @staticmethod
    def create_or_update(config_data: Dict[str, Any], config_name: str = 'default') -> Dict:
        """Crear o actualizar configuración."""
        with session_scope() as session:
            config = session.query(RobotConfig).filter(
                RobotConfig.config_name == config_name
            ).first()
            
            if config:
                for key, value in config_data.items():
                    if hasattr(config, key):
                        setattr(config, key, value)
            else:
                config_data['config_name'] = config_name
                config = RobotConfig(**config_data)
                session.add(config)
            
            session.flush()
            return config.to_dict()
    
    @staticmethod
    def update(config_name: str, update_data: Dict[str, Any]) -> Optional[Dict]:
        """Actualizar configuración específica."""
        with session_scope() as session:
            config = session.query(RobotConfig).filter(
                RobotConfig.config_name == config_name
            ).first()
            if config:
                for key, value in update_data.items():
                    if hasattr(config, key):
                        setattr(config, key, value)
                session.flush()
                return config.to_dict()
        return None


class IndicatorConfigRepository:
    """Repositorio para configuración de indicadores."""
    
    @staticmethod
    def get_all(active_only: bool = True) -> List[Dict]:
        """Obtener todas las configuraciones de indicadores."""
        session = get_db_session()
        query = session.query(IndicatorConfig)
        
        if active_only:
            query = query.filter(IndicatorConfig.is_active == True)
        
        configs = query.all()
        return [c.to_dict() for c in configs]
    
    @staticmethod
    def get_by_name(name: str) -> List[Dict]:
        """Obtener configuraciones de un indicador específico."""
        session = get_db_session()
        configs = session.query(IndicatorConfig).filter(
            IndicatorConfig.name == name
        ).all()
        return [c.to_dict() for c in configs]
    
    @staticmethod
    def create(indicator_data: Dict[str, Any]) -> Dict:
        """Crear configuración de indicador."""
        with session_scope() as session:
            config = IndicatorConfig(**indicator_data)
            session.add(config)
            session.flush()
            return config.to_dict()
    
    @staticmethod
    def update(config_id: int, update_data: Dict[str, Any]) -> Optional[Dict]:
        """Actualizar configuración de indicador."""
        with session_scope() as session:
            config = session.query(IndicatorConfig).filter(
                IndicatorConfig.id == config_id
            ).first()
            if config:
                for key, value in update_data.items():
                    if hasattr(config, key):
                        setattr(config, key, value)
                session.flush()
                return config.to_dict()
        return None


class PerformanceRepository:
    """Repositorio para métricas de rendimiento."""
    
    @staticmethod
    def calculate_daily_metrics(date: datetime = None) -> Dict:
        """Calcular métricas diarias."""
        if date is None:
            date = datetime.utcnow().date()
        
        start = datetime.combine(date, datetime.min.time())
        end = datetime.combine(date, datetime.max.time())
        
        session = get_db_session()
        trades = session.query(Trade).filter(
            Trade.created_at >= start,
            Trade.created_at <= end,
            Trade.result.in_(['win', 'loss'])
        ).all()
        
        total = len(trades)
        wins = len([t for t in trades if t.result == 'win'])
        losses = len([t for t in trades if t.result == 'loss'])
        
        gross_profit = sum(t.profit_loss for t in trades if t.profit_loss > 0)
        gross_loss = sum(t.profit_loss for t in trades if t.profit_loss < 0)
        
        return {
            'date': date.isoformat(),
            'total_trades': total,
            'winning_trades': wins,
            'losing_trades': losses,
            'win_rate': (wins / total * 100) if total > 0 else 0,
            'gross_profit': gross_profit,
            'gross_loss': abs(gross_loss),
            'net_profit': gross_profit + gross_loss,
        }
    
    @staticmethod
    def save_metrics(metrics_data: Dict[str, Any]) -> Dict:
        """Guardar métricas de rendimiento."""
        with session_scope() as session:
            metrics = PerformanceMetrics(**metrics_data)
            session.add(metrics)
            session.flush()
            return metrics.to_dict()
    
    @staticmethod
    def get_metrics_history(
        period_type: str = 'daily',
        limit: int = 30
    ) -> List[Dict]:
        """Obtener historial de métricas."""
        session = get_db_session()
        metrics = session.query(PerformanceMetrics).filter(
            PerformanceMetrics.period_type == period_type
        ).order_by(desc(PerformanceMetrics.period_start)).limit(limit).all()
        return [m.to_dict() for m in metrics]
