"""
Professional Backtesting Engine
===============================
Complete backtesting system with realistic simulation and comprehensive metrics.
"""

import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import numpy as np
import pandas as pd

from .models import (
    BacktestConfig, BacktestResult, Trade, PerformanceMetrics,
    TradeDirection, TradeResult
)
from services.strategies import get_strategy, AVAILABLE_STRATEGIES
from services.strategies.base_strategy import SignalType

logger = logging.getLogger(__name__)


class BacktestEngine:
    """
    Professional backtesting engine for binary options strategies.
    
    Features:
    - Realistic trade simulation
    - Multiple strategy support
    - Comprehensive performance metrics
    - Equity curve tracking
    - Daily/Monthly P&L analysis
    - Risk management simulation
    """
    
    def __init__(self, config: BacktestConfig):
        self.config = config
        self.strategy = get_strategy(config.strategy_name)
        if config.strategy_params:
            self.strategy.params.update(config.strategy_params)
        
        self.trades: List[Trade] = []
        self.equity_curve: List[Dict] = []
        self.balance = config.initial_capital
        self.peak_balance = config.initial_capital
        self.current_drawdown = 0
        self.max_drawdown = 0
        
        # Daily tracking
        self.daily_pnl: Dict[str, Dict] = defaultdict(lambda: {
            'pnl': 0, 'trades': 0, 'wins': 0, 'losses': 0
        })
        
        # Martingale state
        self.martingale_step = 0
        self.last_trade_result: Optional[TradeResult] = None
        
        # Statistics
        self.total_signals = 0
        self.filtered_signals = 0
        
    def run(self, candles_data: Dict[str, List[Dict]]) -> BacktestResult:
        """
        Run backtest on provided candle data.
        
        Args:
            candles_data: Dictionary of asset -> list of candles
                         Each candle: {open, high, low, close, volume, timestamp}
        
        Returns:
            BacktestResult with complete analysis
        """
        start_time = time.time()
        
        logger.info(f"Starting backtest: {self.config.strategy_name}")
        logger.info(f"Initial capital: ${self.config.initial_capital}")
        
        # Initialize equity curve
        self.equity_curve.append({
            'timestamp': datetime.now().isoformat(),
            'balance': self.balance,
            'drawdown': 0
        })
        
        # Process each asset
        for asset in self.config.assets:
            if asset not in candles_data:
                logger.warning(f"No data for asset: {asset}")
                continue
            
            candles = candles_data[asset]
            self._process_asset(asset, candles)
        
        # Calculate final metrics
        metrics = self._calculate_metrics()
        
        # Build daily and monthly summaries
        daily_summary = self._build_daily_summary()
        monthly_summary = self._build_monthly_summary()
        
        execution_time = time.time() - start_time
        
        result = BacktestResult(
            config=self.config,
            metrics=metrics,
            trades=self.trades,
            equity_curve=self.equity_curve,
            daily_pnl=daily_summary,
            monthly_pnl=monthly_summary,
            strategy_signals=self.total_signals,
            filtered_signals=self.filtered_signals,
            execution_time_seconds=execution_time,
            start_balance=self.config.initial_capital,
            end_balance=self.balance
        )
        
        logger.info(f"Backtest completed in {execution_time:.2f}s")
        logger.info(f"Total trades: {len(self.trades)}, Final balance: ${self.balance:.2f}")
        
        return result
    
    def _process_asset(self, asset: str, candles: List[Dict]):
        """Process candles for a single asset."""
        min_candles = self.strategy.min_candles
        
        for i in range(min_candles, len(candles) - 1):
            # Get candles up to current point
            historical_candles = candles[max(0, i - 100):i + 1]
            
            # Check daily limits
            current_date = self._get_date_from_candle(candles[i])
            if not self._check_daily_limits(current_date):
                continue
            
            # Get strategy signal
            signal = self.strategy.analyze(historical_candles)
            self.total_signals += 1
            
            # Filter by confidence
            if signal.signal == SignalType.NONE:
                continue
            
            if signal.confidence < self.config.min_confidence:
                self.filtered_signals += 1
                continue
            
            # Simulate trade
            entry_candle = candles[i]
            exit_candle = candles[i + 1]  # Simplified: next candle is result
            
            self._execute_trade(
                asset=asset,
                signal=signal,
                entry_candle=entry_candle,
                exit_candle=exit_candle
            )
    
    def _execute_trade(self, asset: str, signal, entry_candle: Dict, exit_candle: Dict):
        """Execute a simulated trade."""
        # Calculate trade amount
        if self.config.use_martingale and self.last_trade_result == TradeResult.LOSS:
            if self.martingale_step < self.config.martingale_max_steps:
                trade_amount = self._get_base_amount() * (
                    self.config.martingale_multiplier ** self.martingale_step
                )
                self.martingale_step += 1
            else:
                trade_amount = self._get_base_amount()
                self.martingale_step = 0
        else:
            trade_amount = self._get_base_amount()
            self.martingale_step = 0
        
        # Ensure we have enough balance
        if trade_amount > self.balance:
            trade_amount = self.balance
        
        if trade_amount <= 0:
            return
        
        # Get prices
        entry_price = entry_candle.get('close', entry_candle.get('c', 0))
        exit_price = exit_candle.get('close', exit_candle.get('c', 0))
        
        # Determine trade result
        direction = TradeDirection.CALL if signal.signal == SignalType.CALL else TradeDirection.PUT
        
        if direction == TradeDirection.CALL:
            won = exit_price > entry_price
        else:
            won = exit_price < entry_price
        
        # Handle tie
        if exit_price == entry_price:
            result = TradeResult.TIE
            pnl = 0
        elif won:
            result = TradeResult.WIN
            pnl = trade_amount * self.config.payout_rate
        else:
            result = TradeResult.LOSS
            pnl = -trade_amount
        
        # Update balance
        self.balance += pnl
        self.last_trade_result = result
        
        # Update peak and drawdown
        if self.balance > self.peak_balance:
            self.peak_balance = self.balance
        
        self.current_drawdown = self.peak_balance - self.balance
        if self.current_drawdown > self.max_drawdown:
            self.max_drawdown = self.current_drawdown
        
        # Get timestamp
        timestamp = self._get_timestamp_from_candle(entry_candle)
        
        # Record trade
        trade = Trade(
            id=len(self.trades) + 1,
            timestamp=timestamp,
            asset=asset,
            direction=direction,
            amount=trade_amount,
            entry_price=entry_price,
            exit_price=exit_price,
            result=result,
            pnl=pnl,
            balance_after=self.balance,
            confidence=signal.confidence,
            strategy_name=self.config.strategy_name,
            indicators=signal.indicators,
            reasons=[r.condition for r in signal.reasons if r.met]
        )
        
        self.trades.append(trade)
        
        # Update equity curve
        self.equity_curve.append({
            'timestamp': timestamp.isoformat(),
            'balance': self.balance,
            'drawdown': self.current_drawdown,
            'trade_id': trade.id
        })
        
        # Update daily tracking
        date_str = timestamp.strftime('%Y-%m-%d')
        self.daily_pnl[date_str]['pnl'] += pnl
        self.daily_pnl[date_str]['trades'] += 1
        if result == TradeResult.WIN:
            self.daily_pnl[date_str]['wins'] += 1
        elif result == TradeResult.LOSS:
            self.daily_pnl[date_str]['losses'] += 1
    
    def _get_base_amount(self) -> float:
        """Get base trade amount."""
        if self.config.trade_amount_type == "percentage":
            return self.balance * (self.config.trade_amount / 100)
        return self.config.trade_amount
    
    def _check_daily_limits(self, date: str) -> bool:
        """Check if daily limits allow trading."""
        daily_data = self.daily_pnl[date]
        
        # Check max trades
        if daily_data['trades'] >= self.config.max_trades_per_day:
            return False
        
        # Check stop loss
        daily_loss_limit = self.config.initial_capital * self.config.stop_loss_daily
        if daily_data['pnl'] <= -daily_loss_limit:
            return False
        
        # Check take profit
        daily_profit_limit = self.config.initial_capital * self.config.take_profit_daily
        if daily_data['pnl'] >= daily_profit_limit:
            return False
        
        return True
    
    def _get_date_from_candle(self, candle: Dict) -> str:
        """Extract date string from candle."""
        ts = candle.get('timestamp', candle.get('from', candle.get('at', 0)))
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
        elif isinstance(ts, str):
            return ts[:10]
        return datetime.now().strftime('%Y-%m-%d')
    
    def _get_timestamp_from_candle(self, candle: Dict) -> datetime:
        """Extract datetime from candle."""
        ts = candle.get('timestamp', candle.get('from', candle.get('at', 0)))
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts)
        elif isinstance(ts, str):
            try:
                return datetime.fromisoformat(ts.replace('Z', '+00:00'))
            except:
                return datetime.now()
        return datetime.now()
    
    def _calculate_metrics(self) -> PerformanceMetrics:
        """Calculate comprehensive performance metrics."""
        metrics = PerformanceMetrics()
        
        if not self.trades:
            return metrics
        
        # Basic counts
        metrics.total_trades = len(self.trades)
        metrics.winning_trades = sum(1 for t in self.trades if t.result == TradeResult.WIN)
        metrics.losing_trades = sum(1 for t in self.trades if t.result == TradeResult.LOSS)
        metrics.tie_trades = sum(1 for t in self.trades if t.result == TradeResult.TIE)
        
        # Win rate
        if metrics.total_trades > 0:
            metrics.win_rate = (metrics.winning_trades / metrics.total_trades) * 100
        
        # P&L
        metrics.total_pnl = self.balance - self.config.initial_capital
        metrics.total_return = (metrics.total_pnl / self.config.initial_capital) * 100
        
        # Drawdown
        metrics.max_drawdown = self.max_drawdown
        if self.peak_balance > 0:
            metrics.max_drawdown_pct = (self.max_drawdown / self.peak_balance) * 100
        
        # Average P&L
        pnls = [t.pnl for t in self.trades]
        metrics.avg_trade_pnl = np.mean(pnls) if pnls else 0
        
        # Wins and losses averages
        wins = [t.pnl for t in self.trades if t.result == TradeResult.WIN]
        losses = [abs(t.pnl) for t in self.trades if t.result == TradeResult.LOSS]
        
        metrics.avg_win = np.mean(wins) if wins else 0
        metrics.avg_loss = np.mean(losses) if losses else 0
        metrics.largest_win = max(wins) if wins else 0
        metrics.largest_loss = max(losses) if losses else 0
        
        # Profit factor
        total_wins = sum(wins) if wins else 0
        total_losses = sum(losses) if losses else 1
        metrics.profit_factor = total_wins / total_losses if total_losses > 0 else 0
        
        # Expectancy
        if metrics.total_trades > 0:
            win_rate_decimal = metrics.win_rate / 100
            metrics.expectancy = (win_rate_decimal * metrics.avg_win) - ((1 - win_rate_decimal) * metrics.avg_loss)
        
        # Consecutive wins/losses
        metrics.max_consecutive_wins = self._calculate_max_consecutive(TradeResult.WIN)
        metrics.max_consecutive_losses = self._calculate_max_consecutive(TradeResult.LOSS)
        
        # Sharpe ratio (simplified, annualized)
        if len(pnls) > 1:
            returns = np.array(pnls) / self.config.trade_amount
            if np.std(returns) > 0:
                metrics.sharpe_ratio = (np.mean(returns) / np.std(returns)) * np.sqrt(252)
        
        # Sortino ratio (downside deviation only)
        negative_returns = [r for r in pnls if r < 0]
        if negative_returns:
            downside_std = np.std(negative_returns)
            if downside_std > 0:
                metrics.sortino_ratio = (np.mean(pnls) / downside_std) * np.sqrt(252)
        
        # Daily statistics
        daily_pnls = [d['pnl'] for d in self.daily_pnl.values()]
        if daily_pnls:
            metrics.best_day_pnl = max(daily_pnls)
            metrics.worst_day_pnl = min(daily_pnls)
            metrics.trades_per_day = metrics.total_trades / len(daily_pnls)
        
        # Recovery factor
        if metrics.max_drawdown > 0:
            metrics.recovery_factor = metrics.total_pnl / metrics.max_drawdown
        
        return metrics
    
    def _calculate_max_consecutive(self, result_type: TradeResult) -> int:
        """Calculate maximum consecutive wins or losses."""
        max_streak = 0
        current_streak = 0
        
        for trade in self.trades:
            if trade.result == result_type:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                current_streak = 0
        
        return max_streak
    
    def _build_daily_summary(self) -> List[Dict]:
        """Build daily P&L summary."""
        summary = []
        for date, data in sorted(self.daily_pnl.items()):
            total_trades = data['trades']
            win_rate = (data['wins'] / total_trades * 100) if total_trades > 0 else 0
            summary.append({
                'date': date,
                'pnl': round(data['pnl'], 2),
                'trades': total_trades,
                'wins': data['wins'],
                'losses': data['losses'],
                'win_rate': round(win_rate, 1)
            })
        return summary
    
    def _build_monthly_summary(self) -> List[Dict]:
        """Build monthly P&L summary."""
        monthly: Dict[str, Dict] = defaultdict(lambda: {
            'pnl': 0, 'trades': 0, 'wins': 0, 'losses': 0
        })
        
        for date, data in self.daily_pnl.items():
            month = date[:7]  # YYYY-MM
            monthly[month]['pnl'] += data['pnl']
            monthly[month]['trades'] += data['trades']
            monthly[month]['wins'] += data['wins']
            monthly[month]['losses'] += data['losses']
        
        summary = []
        for month, data in sorted(monthly.items()):
            total_trades = data['trades']
            win_rate = (data['wins'] / total_trades * 100) if total_trades > 0 else 0
            summary.append({
                'month': month,
                'pnl': round(data['pnl'], 2),
                'trades': total_trades,
                'wins': data['wins'],
                'losses': data['losses'],
                'win_rate': round(win_rate, 1)
            })
        return summary


