"""
Database Models - Trading Bot
Modelos SQLAlchemy para persistencia completa del sistema de trading.
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, 
    Text, JSON, ForeignKey, Enum, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from .connection import Base
import enum
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class TradeResult(enum.Enum):
    WIN = "win"
    LOSS = "loss"
    BREAKEVEN = "breakeven"
    PENDING = "pending"
    CANCELLED = "cancelled"

class TradeDirection(enum.Enum):
    CALL = "call"
    PUT = "put"
    BUY = "buy"
    SELL = "sell"

class AccountType(enum.Enum):
    DEMO = "DEMO"
    REAL = "REAL"
    PRACTICE = "PRACTICE"

class RobotStatus(enum.Enum):
    INACTIVE = "inactive"
    ANALYZING = "analyzing"
    EXECUTING = "executing"
    WAITING = "waiting"
    ERROR = "error"
    SYNCING = "syncing"


class Trade(Base):
    """
    Modelo para almacenar el historial completo de operaciones.
    Incluye todos los campos requeridos para auditoría, análisis y ML.
    """
    __tablename__ = 'trades'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_id = Column(String(64), unique=True, default=generate_uuid, index=True)
    
    # Identificación temporal
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    opened_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    
    # Plataforma y cuenta
    platform = Column(String(32), nullable=False, default='iqoption')  # iqoption, mt5
    account_type = Column(String(16), nullable=False, default='DEMO')  # DEMO, REAL
    account_email = Column(String(128), nullable=True)
    
    # Activo y operación
    symbol = Column(String(32), nullable=False, index=True)
    direction = Column(String(8), nullable=False)  # call, put, buy, sell
    amount = Column(Float, nullable=False)
    expiration_minutes = Column(Integer, nullable=True)
    
    # Precios
    entry_price = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    strike_price = Column(Float, nullable=True)
    
    # Resultado
    result = Column(String(16), default='pending')  # win, loss, breakeven, pending
    profit_loss = Column(Float, default=0.0)
    payout_rate = Column(Float, nullable=True)
    
    # Estrategia y señal
    strategy_id = Column(Integer, ForeignKey('strategies.id'), nullable=True)
    strategy_name = Column(String(64), nullable=True)
    strategy_version = Column(String(32), nullable=True)
    signal_id = Column(String(64), ForeignKey('signals.signal_id'), nullable=True)
    
    # Indicadores utilizados (JSON con parámetros)
    indicators_used = Column(JSON, nullable=True)
    indicator_values = Column(JSON, nullable=True)
    
    # Condiciones de mercado
    market_condition_id = Column(Integer, ForeignKey('market_conditions.id'), nullable=True)
    market_trend = Column(String(16), nullable=True)  # bullish, bearish, sideways
    volatility = Column(Float, nullable=True)
    
    # Análisis y justificación
    confidence_level = Column(Float, nullable=True)  # 0-100
    technical_justification = Column(Text, nullable=True)
    robot_explanation = Column(Text, nullable=True)
    entry_reasons = Column(JSON, nullable=True)
    
    # Metadata
    timeframe = Column(String(8), nullable=True)  # 1m, 5m, 15m, 1h
    order_id_platform = Column(String(64), nullable=True)
    execution_mode = Column(String(16), default='manual')  # manual, automatic
    
    # Auditoría
    is_synced = Column(Boolean, default=False)
    sync_timestamp = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    
    # Relaciones
    strategy = relationship("Strategy", back_populates="trades")
    signal = relationship("Signal", back_populates="trades")
    market_condition = relationship("MarketCondition", back_populates="trades")
    
    __table_args__ = (
        Index('idx_trades_symbol_date', 'symbol', 'created_at'),
        Index('idx_trades_strategy_result', 'strategy_name', 'result'),
        Index('idx_trades_platform_account', 'platform', 'account_type'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'trade_id': self.trade_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'opened_at': self.opened_at.isoformat() if self.opened_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'platform': self.platform,
            'account_type': self.account_type,
            'symbol': self.symbol,
            'direction': self.direction,
            'amount': self.amount,
            'entry_price': self.entry_price,
            'exit_price': self.exit_price,
            'result': self.result,
            'profit_loss': self.profit_loss,
            'strategy_name': self.strategy_name,
            'strategy_version': self.strategy_version,
            'confidence_level': self.confidence_level,
            'technical_justification': self.technical_justification,
            'indicators_used': self.indicators_used,
            'indicator_values': self.indicator_values,
            'market_trend': self.market_trend,
            'timeframe': self.timeframe,
            'execution_mode': self.execution_mode,
        }


class Signal(Base):
    """
    Modelo para almacenar señales generadas por el robot.
    """
    __tablename__ = 'signals'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    signal_id = Column(String(64), unique=True, default=generate_uuid, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Señal
    symbol = Column(String(32), nullable=False, index=True)
    direction = Column(String(8), nullable=False)  # call, put
    confidence = Column(Float, nullable=False)  # 0-100
    
    # Estrategia
    strategy_id = Column(Integer, ForeignKey('strategies.id'), nullable=True)
    strategy_name = Column(String(64), nullable=True)
    
    # Indicadores y análisis
    indicators = Column(JSON, nullable=True)
    reasons = Column(JSON, nullable=True)
    technical_analysis = Column(Text, nullable=True)
    
    # ML Prediction
    ml_prediction = Column(Float, nullable=True)
    ml_model_version = Column(String(32), nullable=True)
    
    # Estado
    is_executed = Column(Boolean, default=False)
    executed_at = Column(DateTime, nullable=True)
    is_valid = Column(Boolean, default=True)
    expiry_time = Column(DateTime, nullable=True)
    
    # Resultado (post-ejecución)
    actual_result = Column(String(16), nullable=True)
    
    # Relaciones
    strategy = relationship("Strategy", back_populates="signals")
    trades = relationship("Trade", back_populates="signal")
    
    __table_args__ = (
        Index('idx_signals_symbol_date', 'symbol', 'created_at'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'signal_id': self.signal_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'symbol': self.symbol,
            'direction': self.direction,
            'confidence': self.confidence,
            'strategy_name': self.strategy_name,
            'indicators': self.indicators,
            'reasons': self.reasons,
            'ml_prediction': self.ml_prediction,
            'is_executed': self.is_executed,
            'actual_result': self.actual_result,
        }


class Strategy(Base):
    """
    Modelo para estrategias configurables y versionables.
    """
    __tablename__ = 'strategies'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Identificación
    name = Column(String(64), nullable=False, index=True)
    display_name = Column(String(128), nullable=True)
    description = Column(Text, nullable=True)
    
    # Versión y estado
    version = Column(String(32), default='1.0.0')
    is_active = Column(Boolean, default=True)
    is_visible = Column(Boolean, default=True)
    
    # Configuración de indicadores (JSON)
    indicators_config = Column(JSON, nullable=True)
    # Ejemplo:
    # {
    #   "ema": {"periods": [9, 21, 50], "timeframe": "5m"},
    #   "macd": {"fast": 12, "slow": 26, "signal": 9},
    #   "rsi": {"period": 14, "overbought": 70, "oversold": 30}
    # }
    
    # Reglas de entrada/salida (JSON)
    entry_rules = Column(JSON, nullable=True)
    exit_rules = Column(JSON, nullable=True)
    
    # Parámetros de riesgo
    min_confidence = Column(Float, default=60.0)
    max_risk_per_trade = Column(Float, default=2.0)
    
    # Timeframes permitidos
    allowed_timeframes = Column(JSON, default=['5m', '15m'])
    
    # Símbolos preferidos
    preferred_symbols = Column(JSON, nullable=True)
    
    # Métricas de rendimiento (actualizadas automáticamente)
    total_trades = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    win_rate = Column(Float, default=0.0)
    total_profit = Column(Float, default=0.0)
    avg_profit_per_trade = Column(Float, default=0.0)
    
    # Optimización ML
    is_ml_optimized = Column(Boolean, default=False)
    ml_score = Column(Float, nullable=True)
    last_optimized_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(64), default='system')
    
    # Relaciones
    trades = relationship("Trade", back_populates="strategy")
    signals = relationship("Signal", back_populates="strategy")
    versions = relationship("StrategyVersion", back_populates="strategy")
    
    __table_args__ = (
        UniqueConstraint('name', 'version', name='uq_strategy_name_version'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'description': self.description,
            'version': self.version,
            'is_active': self.is_active,
            'is_visible': self.is_visible,
            'indicators_config': self.indicators_config,
            'entry_rules': self.entry_rules,
            'exit_rules': self.exit_rules,
            'min_confidence': self.min_confidence,
            'allowed_timeframes': self.allowed_timeframes,
            'total_trades': self.total_trades,
            'win_rate': self.win_rate,
            'total_profit': self.total_profit,
            'is_ml_optimized': self.is_ml_optimized,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class StrategyVersion(Base):
    """
    Historial de versiones de estrategias para auditoría y rollback.
    """
    __tablename__ = 'strategy_versions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    strategy_id = Column(Integer, ForeignKey('strategies.id'), nullable=False)
    
    version = Column(String(32), nullable=False)
    config_snapshot = Column(JSON, nullable=False)  # Snapshot completo de la config
    
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(64), default='system')
    change_notes = Column(Text, nullable=True)
    
    # Métricas al momento de la versión
    metrics_snapshot = Column(JSON, nullable=True)
    
    strategy = relationship("Strategy", back_populates="versions")


class IndicatorConfig(Base):
    """
    Configuración de indicadores técnicos reutilizables.
    """
    __tablename__ = 'indicator_configs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    name = Column(String(32), nullable=False)  # ema, macd, rsi, bollinger, etc.
    display_name = Column(String(64), nullable=True)
    
    # Configuración específica del indicador
    parameters = Column(JSON, nullable=False)
    # Ejemplo EMA: {"period": 21}
    # Ejemplo MACD: {"fast": 12, "slow": 26, "signal": 9}
    # Ejemplo RSI: {"period": 14, "overbought": 70, "oversold": 30}
    
    # Uso
    is_active = Column(Boolean, default=True)
    used_for = Column(JSON, default=['entry', 'exit'])  # entry, exit, confirmation
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'parameters': self.parameters,
            'is_active': self.is_active,
            'used_for': self.used_for,
        }


class MarketCondition(Base):
    """
    Registro de condiciones de mercado al momento de cada operación.
    """
    __tablename__ = 'market_conditions'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    recorded_at = Column(DateTime, default=datetime.utcnow)
    symbol = Column(String(32), nullable=False)
    timeframe = Column(String(8), nullable=True)
    
    # Tendencia
    trend = Column(String(16), nullable=True)  # bullish, bearish, sideways
    trend_strength = Column(Float, nullable=True)  # 0-100
    
    # Volatilidad
    volatility = Column(Float, nullable=True)
    atr = Column(Float, nullable=True)
    
    # Momentum
    momentum = Column(Float, nullable=True)
    rsi = Column(Float, nullable=True)
    
    # Volumen
    volume_avg = Column(Float, nullable=True)
    volume_ratio = Column(Float, nullable=True)
    
    # Soporte/Resistencia
    support_level = Column(Float, nullable=True)
    resistance_level = Column(Float, nullable=True)
    
    # Datos adicionales
    extra_data = Column(JSON, nullable=True)
    
    trades = relationship("Trade", back_populates="market_condition")


class RobotConfig(Base):
    """
    Configuración persistente del robot de trading.
    """
    __tablename__ = 'robot_configs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    config_name = Column(String(64), unique=True, nullable=False, default='default')
    
    # Modo de operación
    mode = Column(String(16), default='manual')  # manual, automatic
    platform = Column(String(32), default='iqoption')
    account_type = Column(String(16), default='DEMO')
    
    # Símbolos activos
    active_symbols = Column(JSON, default=['EURUSD'])
    
    # Estrategias activas
    active_strategies = Column(JSON, default=['ema_rsi'])
    
    # Parámetros de trading
    default_amount = Column(Float, default=1.0)
    max_concurrent_trades = Column(Integer, default=3)
    analysis_interval_seconds = Column(Integer, default=30)
    
    # Risk management
    risk_level = Column(String(16), default='medium')  # low, medium, high
    max_daily_trades = Column(Integer, default=50)
    max_daily_loss = Column(Float, default=100.0)
    stop_on_loss_streak = Column(Integer, default=5)
    
    # Timeframes
    default_timeframe = Column(String(8), default='5m')
    allowed_timeframes = Column(JSON, default=['1m', '5m', '15m'])
    
    # Expiration
    default_expiration = Column(Integer, default=5)  # minutos
    
    # ML Settings
    use_ml_predictions = Column(Boolean, default=True)
    ml_min_confidence = Column(Float, default=65.0)
    
    # Estado
    is_active = Column(Boolean, default=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'config_name': self.config_name,
            'mode': self.mode,
            'platform': self.platform,
            'account_type': self.account_type,
            'active_symbols': self.active_symbols,
            'active_strategies': self.active_strategies,
            'default_amount': self.default_amount,
            'max_concurrent_trades': self.max_concurrent_trades,
            'analysis_interval_seconds': self.analysis_interval_seconds,
            'risk_level': self.risk_level,
            'max_daily_trades': self.max_daily_trades,
            'default_timeframe': self.default_timeframe,
            'use_ml_predictions': self.use_ml_predictions,
            'is_active': self.is_active,
        }


class PerformanceMetrics(Base):
    """
    Métricas de rendimiento agregadas para análisis y ML.
    """
    __tablename__ = 'performance_metrics'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Periodo
    period_type = Column(String(16), nullable=False)  # daily, weekly, monthly
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    
    # Filtros opcionales
    platform = Column(String(32), nullable=True)
    account_type = Column(String(16), nullable=True)
    symbol = Column(String(32), nullable=True)
    strategy_name = Column(String(64), nullable=True)
    
    # Métricas
    total_trades = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    breakeven_trades = Column(Integer, default=0)
    
    win_rate = Column(Float, default=0.0)
    profit_factor = Column(Float, default=0.0)
    
    gross_profit = Column(Float, default=0.0)
    gross_loss = Column(Float, default=0.0)
    net_profit = Column(Float, default=0.0)
    
    avg_win = Column(Float, default=0.0)
    avg_loss = Column(Float, default=0.0)
    largest_win = Column(Float, default=0.0)
    largest_loss = Column(Float, default=0.0)
    
    max_drawdown = Column(Float, default=0.0)
    max_consecutive_wins = Column(Integer, default=0)
    max_consecutive_losses = Column(Integer, default=0)
    
    # Timestamp
    calculated_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_metrics_period', 'period_type', 'period_start'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'period_type': self.period_type,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'win_rate': self.win_rate,
            'net_profit': self.net_profit,
            'profit_factor': self.profit_factor,
            'max_drawdown': self.max_drawdown,
        }


class MLAnalysis(Base):
    """
    Modelo para almacenar análisis de ML y del asistente de trading.
    Permite evaluar el rendimiento del robot y mejorar las predicciones.
    """
    __tablename__ = 'ml_analysis'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_id = Column(String(64), unique=True, default=generate_uuid, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Tipo de análisis
    analysis_type = Column(String(32), nullable=False)  # 'trade_feedback', 'strategy_analysis', 'market_insight', 'session_summary'
    
    # Contexto
    trade_id = Column(String(64), nullable=True, index=True)
    symbol = Column(String(32), nullable=True, index=True)
    strategy_name = Column(String(64), nullable=True)
    direction = Column(String(8), nullable=True)
    
    # Resultado de la operación analizada
    trade_result = Column(String(16), nullable=True)  # win, loss, pending
    trade_pnl = Column(Float, nullable=True)
    confidence_at_entry = Column(Float, nullable=True)
    
    # Análisis del asistente
    analysis_title = Column(String(256), nullable=True)
    analysis_content = Column(Text, nullable=True)
    feedback_type = Column(String(32), nullable=True)  # success, warning, info
    priority = Column(String(16), default='medium')
    
    # Razones y aprendizajes
    win_reasons = Column(JSON, nullable=True)
    loss_reasons = Column(JSON, nullable=True)
    improvement_suggestions = Column(JSON, nullable=True)
    lessons_learned = Column(JSON, nullable=True)
    
    # Indicadores al momento del análisis
    indicators_snapshot = Column(JSON, nullable=True)
    market_conditions = Column(JSON, nullable=True)
    
    # Métricas de estrategia al momento
    strategy_win_rate = Column(Float, nullable=True)
    strategy_total_trades = Column(Integer, nullable=True)
    strategy_pnl = Column(Float, nullable=True)
    
    # ML insights
    ml_prediction_correct = Column(Boolean, nullable=True)
    ml_confidence = Column(Float, nullable=True)
    pattern_detected = Column(String(128), nullable=True)
    
    __table_args__ = (
        Index('idx_ml_analysis_type_date', 'analysis_type', 'created_at'),
        Index('idx_ml_analysis_trade', 'trade_id'),
        Index('idx_ml_analysis_symbol_strategy', 'symbol', 'strategy_name'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'analysis_id': self.analysis_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'analysis_type': self.analysis_type,
            'trade_id': self.trade_id,
            'symbol': self.symbol,
            'strategy_name': self.strategy_name,
            'direction': self.direction,
            'trade_result': self.trade_result,
            'trade_pnl': self.trade_pnl,
            'confidence_at_entry': self.confidence_at_entry,
            'analysis_title': self.analysis_title,
            'analysis_content': self.analysis_content,
            'feedback_type': self.feedback_type,
            'priority': self.priority,
            'win_reasons': self.win_reasons,
            'loss_reasons': self.loss_reasons,
            'improvement_suggestions': self.improvement_suggestions,
            'lessons_learned': self.lessons_learned,
            'strategy_win_rate': self.strategy_win_rate,
            'ml_prediction_correct': self.ml_prediction_correct,
        }
