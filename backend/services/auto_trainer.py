"""
Auto Trainer Service
====================
Background service that periodically retrains ML models using real
market data fetched from the connected broker or fallback sources.

Schedule: every RETRAIN_INTERVAL_HOURS hours (default 6 h).
Also runs once on startup if no trained models are found.
"""

import logging
import os
import json
import time
from threading import Thread, Event
from datetime import datetime, timedelta
from typing import Dict, Optional

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

RETRAIN_INTERVAL_HOURS = 6          # Re-train every 6 hours
MIN_CANDLES_FOR_TRAINING = 500      # Minimum candles needed
STATUS_FILE = os.path.join('data', 'auto_trainer_status.json')
SYMBOLS_TO_TRAIN = ['EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY']


class AutoTrainerService:
    """
    Runs ML model retraining in a background daemon thread.

    - On start: tries to load saved models first; trains from scratch if none found.
    - Every RETRAIN_INTERVAL_HOURS: fetches fresh candle data and retrains.
    - Exposes status/results for the API.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._stop_event = Event()
            self._thread: Optional[Thread] = None
            self.is_running = False
            self.last_train_time: Optional[datetime] = None
            self.last_train_result: Dict = {}
            self.training_in_progress = False
            os.makedirs('data', exist_ok=True)
            self._load_status()
            self._initialized = True

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def start(self) -> None:
        """Start the background trainer thread."""
        if self.is_running:
            return
        self._stop_event.clear()
        self._thread = Thread(target=self._loop, daemon=True, name='AutoTrainer')
        self._thread.start()
        self.is_running = True
        logger.info("AutoTrainerService started")

    def stop(self) -> None:
        """Stop the background trainer."""
        self._stop_event.set()
        self.is_running = False
        logger.info("AutoTrainerService stopped")

    def train_now(self, symbol: str = 'EURUSD') -> Dict:
        """
        Trigger an immediate training cycle (called from API).
        Returns results dict.
        """
        if self.training_in_progress:
            return {'status': 'busy', 'message': 'Training already in progress'}
        return self._run_training(symbol)

    def get_status(self) -> Dict:
        """Return current trainer status for the frontend."""
        from services.ml.ml_service import ml_service
        return {
            'is_running': self.is_running,
            'training_in_progress': self.training_in_progress,
            'last_train_time': self.last_train_time.isoformat() if self.last_train_time else None,
            'next_train_in_seconds': self._seconds_until_next_train(),
            'last_result': self.last_train_result,
            'ml_models': {
                'xgboost': ml_service.is_xgboost_trained,
                'lstm': ml_service.is_lstm_trained,
            }
        }

    # ------------------------------------------------------------------ #
    # Internal loop                                                        #
    # ------------------------------------------------------------------ #

    def _loop(self) -> None:
        """Background thread: load models first, then retrain periodically."""
        self._try_load_saved_models()

        while not self._stop_event.is_set():
            should_train = (
                self.last_train_time is None or
                (datetime.now() - self.last_train_time) >= timedelta(hours=RETRAIN_INTERVAL_HOURS)
            )
            if should_train:
                for symbol in SYMBOLS_TO_TRAIN:
                    if self._stop_event.is_set():
                        break
                    result = self._run_training(symbol)
                    if result.get('status') == 'success':
                        break  # One good training is enough per cycle

            # Sleep in 60-second increments so stop() is responsive
            for _ in range(60):
                if self._stop_event.is_set():
                    break
                time.sleep(60)

    def _try_load_saved_models(self) -> None:
        """Attempt to load previously saved ML models."""
        try:
            from services.ml.ml_service import ml_service
            results = ml_service.load_models()
            loaded = [k for k, v in results.items() if v == 'loaded']
            if loaded:
                logger.info(f"AutoTrainer: loaded saved models → {loaded}")
            else:
                logger.info("AutoTrainer: no saved models found, will train on next cycle")
        except Exception as e:
            logger.warning(f"AutoTrainer: could not load saved models: {e}")

    def _run_training(self, symbol: str = 'EURUSD') -> Dict:
        """Fetch data and train all ML models for a given symbol."""
        self.training_in_progress = True
        result = {'status': 'error', 'symbol': symbol, 'started_at': datetime.now().isoformat()}
        logger.info(f"AutoTrainer: starting training on {symbol}")

        try:
            df = self._fetch_candles(symbol)
            if df is None or len(df) < MIN_CANDLES_FOR_TRAINING:
                result['message'] = f'Not enough data: got {len(df) if df is not None else 0} candles, need {MIN_CANDLES_FOR_TRAINING}'
                logger.warning(f"AutoTrainer: {result['message']}")
                return result

            from services.ml.ml_service import ml_service
            logger.info(f"AutoTrainer: training on {len(df)} candles for {symbol}")
            train_result = ml_service.train_models(df, train_xgboost=True, train_lstm=True)

            if train_result.get('status') == 'success':
                self.last_train_time = datetime.now()
                result.update({
                    'status': 'success',
                    'symbol': symbol,
                    'candles': len(df),
                    'finished_at': self.last_train_time.isoformat(),
                    'models': {k: v.get('status') for k, v in train_result.get('models', {}).items()},
                    'n_features': train_result.get('n_features'),
                })
                logger.info(f"AutoTrainer: training SUCCESS — {result['models']}")
                self._save_status(result)
            else:
                result['message'] = train_result.get('message', 'Unknown error')
                logger.error(f"AutoTrainer: training FAILED — {result['message']}")

        except Exception as e:
            result['message'] = str(e)
            logger.error(f"AutoTrainer: exception during training: {e}", exc_info=True)
        finally:
            self.last_train_result = result
            self.training_in_progress = False

        return result

    def _fetch_candles(self, symbol: str) -> Optional[pd.DataFrame]:
        """
        Fetch OHLCV candle data. Priority:
        1. IQ Option (if connected)
        2. Unified data service
        3. Synthetic data (last resort, for testing only)
        """
        # Try IQ Option
        try:
            from services.trading_service import trading_service
            iq = trading_service.get_iq_option()
            if iq and iq.check_connect():
                candles = iq.get_candles(symbol, 60, MIN_CANDLES_FOR_TRAINING + 50, time.time())
                if candles and len(candles) >= MIN_CANDLES_FOR_TRAINING:
                    df = pd.DataFrame(candles)
                    df.rename(columns={'o': 'open', 'h': 'high', 'l': 'low', 'c': 'close', 'v': 'volume'}, inplace=True)
                    for col in ['open', 'high', 'low', 'close', 'volume']:
                        if col in df.columns:
                            df[col] = pd.to_numeric(df[col], errors='coerce')
                    df.dropna(subset=['close'], inplace=True)
                    logger.info(f"AutoTrainer: fetched {len(df)} candles from IQ Option for {symbol}")
                    return df
        except Exception as e:
            logger.warning(f"AutoTrainer: IQ Option data fetch failed: {e}")

        # Try unified data service
        try:
            from services.data import unified_data_service
            if unified_data_service.is_connected():
                df = unified_data_service.get_candles(symbol, '1m', MIN_CANDLES_FOR_TRAINING + 50)
                if df is not None and len(df) >= MIN_CANDLES_FOR_TRAINING:
                    logger.info(f"AutoTrainer: fetched {len(df)} candles from unified service for {symbol}")
                    return df
        except Exception as e:
            logger.warning(f"AutoTrainer: unified service data fetch failed: {e}")

        # Synthetic fallback (for development / offline use)
        logger.warning(f"AutoTrainer: generating synthetic data for {symbol} (broker offline)")
        return self._generate_synthetic_data(MIN_CANDLES_FOR_TRAINING + 100)

    def _generate_synthetic_data(self, n: int = 1000) -> pd.DataFrame:
        """
        Generate synthetic OHLCV data for offline ML training.
        Uses a random walk with realistic price dynamics.
        """
        np.random.seed(42)
        price = 1.10
        rows = []
        for _ in range(n):
            change = np.random.normal(0, 0.0005)
            open_ = price
            close = price + change
            high = max(open_, close) + abs(np.random.normal(0, 0.0002))
            low = min(open_, close) - abs(np.random.normal(0, 0.0002))
            volume = abs(np.random.normal(1000, 200))
            rows.append({'open': open_, 'high': high, 'low': low, 'close': close, 'volume': volume})
            price = close
        return pd.DataFrame(rows)

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _seconds_until_next_train(self) -> Optional[int]:
        if self.last_train_time is None:
            return 0
        elapsed = (datetime.now() - self.last_train_time).total_seconds()
        remaining = RETRAIN_INTERVAL_HOURS * 3600 - elapsed
        return max(0, int(remaining))

    def _save_status(self, result: Dict) -> None:
        try:
            with open(STATUS_FILE, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, default=str)
        except Exception:
            pass

    def _load_status(self) -> None:
        try:
            if os.path.exists(STATUS_FILE):
                with open(STATUS_FILE, 'r', encoding='utf-8') as f:
                    saved = json.load(f)
                ts = saved.get('finished_at')
                if ts:
                    self.last_train_time = datetime.fromisoformat(ts)
                self.last_train_result = saved
        except Exception:
            pass


# Singleton
auto_trainer = AutoTrainerService()
