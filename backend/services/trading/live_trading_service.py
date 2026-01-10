"""
Live Trading Service
====================
Real-time trading service with XAI explanations and learning from losses.
"""

import time
import json
import os
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from threading import Thread, Event
from collections import deque
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class TradeExecution:
    """Represents a trade execution with XAI explanation."""
    id: str
    timestamp: datetime
    platform: str  # 'iqoption' or 'mt5'
    account_type: str  # 'demo' or 'real'
    symbol: str
    direction: str  # 'call' or 'put'
    amount: float
    entry_price: float
    exit_price: Optional[float] = None
    result: Optional[str] = None  # 'win', 'loss', 'pending'
    pnl: float = 0.0
    confidence: float = 0.0
    strategy_used: str = ""
    ml_prediction: Optional[Dict] = None
    indicators: Dict = field(default_factory=dict)
    reasons: List[str] = field(default_factory=list)
    explanation: str = ""
    duration_seconds: int = 300
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'platform': self.platform,
            'account_type': self.account_type,
            'symbol': self.symbol,
            'direction': self.direction,
            'amount': self.amount,
            'entry_price': self.entry_price,
            'exit_price': self.exit_price,
            'result': self.result,
            'pnl': self.pnl,
            'confidence': self.confidence,
            'strategy_used': self.strategy_used,
            'ml_prediction': self.ml_prediction,
            'indicators': self.indicators,
            'reasons': self.reasons,
            'explanation': self.explanation,
            'duration_seconds': self.duration_seconds
        }


@dataclass
class BotStatus:
    """Current bot status."""
    is_running: bool = False
    is_scanning: bool = False
    platform: str = ""
    account_type: str = ""
    balance: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    total_pnl: float = 0.0
    current_symbol: str = ""
    last_signal: Optional[Dict] = None
    last_trade: Optional[Dict] = None
    active_trades: List[Dict] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    started_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict:
        return {
            'is_running': self.is_running,
            'is_scanning': self.is_scanning,
            'platform': self.platform,
            'account_type': self.account_type,
            'balance': self.balance,
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'win_rate': (self.winning_trades / self.total_trades * 100) if self.total_trades > 0 else 0,
            'total_pnl': self.total_pnl,
            'current_symbol': self.current_symbol,
            'last_signal': self.last_signal,
            'last_trade': self.last_trade,
            'active_trades': self.active_trades,
            'errors': self.errors[-5:],  # Last 5 errors
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'uptime_seconds': (datetime.now() - self.started_at).total_seconds() if self.started_at else 0
        }


