"""
Strategy Performance Service
=============================
Evaluates historical win rates per strategy and automatically selects
the best performing ones for live trading.
"""

import logging
import json
import os
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)

ALL_STRATEGIES = ['ema_rsi', 'macd', 'bollinger', 'rsi_divergence', 'ichimoku']
MIN_TRADES_FOR_RANKING = 5          # Minimum trades to consider a strategy
DEFAULT_LOOKBACK_DAYS = 7           # How many days of history to evaluate
TOP_N_STRATEGIES = 3                # How many strategies the bot will use at once
MIN_WIN_RATE = 0.45                 # Minimum acceptable win rate (45%)
PERFORMANCE_FILE = os.path.join('data', 'strategy_performance.json')


class StrategyPerformanceService:
    """
    Tracks the historical win rate of each strategy and exposes
    a ranked list so the bot can automatically use the best ones.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._stats: Dict[str, Dict] = {}
            self._last_update: Optional[datetime] = None
            self._load()
            self._initialized = True

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def record_trade(self, strategy_name: str, result: str, confidence: float = 0.0) -> None:
        """Record the outcome of a completed trade for a given strategy."""
        if strategy_name not in self._stats:
            self._stats[strategy_name] = {
                'wins': 0, 'losses': 0, 'total': 0,
                'total_confidence': 0.0, 'last_updated': None
            }
        s = self._stats[strategy_name]
        s['total'] += 1
        s['total_confidence'] += confidence
        if result == 'win':
            s['wins'] += 1
        elif result == 'loss':
            s['losses'] += 1
        s['last_updated'] = datetime.now().isoformat()
        self._save()
        logger.debug(f"StrategyPerf: {strategy_name} → {result} (wins={s['wins']}, losses={s['losses']})")

    def get_best_strategies(self, top_n: int = TOP_N_STRATEGIES) -> List[str]:
        """
        Return the top-N strategies sorted by score.
        Score = win_rate * log(1 + total_trades)  (Wilson-inspired, rewards volume + quality)
        Falls back to all strategies if not enough historical data.
        """
        import math
        ranked = []
        for name in ALL_STRATEGIES:
            s = self._stats.get(name, {})
            total = s.get('total', 0)
            wins = s.get('wins', 0)
            if total < MIN_TRADES_FOR_RANKING:
                # Not enough data yet – include with a neutral score
                ranked.append((name, 0.5 * math.log(1 + total + 1), total))
                continue
            win_rate = wins / total
            score = win_rate * math.log(1 + total)
            ranked.append((name, score, total))

        ranked.sort(key=lambda x: x[1], reverse=True)
        best = [name for name, score, total in ranked[:top_n]]
        logger.info(f"Best strategies selected: {best}")
        return best

    def get_ranking(self) -> List[Dict]:
        """Return full ranking with stats for the frontend."""
        import math
        rows = []
        for name in ALL_STRATEGIES:
            s = self._stats.get(name, {'wins': 0, 'losses': 0, 'total': 0})
            total = s.get('total', 0)
            wins = s.get('wins', 0)
            losses = s.get('losses', 0)
            win_rate = round(wins / total, 4) if total > 0 else None
            avg_conf = round(s.get('total_confidence', 0.0) / total, 1) if total > 0 else None
            score = win_rate * math.log(1 + total) if win_rate is not None else 0.0
            rows.append({
                'strategy': name,
                'wins': wins,
                'losses': losses,
                'total': total,
                'win_rate': win_rate,
                'avg_confidence': avg_conf,
                'score': round(score, 4),
                'sufficient_data': total >= MIN_TRADES_FOR_RANKING,
            })
        rows.sort(key=lambda x: x['score'], reverse=True)
        return rows

    def rebuild_from_history(self, trade_history: List[Dict]) -> None:
        """
        Rebuild strategy stats from a list of completed trades.
        Each trade dict must have: strategy_used (or strategy_name), result, confidence.
        Called automatically when the bot starts to keep stats fresh.
        """
        self._stats = {}
        for t in trade_history:
            strat = t.get('strategy_used') or t.get('strategy_name') or t.get('strategy', '')
            result = t.get('result', '')
            conf = float(t.get('confidence') or t.get('confidence_level') or 0)
            if strat and result in ('win', 'loss'):
                self.record_trade(strat, result, conf)
        logger.info(f"StrategyPerf rebuilt from {len(trade_history)} trades")

    # ------------------------------------------------------------------ #
    # Persistence                                                          #
    # ------------------------------------------------------------------ #

    def _save(self) -> None:
        try:
            os.makedirs(os.path.dirname(PERFORMANCE_FILE), exist_ok=True)
            with open(PERFORMANCE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self._stats, f, indent=2, default=str)
        except Exception as e:
            logger.warning(f"Could not save strategy performance: {e}")

    def _load(self) -> None:
        try:
            if os.path.exists(PERFORMANCE_FILE):
                with open(PERFORMANCE_FILE, 'r', encoding='utf-8') as f:
                    self._stats = json.load(f)
                logger.info(f"Strategy performance loaded ({len(self._stats)} strategies)")
        except Exception as e:
            logger.warning(f"Could not load strategy performance: {e}")
            self._stats = {}


# Singleton
strategy_performance = StrategyPerformanceService()
