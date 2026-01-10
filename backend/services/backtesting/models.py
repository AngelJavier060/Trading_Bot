"""
Backtesting Data Models
=======================
Pydantic models for backtesting configuration and results.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum


class TradeDirection(Enum):
    CALL = "call"
    PUT = "put"


class TradeResult(Enum):
    WIN = "win"
    LOSS = "loss"
    TIE = "tie"


@dataclass
class BacktestConfig:
    """Configuration for backtesting."""
    strategy_name: str
    strategy_params: Dict = field(default_factory=dict)
    initial_capital: float = 10000.0
    trade_amount: float = 100.0
    trade_amount_type: str = "fixed"  # "fixed" or "percentage"
    payout_rate: float = 0.85  # 85% payout
    max_trades_per_day: int = 50
    stop_loss_daily: float = 0.1  # 10% of capital
    take_profit_daily: float = 0.2  # 20% of capital
    timeframe: str = "5m"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assets: List[str] = field(default_factory=lambda: ["EURUSD"])
    use_martingale: bool = False
    martingale_multiplier: float = 2.0
    martingale_max_steps: int = 3
    min_confidence: float = 60.0  # Minimum signal confidence to trade
    
    def to_dict(self) -> Dict:
        return {
            'strategy_name': self.strategy_name,
            'strategy_params': self.strategy_params,
            'initial_capital': self.initial_capital,
            'trade_amount': self.trade_amount,
            'trade_amount_type': self.trade_amount_type,
            'payout_rate': self.payout_rate,
            'max_trades_per_day': self.max_trades_per_day,
            'stop_loss_daily': self.stop_loss_daily,
            'take_profit_daily': self.take_profit_daily,
            'timeframe': self.timeframe,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'assets': self.assets,
            'use_martingale': self.use_martingale,
            'martingale_multiplier': self.martingale_multiplier,
            'martingale_max_steps': self.martingale_max_steps,
            'min_confidence': self.min_confidence,
        }


@dataclass
class Trade:
    """Represents a single trade."""
    id: int
    timestamp: datetime
    asset: str
    direction: TradeDirection
    amount: float
    entry_price: float
    exit_price: float
    result: TradeResult
    pnl: float
    balance_after: float
    confidence: float
    strategy_name: str
    indicators: Dict = field(default_factory=dict)
    reasons: List[str] = field(default_factory=list)
    duration_seconds: int = 300  # Default 5 minutes
    
    def to_dict(self) -> Dict:
        # Convert indicators to JSON-safe types
        safe_indicators = {}
        for k, v in self.indicators.items():
            if isinstance(v, bool):
                safe_indicators[k] = v
            elif hasattr(v, 'item'):  # numpy types
                safe_indicators[k] = v.item()
            elif isinstance(v, float):
                safe_indicators[k] = round(v, 5)
            else:
                safe_indicators[k] = v
        
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'asset': self.asset,
            'direction': self.direction.value,
            'amount': round(self.amount, 2),
            'entry_price': round(self.entry_price, 5),
            'exit_price': round(self.exit_price, 5),
            'result': self.result.value,
            'pnl': round(self.pnl, 2),
            'balance_after': round(self.balance_after, 2),
            'confidence': round(self.confidence, 1),
            'strategy_name': self.strategy_name,
            'indicators': safe_indicators,
            'reasons': self.reasons,
            'duration_seconds': self.duration_seconds,
        }


@dataclass
class PerformanceMetrics:
    """Performance metrics for backtesting results."""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    tie_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    total_return: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    avg_trade_pnl: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    max_consecutive_wins: int = 0
    max_consecutive_losses: int = 0
    avg_trade_duration: float = 0.0
    trades_per_day: float = 0.0
    best_day_pnl: float = 0.0
    worst_day_pnl: float = 0.0
    expectancy: float = 0.0
    recovery_factor: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'tie_trades': self.tie_trades,
            'win_rate': round(self.win_rate, 2),
            'total_pnl': round(self.total_pnl, 2),
            'total_return': round(self.total_return, 2),
            'max_drawdown': round(self.max_drawdown, 2),
            'max_drawdown_pct': round(self.max_drawdown_pct, 2),
            'profit_factor': round(self.profit_factor, 2),
            'sharpe_ratio': round(self.sharpe_ratio, 2),
            'sortino_ratio': round(self.sortino_ratio, 2),
            'avg_trade_pnl': round(self.avg_trade_pnl, 2),
            'avg_win': round(self.avg_win, 2),
            'avg_loss': round(self.avg_loss, 2),
            'largest_win': round(self.largest_win, 2),
            'largest_loss': round(self.largest_loss, 2),
            'max_consecutive_wins': self.max_consecutive_wins,
            'max_consecutive_losses': self.max_consecutive_losses,
            'avg_trade_duration': round(self.avg_trade_duration, 1),
            'trades_per_day': round(self.trades_per_day, 2),
            'best_day_pnl': round(self.best_day_pnl, 2),
            'worst_day_pnl': round(self.worst_day_pnl, 2),
            'expectancy': round(self.expectancy, 2),
            'recovery_factor': round(self.recovery_factor, 2),
        }


@dataclass
class BacktestResult:
    """Complete backtesting result."""
    config: BacktestConfig
    metrics: PerformanceMetrics
    trades: List[Trade]
    equity_curve: List[Dict]  # [{timestamp, balance, drawdown}]
    daily_pnl: List[Dict]  # [{date, pnl, trades, win_rate}]
    monthly_pnl: List[Dict]  # [{month, pnl, trades, win_rate}]
    strategy_signals: int = 0
    filtered_signals: int = 0
    execution_time_seconds: float = 0.0
    start_balance: float = 0.0
    end_balance: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            'config': self.config.to_dict(),
            'metrics': self.metrics.to_dict(),
            'trades': [t.to_dict() for t in self.trades],
            'equity_curve': self.equity_curve,
            'daily_pnl': self.daily_pnl,
            'monthly_pnl': self.monthly_pnl,
            'strategy_signals': self.strategy_signals,
            'filtered_signals': self.filtered_signals,
            'execution_time_seconds': round(self.execution_time_seconds, 2),
            'start_balance': round(self.start_balance, 2),
            'end_balance': round(self.end_balance, 2),
            'summary': self.generate_summary()
        }
    
    def generate_summary(self) -> str:
        """Generate a human-readable summary."""
        m = self.metrics
        return f"""