class LiveTradingService:
    """
    Live trading service with real-time monitoring and XAI.
    
    Features:
    - Real-time bot status
    - Trade execution with explanations
    - Historical trade storage
    - Learning from losses
    """
    
    def __init__(self):
        self.status = BotStatus()
        self.trade_history: List[TradeExecution] = []
        self.signal_log: deque = deque(maxlen=100)
        self.loss_patterns: List[Dict] = []
        
        self._stop_event = Event()
        self._scan_thread: Optional[Thread] = None
        
        # Paths
        self.data_dir = os.path.join('data', 'trades')
        self.history_file = os.path.join(self.data_dir, 'trade_history.json')
        self.losses_file = os.path.join(self.data_dir, 'loss_patterns.json')
        os.makedirs(self.data_dir, exist_ok=True)
        
        # Load history
        self._load_history()
    
    def start_bot(self, platform: str, account_type: str, config: Dict) -> Dict:
        """Start the trading bot."""
        if self.status.is_running:
            return {'status': 'error', 'message': 'Bot already running'}
        
        self.status.is_running = True
        self.status.platform = platform
        self.status.account_type = account_type
        self.status.started_at = datetime.now()
        self.status.errors = []
        
        logger.info(f"Bot started: {platform} ({account_type})")
        
        return {
            'status': 'success',
            'message': f'Bot started on {platform} ({account_type})',
            'bot_status': self.status.to_dict()
        }
    
    def stop_bot(self) -> Dict:
        """Stop the trading bot."""
        self._stop_event.set()
        self.status.is_running = False
        self.status.is_scanning = False
        
        # Save history
        self._save_history()
        
        logger.info("Bot stopped")
        
        return {
            'status': 'success',
            'message': 'Bot stopped',
            'bot_status': self.status.to_dict()
        }
    
    def get_status(self) -> Dict:
        """Get current bot status."""
        return self.status.to_dict()
    
    def record_signal(self, signal: Dict) -> None:
        """Record a signal for logging."""
        signal['timestamp'] = datetime.now().isoformat()
        self.signal_log.append(signal)
        self.status.last_signal = signal
        self.status.current_symbol = signal.get('symbol', '')
    
    def execute_trade(
        self,
        platform: str,
        account_type: str,
        symbol: str,
        direction: str,
        amount: float,
        entry_price: float,
        confidence: float,
        strategy_used: str,
        indicators: Dict,
        reasons: List[str],
        ml_prediction: Optional[Dict] = None
    ) -> TradeExecution:
        """
        Execute and record a trade with full XAI explanation.
        """
        trade_id = f"T{int(time.time() * 1000)}"
        
        # Generate explanation
        explanation = self._generate_explanation(
            direction, confidence, strategy_used, indicators, reasons, ml_prediction
        )
        
        trade = TradeExecution(
            id=trade_id,
            timestamp=datetime.now(),
            platform=platform,
            account_type=account_type,
            symbol=symbol,
            direction=direction,
            amount=amount,
            entry_price=entry_price,
            result='pending',
            confidence=confidence,
            strategy_used=strategy_used,
            ml_prediction=ml_prediction,
            indicators=indicators,
            reasons=reasons,
            explanation=explanation
        )
        
        # Add to active trades
        self.status.active_trades.append(trade.to_dict())
        self.status.last_trade = trade.to_dict()
        self.status.total_trades += 1
        
        # Add to history
        self.trade_history.append(trade)
        
        logger.info(f"Trade executed: {trade_id} - {symbol} {direction} @ {entry_price}")
        
        return trade
    
    def complete_trade(
        self,
        trade_id: str,
        exit_price: float,
        result: str,
        pnl: float
    ) -> Dict:
        """Complete a pending trade with result."""
        # Find trade in history
        trade = None
        for t in self.trade_history:
            if t.id == trade_id:
                trade = t
                break
        
        if not trade:
            return {'status': 'error', 'message': f'Trade not found: {trade_id}'}
        
        # Update trade
        trade.exit_price = exit_price
        trade.result = result
        trade.pnl = pnl
        
        # Update status
        if result == 'win':
            self.status.winning_trades += 1
        elif result == 'loss':
            self.status.losing_trades += 1
            # Learn from loss
            self._learn_from_loss(trade)
        
        self.status.total_pnl += pnl
        
        # Remove from active trades
        self.status.active_trades = [
            t for t in self.status.active_trades if t['id'] != trade_id
        ]
        
        # Save history
        self._save_history()
        
        logger.info(f"Trade completed: {trade_id} - {result} (PnL: {pnl})")
        
        return {
            'status': 'success',
            'trade': trade.to_dict()
        }
    
    def get_trade_history(self, limit: int = 50, account_type: Optional[str] = None) -> List[Dict]:
        """Get trade history with optional filtering."""
        history = self.trade_history
        
        if account_type:
            history = [t for t in history if t.account_type == account_type]
        
        return [t.to_dict() for t in history[-limit:]]
    
    def get_signal_log(self, limit: int = 20) -> List[Dict]:
        """Get recent signals."""
        return list(self.signal_log)[-limit:]
    
    def get_loss_patterns(self) -> List[Dict]:
        """Get learned loss patterns for improvement."""
        return self.loss_patterns
    
    def _generate_explanation(
        self,
        direction: str,
        confidence: float,
        strategy: str,
        indicators: Dict,
        reasons: List[str],
        ml_prediction: Optional[Dict]
    ) -> str:
        """Generate human-readable trade explanation."""
        dir_text = "COMPRA (CALL)" if direction == 'call' else "VENTA (PUT)"
        
        explanation = f"""
🎯 OPERACIÓN: {dir_text}
📊 Confianza: {confidence:.1f}%
📈 Estrategia: {strategy}

📋 RAZONES DE LA DECISIÓN:
"""
        for i, reason in enumerate(reasons[:5], 1):
            explanation += f"  {i}. {reason}\n"
        
        explanation += "\n📉 INDICADORES CLAVE:\n"
        for key, value in list(indicators.items())[:6]:
            if isinstance(value, float):
                explanation += f"  • {key}: {value:.4f}\n"
            else:
                explanation += f"  • {key}: {value}\n"
        
        if ml_prediction:
            explanation += f"\n🤖 PREDICCIÓN ML:\n"
            explanation += f"  • Señal: {ml_prediction.get('signal', 'N/A')}\n"
            explanation += f"  • Probabilidad: {ml_prediction.get('probability', 0):.2%}\n"
        
        return explanation
    
    def _learn_from_loss(self, trade: TradeExecution) -> None:
        """Analyze and learn from a losing trade."""
        pattern = {
            'trade_id': trade.id,
            'timestamp': trade.timestamp.isoformat(),
            'symbol': trade.symbol,
            'direction': trade.direction,
            'confidence': trade.confidence,
            'strategy': trade.strategy_used,
            'indicators': trade.indicators,
            'reasons': trade.reasons,
            'entry_price': trade.entry_price,
            'exit_price': trade.exit_price,
            'pnl': trade.pnl,
            'analysis': self._analyze_loss(trade)
        }
        
        self.loss_patterns.append(pattern)
        
        # Keep only last 100 loss patterns
        if len(self.loss_patterns) > 100:
            self.loss_patterns = self.loss_patterns[-100:]
        
        # Save loss patterns
        self._save_loss_patterns()
        
        logger.info(f"Learned from loss: {trade.id}")
    
    def _analyze_loss(self, trade: TradeExecution) -> Dict:
        """Analyze why a trade failed."""
        analysis = {
            'possible_causes': [],
            'recommendations': []
        }
        
        # Low confidence trades
        if trade.confidence < 60:
            analysis['possible_causes'].append(
                f"Confianza baja ({trade.confidence:.1f}%) - señal débil"
            )
            analysis['recommendations'].append(
                "Aumentar umbral de confianza mínima"
            )
        
        # Check indicators
        indicators = trade.indicators
        
        # RSI analysis
        if 'rsi' in indicators or 'rsi_14' in indicators:
            rsi = indicators.get('rsi') or indicators.get('rsi_14', 50)
            if trade.direction == 'call' and rsi > 70:
                analysis['possible_causes'].append(
                    f"RSI sobrecomprado ({rsi:.1f}) para operación CALL"
                )
            elif trade.direction == 'put' and rsi < 30:
                analysis['possible_causes'].append(
                    f"RSI sobrevendido ({rsi:.1f}) para operación PUT"
                )
        
        # Trend analysis
        if 'ema_trend' in indicators:
            trend = indicators['ema_trend']
            if trade.direction == 'call' and trend == 'bearish':
                analysis['possible_causes'].append(
                    "Operación CALL contra tendencia bajista"
                )
                analysis['recommendations'].append(
                    "Evitar operaciones contra la tendencia principal"
                )
        
        if not analysis['possible_causes']:
            analysis['possible_causes'].append(
                "Volatilidad del mercado o movimiento inesperado"
            )
            analysis['recommendations'].append(
                "Considerar usar stop-loss más ajustados"
            )
        
        return analysis
    
    def _load_history(self) -> None:
        """Load trade history from file."""
        try:
            if os.path.exists(self.history_file):
                with open(self.history_file, 'r') as f:
                    data = json.load(f)
                    for item in data:
                        item['timestamp'] = datetime.fromisoformat(item['timestamp'])
                        self.trade_history.append(TradeExecution(**item))
                logger.info(f"Loaded {len(self.trade_history)} trades from history")
        except Exception as e:
            logger.error(f"Error loading history: {e}")
    
    def _save_history(self) -> None:
        """Save trade history to file."""
        try:
            data = [t.to_dict() for t in self.trade_history[-500:]]  # Keep last 500
            with open(self.history_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving history: {e}")
    
    def _save_loss_patterns(self) -> None:
        """Save loss patterns to file."""
        try:
            with open(self.losses_file, 'w') as f:
                json.dump(self.loss_patterns, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving loss patterns: {e}")
    
    def should_avoid_trade(self, indicators: Dict, direction: str, symbol: str) -> Optional[str]:
        """
        Check if trade should be avoided based on learned patterns.
        Returns reason to avoid or None if trade is OK.
        """
        # Check recent losses for similar patterns
        recent_losses = [p for p in self.loss_patterns[-20:] if p['symbol'] == symbol]
        
        similar_count = 0
        for loss in recent_losses:
            if loss['direction'] == direction:
                # Check indicator similarity
                loss_indicators = loss.get('indicators', {})
                similarity = self._calculate_similarity(indicators, loss_indicators)
                if similarity > 0.7:
                    similar_count += 1
        
        if similar_count >= 3:
            return f"Patrón similar a {similar_count} pérdidas recientes en {symbol}"
        
        return None
    
    def _calculate_similarity(self, ind1: Dict, ind2: Dict) -> float:
        """Calculate similarity between two indicator sets."""
        if not ind1 or not ind2:
            return 0.0
        
        common_keys = set(ind1.keys()) & set(ind2.keys())
        if not common_keys:
            return 0.0
        
        matches = 0
        for key in common_keys:
            v1, v2 = ind1[key], ind2[key]
            if isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
                if abs(v1 - v2) < abs(v1) * 0.1:  # Within 10%
                    matches += 1
            elif v1 == v2:
                matches += 1
        
        return matches / len(common_keys)


# Singleton instance
live_trading_service = LiveTradingService()
