"""
Live Trading Service
====================
Real-time trading service with XAI explanations and learning from losses.
"""

import time
import json
import os
import logging
from services.data import unified_data_service
from services.trading_service import trading_service
from services.ml.ml_service import ml_service
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from threading import Thread, Event
from collections import deque
import pandas as pd
from database.repositories import TradeRepository

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
    external_id: Optional[str] = None
    expiration_minutes: int = 5
    expiration_time: Optional[str] = None
    
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
            'duration_seconds': self.duration_seconds,
            'external_id': self.external_id,
            'expiration_minutes': self.expiration_minutes,
            'expiration_time': self.expiration_time
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
        # Helper to ensure JSON-serializable values
        def safe_json(obj):
            if obj is None:
                return None
            if isinstance(obj, bool):
                return bool(obj)
            if isinstance(obj, (int, float)):
                return float(obj) if isinstance(obj, float) else int(obj)
            if isinstance(obj, str):
                return str(obj)
            if isinstance(obj, dict):
                return {str(k): safe_json(v) for k, v in obj.items()}
            if isinstance(obj, (list, tuple)):
                return [safe_json(v) for v in obj]
            if hasattr(obj, 'isoformat'):
                return obj.isoformat()
            # numpy types
            if hasattr(obj, 'item'):
                return obj.item()
            return str(obj)
        
        # Ensure all values are JSON-serializable
        return {
            'is_running': bool(self.is_running),
            'is_scanning': bool(self.is_scanning),
            'platform': str(self.platform) if self.platform else "",
            'account_type': str(self.account_type) if self.account_type else "",
            'balance': float(self.balance) if self.balance else 0.0,
            'total_trades': int(self.total_trades),
            'winning_trades': int(self.winning_trades),
            'losing_trades': int(self.losing_trades),
            'win_rate': float((self.winning_trades / self.total_trades * 100) if self.total_trades > 0 else 0),
            'total_pnl': float(self.total_pnl) if self.total_pnl else 0.0,
            'current_symbol': str(self.current_symbol) if self.current_symbol else "",
            'last_signal': safe_json(self.last_signal),
            'last_trade': safe_json(self.last_trade),
            'active_trades': safe_json(self.active_trades),
            'errors': [str(e) for e in self.errors[-5:]],
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'uptime_seconds': float((datetime.now() - self.started_at).total_seconds()) if self.started_at else 0
        }