=== RESUMEN DE BACKTESTING ===
Estrategia: {self.config.strategy_name}
Período: {self.config.start_date} - {self.config.end_date}
Capital Inicial: ${self.start_balance:,.2f}
Capital Final: ${self.end_balance:,.2f}

📊 RENDIMIENTO:
  • Retorno Total: {m.total_return:+.2f}%
  • Profit/Loss: ${m.total_pnl:+,.2f}
  • Max Drawdown: {m.max_drawdown_pct:.2f}%
  • Factor de Recuperación: {m.recovery_factor:.2f}

📈 ESTADÍSTICAS DE TRADING:
  • Total Operaciones: {m.total_trades}
  • Operaciones Ganadoras: {m.winning_trades} ({m.win_rate:.1f}%)
  • Operaciones Perdedoras: {m.losing_trades}
  • Profit Factor: {m.profit_factor:.2f}
  • Expectativa: ${m.expectancy:.2f}

💰 ANÁLISIS DE GANANCIAS/PÉRDIDAS:
  • Ganancia Promedio: ${m.avg_win:.2f}
  • Pérdida Promedio: ${m.avg_loss:.2f}
  • Mayor Ganancia: ${m.largest_win:.2f}
  • Mayor Pérdida: ${m.largest_loss:.2f}

🔥 RACHAS:
  • Máx. Victorias Consecutivas: {m.max_consecutive_wins}
  • Máx. Pérdidas Consecutivas: {m.max_consecutive_losses}

📅 RENDIMIENTO DIARIO:
  • Mejor Día: ${m.best_day_pnl:+,.2f}
  • Peor Día: ${m.worst_day_pnl:+,.2f}
  • Operaciones/Día: {m.trades_per_day:.1f}
"""