def run_backtest(config_dict: Dict, candles_data: Dict[str, List[Dict]]) -> Dict:
    """
    Convenience function to run backtest from dictionary config.
    
    Args:
        config_dict: Configuration dictionary
        candles_data: Dictionary of asset -> candles list
    
    Returns:
        BacktestResult as dictionary
    """
    config = BacktestConfig(
        strategy_name=config_dict.get('strategy_name', 'ema_rsi'),
        strategy_params=config_dict.get('strategy_params', {}),
        initial_capital=config_dict.get('initial_capital', 10000),
        trade_amount=config_dict.get('trade_amount', 100),
        trade_amount_type=config_dict.get('trade_amount_type', 'fixed'),
        payout_rate=config_dict.get('payout_rate', 0.85),
        max_trades_per_day=config_dict.get('max_trades_per_day', 50),
        stop_loss_daily=config_dict.get('stop_loss_daily', 0.1),
        take_profit_daily=config_dict.get('take_profit_daily', 0.2),
        timeframe=config_dict.get('timeframe', '5m'),
        assets=config_dict.get('assets', ['EURUSD']),
        use_martingale=config_dict.get('use_martingale', False),
        martingale_multiplier=config_dict.get('martingale_multiplier', 2.0),
        martingale_max_steps=config_dict.get('martingale_max_steps', 3),
        min_confidence=config_dict.get('min_confidence', 60)
    )
    
    engine = BacktestEngine(config)
    result = engine.run(candles_data)
    return result.to_dict()