class LiveTradingService:
    """
    Live trading service with real-time monitoring and XAI.
    
    Features:
    - Real-time bot status
    - Trade execution with explanations
    - Historical trade storage
    - Learning from losses
    - Automatic multi-symbol scanning
    """
    
    def __init__(self):
        self.status = BotStatus()
        self.trade_history: List[TradeExecution] = []
        self.signal_log: deque = deque(maxlen=100)
        self.loss_patterns: List[Dict] = []
        self.pending_settlements: List[Dict] = []
        
        self._stop_event = Event()
        self._scan_thread: Optional[Thread] = None
        
        # Trading configuration
        self.config: Dict = {}
        self.symbols: List[str] = []
        self.strategies: List[str] = ['ema_rsi']
        self.trading_mode: str = 'manual'  # 'auto' or 'manual'
        self.min_confidence: float = 60.0
        self.trade_amount: float = 10.0
        # ML controls
        self.ml_enabled: bool = True
        self.ml_weight: float = 0.3
        self.ml_min_probability: float = 0.55
        
        # Paths
        self.data_dir = os.path.join('data', 'trades')
        self.history_file = os.path.join(self.data_dir, 'trade_history.json')
        self.losses_file = os.path.join(self.data_dir, 'loss_patterns.json')
        os.makedirs(self.data_dir, exist_ok=True)
        
        # Load history
        self._load_history()
    
    def start_bot(self, platform: str, account_type: str, config: Dict) -> Dict:
        """Start the trading bot with background scanning."""
        if self.status.is_running:
            # Reset and restart
            self._stop_event.set()
            time.sleep(0.5)
            self._stop_event.clear()
        
        # Update configuration
        self.config = config
        self.symbols = config.get('symbols', ['EURUSD', 'GBPUSD', 'USDJPY'])
        self.strategies = config.get('strategies', ['ema_rsi'])
        self.trading_mode = config.get('mode', 'manual')
        self.min_confidence = float(config.get('min_confidence', 60))
        self.trade_amount = float(config.get('amount', 10))
        # ML settings
        self.ml_enabled = bool(config.get('use_ml', True))
        self.ml_weight = float(config.get('ml_weight', 0.3))
        self.ml_min_probability = float(config.get('ml_min_probability', 0.55))
        
        # VALIDATION: Check connection before starting if in auto mode
        if self.trading_mode == 'auto':
            if platform == 'iqoption':
                iq = trading_service.get_iq_option()
                if not iq:
                    logger.error("Intento de iniciar Auto-Trading sin conexión a IQ Option")
                    return {
                        'status': 'error',
                        'message': '❌ ERROR CRÍTICO: No conectado a IQ Option. Conecte la plataforma primero antes de activar modo automático.',
                        'bot_status': self.status.to_dict()
                    }
            elif platform == 'mt5':
                mt5 = trading_service.get_mt5()
                if not mt5:
                     return {
                        'status': 'error',
                        'message': '❌ ERROR CRÍTICO: No conectado a MetaTrader 5. Conecte la plataforma primero.',
                        'bot_status': self.status.to_dict()
                    }

        self.status.is_running = True
        self.status.platform = platform
        self.status.account_type = account_type
        self.status.started_at = datetime.now()
        self.status.errors = []
        
        # Update balance from connected platform
        self._update_balance()
        
        # Start background scanning thread
        self._stop_event.clear()
        self._scan_thread = Thread(target=self._trading_loop, daemon=True)
        self._scan_thread.start()
        
        logger.info(f"Bot started: {platform} ({account_type}) - Scanning {len(self.symbols)} symbols")
        
        return {
            'status': 'success',
            'message': f'Bot started on {platform} ({account_type}) - Scanning {len(self.symbols)} symbols',
            'bot_status': self.status.to_dict()
        }
    
    def stop_bot(self) -> Dict:
        """Stop the trading bot."""
        self._stop_event.set()
        self.status.is_running = False
        self.status.is_scanning = False
        
        # Save history
        self._save_history()
        # NO desconectar automáticamente la plataforma: si hay operaciones pendientes,
        # cortar la sesión rompe la sincronización (no se puede consultar check_win_v4).
        
        logger.info("Bot stopped")
        
        return {
            'status': 'success',
            'message': 'Bot stopped',
            'bot_status': self.status.to_dict()
        }
    
    def get_status(self) -> Dict:
        """Get current bot status."""
        try:
            # Importante: permitir que trades manuales se cierren aunque el bot no esté corriendo.
            self._settle_due_trades()
        except Exception:
            pass
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
        # Normalizar account_type a los valores esperados en DB (DEMO/REAL)
        account_type_norm = str(account_type or '').upper()
        if account_type_norm in ['PRACTICE', 'DEMO', 'DEMO\r', 'DEMO\n', 'PRACTICE\r', 'PRACTICE\n']:
            account_type_norm = 'DEMO'
        elif account_type_norm in ['REAL']:
            account_type_norm = 'REAL'
        else:
            account_type_norm = account_type_norm or 'DEMO'

        trade_id = f"T{int(time.time() * 1000)}"
        
        # Generate explanation
        explanation = self._generate_explanation(
            direction, confidence, strategy_used, indicators, reasons, ml_prediction
        )
        
        expiration_minutes = int(self.config.get('expiration', 5))
        duration_seconds = expiration_minutes * 60
        expiration_time = (datetime.now() + timedelta(seconds=duration_seconds)).isoformat()
        trade = TradeExecution(
            id=trade_id,
            timestamp=datetime.now(),
            platform=platform,
            account_type=account_type_norm,
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
            explanation=explanation,
            duration_seconds=duration_seconds,
            expiration_minutes=expiration_minutes,
            expiration_time=expiration_time
        )
        
        # Add to active trades
        self.status.active_trades.append(trade.to_dict())
        self.status.last_trade = trade.to_dict()
        self.status.total_trades += 1
        
        # Add to history
        self.trade_history.append(trade)
        # Persist to DB
        try:
            TradeRepository.create({
                'trade_id': trade.id,
                'opened_at': trade.timestamp,
                'platform': platform,
                'account_type': account_type_norm,
                'symbol': symbol,
                'direction': direction,
                'amount': amount,
                'expiration_minutes': expiration_minutes,
                'entry_price': entry_price,
                'exit_price': None,
                'result': 'pending',
                'profit_loss': 0.0,
                'strategy_name': strategy_used,
                'confidence_level': confidence,
                'indicator_values': indicators,
                'entry_reasons': reasons,
                'robot_explanation': explanation,
                'execution_mode': self.trading_mode,
                'timeframe': '5m',
                'order_id_platform': None,
                'is_synced': False,
                'sync_timestamp': None,
            })
        except Exception as db_err:
            logger.warning(f"DB create trade failed: {db_err}")
        # Schedule settlement
        self.pending_settlements.append({
            'id': trade_id,
            'symbol': symbol,
            'settle_at': trade.timestamp + timedelta(seconds=trade.duration_seconds)
        })
        
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
        # Persist result to DB
        try:
            TradeRepository.update_result(trade_id, result, pnl, exit_price)
        except Exception as db_err:
            logger.warning(f"DB update trade failed: {db_err}")
        
        logger.info(f"Trade completed: {trade_id} - {result} (PnL: {pnl})")
        
        return {
            'status': 'success',
            'trade': trade.to_dict()
        }
    
    def get_trade_history(self, limit: int = 50, account_type: Optional[str] = None) -> List[Dict]:
        """Get trade history with optional filtering."""
        try:
            rows = TradeRepository.get_history(limit=limit, account_type=account_type)
            return [self._map_db_trade_public(r) for r in rows]
        except Exception:
            history = self.trade_history
            if account_type:
                history = [t for t in history if t.account_type == account_type]
            return [t.to_dict() for t in history[-limit:]]

    def get_trade_history_filtered(self, *, limit: int = 200, account_type: Optional[str] = None,
                                   date_from: Optional[datetime] = None, date_to: Optional[datetime] = None,
                                   symbol: Optional[str] = None, result: Optional[str] = None,
                                   min_conf: Optional[float] = None, max_conf: Optional[float] = None,
                                   platform: Optional[str] = None, strategy: Optional[str] = None) -> List[Dict]:
        """Get filtered trade history."""
        db_error = None
        try:
            rows = TradeRepository.get_history(
                limit=limit,
                platform=platform,
                account_type=account_type,
                symbol=symbol,
                strategy_name=strategy,
                result=result,
                start_date=date_from,
                end_date=date_to,
            )
            # Apply confidence filters if provided
            if min_conf is not None:
                rows = [r for r in rows if (r.get('confidence_level') or 0) >= min_conf]
            if max_conf is not None:
                rows = [r for r in rows if (r.get('confidence_level') or 0) <= max_conf]
            logger.info(f"DB returned {len(rows)} trades (limit={limit}, from={date_from}, to={date_to})")
            return [self._map_db_trade_public(r) for r in rows]
        except Exception as e:
            db_error = e
            logger.warning(f"DB query failed, using fallback: {e}")
        
        # Fallback to in-memory history if DB unavailable
        logger.info(f"Using in-memory fallback. Total trades in memory: {len(self.trade_history)}")
        items = list(self.trade_history)  # Create a copy to avoid mutation
        
        if account_type:
            items = [t for t in items if t.account_type == account_type]
        if date_from:
            # Handle timezone-naive comparison
            df_naive = date_from.replace(tzinfo=None) if hasattr(date_from, 'tzinfo') and date_from.tzinfo else date_from
            items = [t for t in items if t.timestamp.replace(tzinfo=None) >= df_naive]
        if date_to:
            dt_naive = date_to.replace(tzinfo=None) if hasattr(date_to, 'tzinfo') and date_to.tzinfo else date_to
            items = [t for t in items if t.timestamp.replace(tzinfo=None) <= dt_naive]
        if symbol:
            items = [t for t in items if t.symbol == symbol]
        if result:
            items = [t for t in items if t.result == result]
        if min_conf is not None:
            items = [t for t in items if (t.confidence or 0) >= min_conf]
        if max_conf is not None:
            items = [t for t in items if (t.confidence or 0) <= max_conf]
        if platform:
            items = [t for t in items if t.platform == platform]
        if strategy:
            items = [t for t in items if t.strategy_used == strategy]
        
        # Sort by timestamp descending and limit
        items = sorted(items, key=lambda x: x.timestamp, reverse=True)[:limit]
        logger.info(f"Fallback returning {len(items)} trades after filtering")
        return [t.to_dict() for t in items]

    def _map_db_trade_public(self, r: Dict) -> Dict:
        """Map DB trade row (Trade.to_dict()) to public API shape expected by frontend."""
        # Prefer opened_at as trade timestamp; fallback to created_at
        ts = r.get('opened_at') or r.get('created_at')
        # Normalize keys used by frontend
        return {
            'id': r.get('trade_id') or str(r.get('id')),
            'timestamp': ts,
            'platform': r.get('platform'),
            'account_type': r.get('account_type'),
            'symbol': r.get('symbol'),
            'direction': r.get('direction'),
            'amount': r.get('amount'),
            'entry_price': r.get('entry_price'),
            'exit_price': r.get('exit_price'),
            'result': r.get('result'),
            'pnl': r.get('profit_loss'),
            'confidence': r.get('confidence_level'),
            'strategy_used': r.get('strategy_name'),
        }

    def _settle_due_trades(self) -> None:
        """Settle trades whose duration has elapsed using real broker data if possible."""
        try:
            now = datetime.now()
            due = [p for p in self.pending_settlements if p['settle_at'] <= now]
            if not due:
                return
            remaining = [p for p in self.pending_settlements if p['settle_at'] > now]
            self.pending_settlements = remaining
            
            # Obtener instancia de IQ una vez
            iq = trading_service.get_iq_option()
            
            for p in due:
                trade_id = p['id']
                symbol = p['symbol']
                # Find the trade
                trade_obj = None
                for t in self.trade_history:
                    if t.id == trade_id:
                        trade_obj = t
                        break
                if not trade_obj:
                    continue
                
                exit_price = 0.0
                pnl = 0.0
                result = 'loss'
                
                # Intentar verificar resultado real con IQ Option
                checked_with_broker = False
                ext_id = getattr(trade_obj, 'external_id', None)
                if iq and iq.check_connect() and ext_id:
                    try:
                        # Verificar resultado de opción binaria
                        # Nota: check_win_v3/v4 requiere el ID de la orden
                        win_val = iq.check_win_v4(int(ext_id))
                        # La librería puede devolver float/int (profit) o tupla/list
                        if isinstance(win_val, (tuple, list)):
                            win_val = win_val[0] if win_val else 0
                        if isinstance(win_val, (int, float)):
                            pnl = float(win_val)
                            # Si devuelve 0 en loss, forzamos pérdida de inversión
                            if pnl <= 0:
                                result = 'loss'
                                pnl = -float(trade_obj.amount)
                            else:
                                result = 'win'
                            checked_with_broker = True
                            logger.info(f"Resultado verificado con IQ Option: {result} PnL: {pnl}")
                    except Exception as e:
                        logger.warning(f"No se pudo verificar resultado con IQ Option para {trade_id}: {e}")

                if not checked_with_broker:
                    # Fallback a simulación de precio si no se pudo verificar
                    try:
                        if unified_data_service.is_connected():
                            exit_price = float(unified_data_service.get_current_price(symbol))
                    except:
                        pass
                    if exit_price == 0:
                        # Simulate small move based on direction (only if absolutely no data)
                        exit_price = trade_obj.entry_price * (1.0 + (0.0005 if trade_obj.direction == 'call' else -0.0005))
                    
                    # Determine result for binary style locally
                    if trade_obj.direction == 'call':
                        is_win = exit_price > trade_obj.entry_price
                    else:
                        is_win = exit_price < trade_obj.entry_price
                    
                    result = 'win' if is_win else 'loss'
                    pnl = round(trade_obj.amount * 0.85, 2) if is_win else -round(trade_obj.amount, 2)
                
                self.complete_trade(trade_id, exit_price, result, pnl)
                
                # Actualizar balance después de cerrar operación
                self._update_balance()
                
        except Exception as e:
            logger.error(f"Error settling trades: {e}")
    
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
    
    def _update_balance(self) -> None:
        """Update balance from connected trading platform forcefully."""
        try:
            iq = trading_service.get_iq_option()
            if iq:
                # Forzar reconexión si es necesario
                if not iq.check_connect():
                    logger.info("IQ Option desconectado, intentando reconectar para actualizar balance...")
                    iq.connect()
                
                if iq.check_connect():
                    balance = iq.get_balance()
                    self.status.balance = balance
                    # Log menos frecuente para no saturar
                    if random.random() < 0.1: 
                        logger.info(f"Balance IQ Option sincronizado: ${balance}")
                else:
                    logger.warning("No se pudo conectar a IQ Option para actualizar balance")
            else:
                # Try to get from MT5 if IQ not connected
                mt5 = trading_service.get_mt5()
                if mt5:
                    account_info = mt5.account_info()
                    if account_info:
                        self.status.balance = account_info.balance
                        logger.info(f"MT5 Balance updated: ${account_info.balance}")
        except Exception as e:
            logger.warning(f"Could not update balance: {e}")
    
    def _trading_loop(self) -> None:
        """Background trading loop that scans all symbols and executes trades."""
        import random
        
        logger.info(f"Trading loop started - Mode: {self.trading_mode}, Symbols: {self.symbols}")
        
        scan_interval = 30  # seconds between scans
        
        while not self._stop_event.is_set():
            try:
                self.status.is_scanning = True
                self._update_balance()
                
                # Scan all configured symbols
                for symbol in self.symbols:
                    if self._stop_event.is_set():
                        break
                    
                    self.status.current_symbol = symbol
                    
                    # Generate signal for this symbol
                    signal = self._analyze_symbol(symbol)
                    
                    if signal and signal.get('signal', {}).get('signal') in ['call', 'put']:
                        sig_data = signal.get('signal', {})
                        confidence = sig_data.get('confidence', 0)
                        direction = sig_data.get('signal')
                        
                        # Record signal
                        self.record_signal(signal)
                        
                        # ML gating: skip if ML strongly contradicts
                        if self.trading_mode == 'auto' and self.ml_enabled:
                            try:
                                ml_pred = signal.get('ml_prediction')
                                if ml_pred:
                                    ml_dir = ml_pred.get('signal')
                                    ml_prob = float(ml_pred.get('probability', 0))
                                    if ml_dir in ['call','put'] and ml_dir != direction and ml_prob >= self.ml_min_probability:
                                        logger.info(f"Skipping trade on {symbol}: ML conflict {ml_dir} p={ml_prob:.2f}")
                                        continue
                            except Exception:
                                pass
                        
                        # Check if should auto-execute
                        if self.trading_mode == 'auto' and confidence >= self.min_confidence:
                            # Check if we should avoid based on loss patterns
                            avoid_reason = self.should_avoid_trade(
                                sig_data.get('indicators', {}),
                                direction,
                                symbol
                            )
                            
                            if avoid_reason:
                                logger.info(f"Skipping trade on {symbol}: {avoid_reason}")
                                continue
                            
                            # Execute trade
                            try:
                                self._execute_auto_trade(symbol, direction, confidence, sig_data)
                            except Exception as e:
                                logger.error(f"Error executing trade on {symbol}: {e}")
                                self.status.errors.append(str(e))
                    
                    # Small delay between symbols
                    time.sleep(1)
                    # Settle trades if any due
                    self._settle_due_trades()
                
                self.status.is_scanning = False
                
                # Wait before next scan cycle
                for _ in range(scan_interval):
                    if self._stop_event.is_set():
                        break
                    time.sleep(1)
                    self._settle_due_trades()
                    
            except Exception as e:
                logger.error(f"Error in trading loop: {e}")
                self.status.errors.append(str(e))
                self.status.is_scanning = False
                time.sleep(5)
        
        logger.info("Trading loop stopped")
    
    def _analyze_symbol(self, symbol: str) -> Optional[Dict]:
        """Analyze a single symbol and return signal."""
        import random
        
        try:
            # Try to get real data first
            df = None
            try:
                if unified_data_service.is_connected():
                    df = unified_data_service.get_candles(symbol, '5m', 200)
            except:
                pass
            
            # Generate analysis (using real data if available, simulated otherwise)
            if df is not None and not df.empty:
                # Use real strategy analysis
                from services.strategies import get_strategy
                strategy = get_strategy(self.strategies[0] if self.strategies else 'ema_rsi')
                signal = strategy.analyze(df.to_dict('records'))
                
                result = {
                    'symbol': symbol,
                    'timeframe': '5m',
                    'strategy': self.strategies[0] if self.strategies else 'ema_rsi',
                    'signal': signal.to_dict(),
                    'timestamp': datetime.now().isoformat(),
                    'source': 'real'
                }
                # Attach ML prediction if available
                try:
                    if self.ml_enabled and (getattr(ml_service, 'is_xgboost_trained', False) or getattr(ml_service, 'is_lstm_trained', False)):
                        ml_result = ml_service.predict(df)
                        if isinstance(ml_result, dict) and ml_result.get('status') == 'success':
                            pred = ml_result.get('prediction') or {}
                            result['ml_prediction'] = pred
                            base = result['signal'].get('confidence', 0) or 0
                            direction = result['signal'].get('signal')
                            ml_dir = pred.get('signal')
                            ml_prob = float(pred.get('probability', 0))
                            if isinstance(base, (int, float)) and isinstance(ml_prob, (int, float)) and direction in ['call','put'] and ml_dir in ['call','put']:
                                if ml_dir == direction:
                                    blended = (base * (1.0 - self.ml_weight)) + (ml_prob * 100.0 * self.ml_weight)
                                else:
                                    blended = max(0.0, (base * (1.0 - self.ml_weight)) + ((100.0 - ml_prob * 100.0) * self.ml_weight))
                                result['signal']['confidence'] = float(min(100.0, max(0.0, blended)))
                                result['signal']['ml_conflict'] = (ml_dir != direction)
                except Exception as e:
                    logger.warning(f"ML prediction failed: {e}")
                
                return result
            else:
                # Simulate market analysis
                rsi = random.uniform(20, 80)
                ema_fast = random.uniform(1.08, 1.12)
                ema_slow = random.uniform(1.08, 1.12)
                macd = random.uniform(-0.002, 0.002)
                
                signal_type = 'none'
                confidence = 0
                reasons = []
                
                # RSI signals
                if rsi < 30:
                    signal_type = 'call'
                    confidence = min(85, 60 + (30 - rsi))
                    reasons.append({'condition': f'RSI oversold ({rsi:.1f})', 'met': True})
                elif rsi > 70:
                    signal_type = 'put'
                    confidence = min(85, 60 + (rsi - 70))
                    reasons.append({'condition': f'RSI overbought ({rsi:.1f})', 'met': True})
                
                # EMA crossover
                if ema_fast > ema_slow and signal_type != 'put':
                    signal_type = 'call' if signal_type == 'none' else signal_type
                    confidence = max(confidence, 55 + random.randint(5, 20))
                    reasons.append({'condition': 'EMA bullish crossover', 'met': True})
                elif ema_fast < ema_slow and signal_type != 'call':
                    signal_type = 'put' if signal_type == 'none' else signal_type
                    confidence = max(confidence, 55 + random.randint(5, 20))
                    reasons.append({'condition': 'EMA bearish crossover', 'met': True})
                
                # Random signal generation (40% chance)
                if random.random() > 0.6:
                    signal_type = random.choice(['call', 'put'])
                    confidence = random.randint(58, 78)
                    if not reasons:
                        reasons = [
                            {'condition': 'Trend pattern detected', 'met': True},
                            {'condition': 'Support/Resistance level', 'met': True}
                        ]
                
                return {
                    'symbol': symbol,
                    'timeframe': '5m',
                    'strategy': self.strategies[0] if self.strategies else 'ema_rsi',
                    'signal': {
                        'signal': signal_type,
                        'confidence': min(confidence, 85),
                        'indicators': {
                            'rsi': round(rsi, 2),
                            'ema_fast': round(ema_fast, 5),
                            'ema_slow': round(ema_slow, 5),
                            'macd': round(macd, 5),
                        },
                        'reasons': reasons
                    },
                    'timestamp': datetime.now().isoformat(),
                    'source': 'simulated'
                }
                
        except Exception as e:
            logger.error(f"Error analyzing {symbol}: {e}")
            return None
    
    def execute_and_monitor_trade(
        self,
        symbol: str,
        direction: str,
        amount: float,
        strategy: str,
        confidence: float,
        indicators: Dict,
        reasons: List[str],
        ml_prediction: Optional[Dict] = None,
        platform: str = 'iqoption',
        account_type: str = 'PRACTICE',
        expiration: int = 5
    ) -> Dict:
        """
        Execute a trade on the real broker (if connected) and record it internally.
        """
        import random
        
        direction = str(direction).lower().strip()
        if direction not in ['call', 'put']:
            return {'status': 'error', 'message': f"Invalid direction: {direction}"}
        
        try:
            amount = float(amount)
        except Exception:
            return {'status': 'error', 'message': 'Invalid amount'}
        
        if amount <= 0:
            return {'status': 'error', 'message': 'Amount must be > 0'}
        
        try:
            expiration = int(expiration)
        except Exception:
            expiration = 5
        
        if expiration < 1:
            expiration = 1
        
        platform = (platform or 'iqoption').lower().strip()
        
        entry_price = 0.0
        try:
            if platform == 'iqoption':
                iq_for_price = trading_service.get_iq_option()
                if iq_for_price and iq_for_price.check_connect():
                    candles = iq_for_price.get_candles(symbol, 60, 1, time.time())
                    if candles:
                        entry_price = float(candles[-1].get('close', candles[-1].get('c', 0)) or 0)
            if entry_price == 0 and unified_data_service.is_connected():
                entry_price = float(unified_data_service.get_current_price(symbol) or 0)
        except Exception:
            entry_price = 0.0
        
        if entry_price == 0:
            if 'JPY' in symbol:
                entry_price = round(random.uniform(140, 160), 3)
            else:
                entry_price = round(random.uniform(1.05, 1.15), 5)

        trade_id_broker = None
        executed_on_broker = False
        broker_error = None
        
        if platform == 'iqoption':
            iq = trading_service.get_iq_option()
            if iq:
                try:
                    if not iq.check_connect():
                        iq.connect()
                    if iq.check_connect():
                        if hasattr(iq, 'is_asset_open') and not iq.is_asset_open(symbol):
                            broker_error = f"Market for {symbol} is CLOSED"
                        else:
                            check, order_id = iq.buy(amount, symbol, direction, expiration)
                            if check:
                                trade_id_broker = order_id
                                executed_on_broker = True
                                logger.info(f"✅ Real trade executed on IQ Option: {symbol} {direction} ID:{order_id}")
                                self._update_balance()
                            else:
                                broker_error = "Broker rejected trade (Market closed or limit reached)"
                    else:
                        broker_error = "Could not connect to IQ Option"
                except Exception as e:
                    broker_error = str(e)
                    logger.error(f"IQ Option execution error: {e}")
            else:
                broker_error = "IQ Option service not initialized"
        elif platform == 'mt5':
            broker_error = "MT5 execution not yet fully implemented via this unified method"
        else:
            broker_error = f"Unknown platform: {platform}"
        
        if not executed_on_broker:
            self.status.errors.append(f"Trade failed: {broker_error}")
            return {
                'status': 'error',
                'message': f'Trade execution failed: {broker_error}'
            }
        
        prev_exp = self.config.get('expiration')
        try:
            self.config['expiration'] = expiration
            trade = self.execute_trade(
                platform=platform,
                account_type=account_type,
                symbol=symbol,
                direction=direction,
                amount=amount,
                entry_price=entry_price,
                confidence=confidence,
                strategy_used=strategy,
                indicators=indicators,
                reasons=reasons,
                ml_prediction=ml_prediction
            )
        finally:
            if prev_exp is None:
                self.config.pop('expiration', None)
            else:
                self.config['expiration'] = prev_exp
        
        if trade_id_broker:
            trade.external_id = str(trade_id_broker)
            # Persistir ID de orden en DB para auditoría y sincronización.
            try:
                TradeRepository.set_order_id_platform(trade.id, str(trade_id_broker))
            except Exception:
                pass
        
        self.status.last_trade = trade.to_dict()
        return {
            'status': 'success',
            'trade': trade.to_dict(),
            'broker_id': trade_id_broker,
            'message': 'Trade executed and recorded successfully'
        }

    def _execute_auto_trade(self, symbol: str, direction: str, confidence: float, signal_data: Dict) -> None:
        """Execute an automatic trade."""
        try:
            # Safety guard: only execute if bot is running and in auto mode
            if self._stop_event.is_set() or not self.status.is_running or self.trading_mode != 'auto':
                logger.info("Skipping auto trade: bot not running or not in auto mode")
                return
            
            # Extract reasons safely
            reasons_list = []
            for r in signal_data.get('reasons', []):
                if isinstance(r, dict):
                    reasons_list.append(str(r.get('condition', '')))
                elif isinstance(r, str):
                    reasons_list.append(r)
            
            # Use the unified execution method
            self.execute_and_monitor_trade(
                symbol=symbol,
                direction=direction,
                amount=self.trade_amount,
                strategy=self.strategies[0] if self.strategies else 'ema_rsi',
                confidence=confidence,
                indicators=signal_data.get('indicators', {}),
                reasons=reasons_list,
                ml_prediction=signal_data.get('ml_prediction'),
                platform=self.status.platform or 'iqoption',
                account_type=self.status.account_type or 'PRACTICE',
                expiration=int(self.config.get('expiration', 5))
            )
                
        except Exception as e:
            logger.error(f"Error in auto trade execution: {e}")
            import traceback
            traceback.print_exc()
            self.status.errors.append(str(e)[:100])


# Singleton instance
live_trading_service = LiveTradingService()
