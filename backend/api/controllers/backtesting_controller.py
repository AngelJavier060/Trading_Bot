"""
Backtesting Controller
======================
Handles backtesting API endpoints with strategy execution and results.
"""

import logging
import time
import json
import os
from typing import Dict, List, Optional
from flask import request, jsonify
from datetime import datetime, timedelta

from services.backtesting import BacktestEngine, BacktestConfig
from services.backtesting.data_fetcher import fetch_multi_asset, fetch_candles, get_available_symbols
from services.strategies import AVAILABLE_STRATEGIES, get_strategy

logger = logging.getLogger(__name__)


class BacktestingController:
    """Controller for backtesting operations."""
    
    def __init__(self):
        self.results_cache: Dict[str, Dict] = {}
        self.data_dir = os.path.join('data', 'backtests')
        os.makedirs(self.data_dir, exist_ok=True)
    
    def get_strategies(self):
        """Get list of available strategies with details."""
        try:
            strategies = []
            for name, strategy_class in AVAILABLE_STRATEGIES.items():
                strategy = strategy_class()
                strategies.append({
                    'id': name,
                    'name': strategy.name,
                    'description': strategy.description,
                    'version': strategy.version,
                    'min_candles': strategy.min_candles,
                    'default_params': strategy.default_params()
                })
            
            return jsonify({
                'status': 'success',
                'strategies': strategies,
                'count': len(strategies)
            })
        except Exception as e:
            logger.error(f"Error getting strategies: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_strategy_details(self):
        """Get details for a specific strategy."""
        try:
            strategy_name = request.args.get('name', 'ema_rsi')
            
            if strategy_name not in AVAILABLE_STRATEGIES:
                return jsonify({
                    'status': 'error',
                    'message': f'Strategy not found: {strategy_name}',
                    'available': list(AVAILABLE_STRATEGIES.keys())
                }), 404
            
            strategy = get_strategy(strategy_name)
            info = strategy.get_info()
            
            return jsonify({
                'status': 'success',
                'strategy': info
            })
        except Exception as e:
            logger.error(f"Error getting strategy details: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def run_backtest(self):
        """
        Run a backtest with provided configuration and data.
        
        Expected JSON body:
        {
            "config": {
                "strategy_name": "ema_rsi",
                "initial_capital": 10000,
                "trade_amount": 100,
                "payout_rate": 0.85,
                "min_confidence": 60,
                ...
            },
            "candles": {
                "EURUSD": [
                    {"open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15, "timestamp": 1234567890},
                    ...
                ]
            }
        }
        """
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'No data provided'
                }), 400
            
            config_data = data.get('config', {})
            candles_data = data.get('candles', {})
            
            if not config_data.get('strategy_name'):
                return jsonify({
                    'status': 'error',
                    'message': 'strategy_name is required'
                }), 400
            
            if not candles_data:
                return jsonify({
                    'status': 'error',
                    'message': 'candles data is required'
                }), 400
            
            # Build config
            config = BacktestConfig(
                strategy_name=config_data.get('strategy_name', 'ema_rsi'),
                strategy_params=config_data.get('strategy_params', {}),
                initial_capital=float(config_data.get('initial_capital', 10000)),
                trade_amount=float(config_data.get('trade_amount', 100)),
                trade_amount_type=config_data.get('trade_amount_type', 'fixed'),
                payout_rate=float(config_data.get('payout_rate', 0.85)),
                max_trades_per_day=int(config_data.get('max_trades_per_day', 50)),
                stop_loss_daily=float(config_data.get('stop_loss_daily', 0.1)),
                take_profit_daily=float(config_data.get('take_profit_daily', 0.2)),
                timeframe=config_data.get('timeframe', '5m'),
                assets=config_data.get('assets', list(candles_data.keys())),
                use_martingale=config_data.get('use_martingale', False),
                martingale_multiplier=float(config_data.get('martingale_multiplier', 2.0)),
                martingale_max_steps=int(config_data.get('martingale_max_steps', 3)),
                min_confidence=float(config_data.get('min_confidence', 60))
            )
            
            # Run backtest
            engine = BacktestEngine(config)
            result = engine.run(candles_data)
            
            # Cache result
            result_id = f"bt_{int(time.time())}_{config.strategy_name}"
            result_dict = result.to_dict()
            self.results_cache[result_id] = result_dict
            
            # Save to file
            self._save_result(result_id, result_dict)
            
            return jsonify({
                'status': 'success',
                'result_id': result_id,
                'result': result_dict
            })
            
        except ValueError as e:
            logger.error(f"Validation error in backtest: {e}")
            return jsonify({
                'status': 'error',
                'message': f'Validation error: {str(e)}'
            }), 400
        except Exception as e:
            logger.error(f"Error running backtest: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def run_quick_backtest(self):
        """
        Run a quick backtest with demo data for testing.
        Uses generated sample data.
        """
        try:
            data = request.get_json() or {}
            strategy_name = data.get('strategy_name', 'ema_rsi')
            num_candles = min(int(data.get('num_candles', 500)), 2000)
            
            # Generate sample candles
            candles = self._generate_sample_candles(num_candles)
            
            # Build config
            config = BacktestConfig(
                strategy_name=strategy_name,
                strategy_params=data.get('strategy_params', {}),
                initial_capital=float(data.get('initial_capital', 10000)),
                trade_amount=float(data.get('trade_amount', 100)),
                payout_rate=float(data.get('payout_rate', 0.85)),
                min_confidence=float(data.get('min_confidence', 50)),
                assets=['SAMPLE']
            )
            
            # Run backtest
            engine = BacktestEngine(config)
            result = engine.run({'SAMPLE': candles})
            
            return jsonify({
                'status': 'success',
                'result': result.to_dict()
            })
            
        except Exception as e:
            logger.error(f"Error in quick backtest: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_result(self):
        """Get a cached backtest result by ID."""
        try:
            result_id = request.args.get('id')
            
            if not result_id:
                return jsonify({
                    'status': 'error',
                    'message': 'result id is required'
                }), 400
            
            # Check cache first
            if result_id in self.results_cache:
                return jsonify({
                    'status': 'success',
                    'result': self.results_cache[result_id]
                })
            
            # Try loading from file
            result = self._load_result(result_id)
            if result:
                return jsonify({
                    'status': 'success',
                    'result': result
                })
            
            return jsonify({
                'status': 'error',
                'message': f'Result not found: {result_id}'
            }), 404
            
        except Exception as e:
            logger.error(f"Error getting result: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def list_results(self):
        """List saved backtest results."""
        try:
            results = []
            
            if os.path.exists(self.data_dir):
                for filename in os.listdir(self.data_dir):
                    if filename.endswith('.json'):
                        result_id = filename[:-5]
                        filepath = os.path.join(self.data_dir, filename)
                        
                        try:
                            with open(filepath, 'r') as f:
                                data = json.load(f)
                                results.append({
                                    'id': result_id,
                                    'strategy': data.get('config', {}).get('strategy_name'),
                                    'total_return': data.get('metrics', {}).get('total_return'),
                                    'win_rate': data.get('metrics', {}).get('win_rate'),
                                    'total_trades': data.get('metrics', {}).get('total_trades'),
                                    'created': os.path.getmtime(filepath)
                                })
                        except:
                            continue
            
            # Sort by creation time, newest first
            results.sort(key=lambda x: x.get('created', 0), reverse=True)
            
            return jsonify({
                'status': 'success',
                'results': results[:50],  # Limit to 50 most recent
                'count': len(results)
            })
            
        except Exception as e:
            logger.error(f"Error listing results: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def compare_strategies(self):
        """
        Compare multiple strategies on the same data.
        
        Expected JSON body:
        {
            "strategies": ["ema_rsi", "macd", "bollinger"],
            "config": {...},
            "candles": {...}
        }
        """
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'No data provided'
                }), 400
            
            strategies = data.get('strategies', ['ema_rsi', 'macd'])
            base_config = data.get('config', {})
            candles_data = data.get('candles', {})
            
            # Generate sample data if not provided
            if not candles_data:
                candles_data = {'SAMPLE': self._generate_sample_candles(500)}
            
            results = {}
            
            for strategy_name in strategies:
                if strategy_name not in AVAILABLE_STRATEGIES:
                    continue
                
                config = BacktestConfig(
                    strategy_name=strategy_name,
                    initial_capital=float(base_config.get('initial_capital', 10000)),
                    trade_amount=float(base_config.get('trade_amount', 100)),
                    payout_rate=float(base_config.get('payout_rate', 0.85)),
                    min_confidence=float(base_config.get('min_confidence', 50)),
                    assets=list(candles_data.keys())
                )
                
                engine = BacktestEngine(config)
                result = engine.run(candles_data)
                
                results[strategy_name] = {
                    'metrics': result.metrics.to_dict(),
                    'total_trades': len(result.trades),
                    'final_balance': result.end_balance
                }
            
            # Rank by total return
            ranking = sorted(
                results.items(),
                key=lambda x: x[1]['metrics']['total_return'],
                reverse=True
            )
            
            return jsonify({
                'status': 'success',
                'comparison': results,
                'ranking': [{'strategy': s, 'return': r['metrics']['total_return']} 
                           for s, r in ranking]
            })
            
        except Exception as e:
            logger.error(f"Error comparing strategies: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def analyze_signal(self):
        """
        Analyze current market data with a strategy (without executing trade).
        
        Expected JSON body:
        {
            "strategy_name": "ema_rsi",
            "candles": [...]
        }
        """
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'No data provided'
                }), 400
            
            strategy_name = data.get('strategy_name', 'ema_rsi')
            candles = data.get('candles', [])
            
            if not candles:
                return jsonify({
                    'status': 'error',
                    'message': 'candles data is required'
                }), 400
            
            strategy = get_strategy(strategy_name)
            signal = strategy.analyze(candles)
            
            return jsonify({
                'status': 'success',
                'signal': signal.to_dict()
            })
            
        except Exception as e:
            logger.error(f"Error analyzing signal: {e}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500
    
    def get_symbols(self):
        """Return list of supported symbols for backtesting."""
        try:
            return jsonify({'status': 'success', 'symbols': get_available_symbols()})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def get_strategy_summary(self):
        """
        Resumen mínimo de backtesting de una estrategia para validar que cumpla
        criterios antes de activar en vivo:
            - signals_total ≥ 100
            - win_rate     ≥ 55
            - net_profit   > 0

        Combina:
          a) último resultado en cache (results_cache / disco)
          b) métricas en BD (Strategy.total_trades / win_rate / total_profit)

        GET /api/backtesting/summary?name=ema_rsi
        """
        try:
            name = request.args.get('name', 'ema_rsi')

            best: Dict = {}
            try:
                # (a) cache en memoria
                for r in self.results_cache.values():
                    if r.get('strategy') != name:
                        continue
                    metrics = r.get('metrics') or {}
                    total = int(metrics.get('total_trades', r.get('total_trades', 0)) or 0)
                    if total > best.get('signals_total', -1):
                        best = {
                            'signals_total': total,
                            'win_rate': float(metrics.get('win_rate', 0) or 0),
                            'net_profit': float(metrics.get('net_profit', 0) or 0),
                            'source': 'cache',
                        }
            except Exception:
                pass

            # (b) métricas almacenadas en BD
            try:
                from database.repositories import StrategyRepository
                row = StrategyRepository.get_by_name(name)
                if row:
                    db_total = int(row.get('total_trades') or 0)
                    if db_total > best.get('signals_total', -1):
                        best = {
                            'signals_total': db_total,
                            'win_rate': float(row.get('win_rate') or 0),
                            'net_profit': float(row.get('total_profit') or 0),
                            'source': 'db',
                        }
            except Exception as db_err:
                logger.warning(f"summary DB lookup failed: {db_err}")

            if not best:
                best = {'signals_total': 0, 'win_rate': 0.0, 'net_profit': 0.0, 'source': 'none'}

            min_signals = 100
            min_win_rate = 55.0
            meets_signals = best['signals_total'] >= min_signals
            meets_winrate = best['win_rate'] >= min_win_rate
            meets_pnl = best['net_profit'] > 0
            meets_all = meets_signals and meets_winrate and meets_pnl

            return jsonify({
                'status': 'success',
                'strategy': name,
                'summary': best,
                'criteria': {
                    'min_signals': min_signals,
                    'min_win_rate': min_win_rate,
                    'min_net_profit': 0,
                },
                'checks': {
                    'meets_signals': meets_signals,
                    'meets_win_rate': meets_winrate,
                    'meets_pnl': meets_pnl,
                    'meets_all': meets_all,
                },
            })
        except Exception as e:
            logger.error(f"Error get_strategy_summary: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def run_auto_backtest(self):
        """
        Run a backtest fetching real historical data from Yahoo Finance.

        Expected JSON body:
        {
            "strategy_name": "ema_rsi",
            "assets": ["EURUSD", "GBPUSD"],
            "timeframe": "5m",
            "days_back": 30,           // optional, overridden by start_date/end_date
            "start_date": "2024-01-01",// optional ISO date
            "end_date":   "2024-03-01",// optional ISO date
            "initial_capital": 10000,
            "trade_amount": 100,
            "trade_amount_type": "fixed",
            "payout_rate": 0.85,
            "min_confidence": 60,
            "max_trades_per_day": 50,
            "stop_loss_daily": 0.10,
            "take_profit_daily": 0.20,
            "use_martingale": false,
            "expiration_minutes": 5
        }
        """
        try:
            data = request.get_json() or {}

            strategy_name = data.get('strategy_name', 'ema_rsi')
            if strategy_name not in AVAILABLE_STRATEGIES:
                return jsonify({'status': 'error',
                                'message': f"Estrategia '{strategy_name}' no encontrada. "
                                           f"Disponibles: {list(AVAILABLE_STRATEGIES.keys())}"}), 400

            assets = data.get('assets') or ['EURUSD']
            if isinstance(assets, str):
                assets = [assets]
            # Normalize platform-specific suffixes that Yahoo Finance does not
            # recognise (e.g. EURUSD-OTC → EURUSD).
            assets = [str(a).upper().replace('-OTC', '').replace('_OTC', '') for a in assets if a]
            timeframe = data.get('timeframe', '5m')
            days_back = int(data.get('days_back', 30))
            # Clamp days_back to Yahoo Finance hard limits per timeframe so we
            # never request more than what the data source can deliver.
            from services.backtesting.data_fetcher import YF_MAX_DAYS as _YF_MAX
            days_back = max(2, min(days_back, _YF_MAX.get(timeframe, 58)))
            expiration_minutes = int(data.get('expiration_minutes', 5))

            # Parse optional date range
            start_date = end_date = None
            try:
                if data.get('start_date'):
                    start_date = datetime.fromisoformat(data['start_date'])
                if data.get('end_date'):
                    end_date = datetime.fromisoformat(data['end_date'])
            except Exception:
                pass

            # Fetch real candle data
            logger.info(f"Auto-backtest: fetching data for {assets} tf={timeframe} days={days_back}")
            candles_data = fetch_multi_asset(
                symbols=assets,
                timeframe=timeframe,
                days_back=days_back,
                start_date=start_date,
                end_date=end_date,
            )

            if not candles_data:
                # Tell the user exactly which assets failed and suggest the
                # most common fix (timeframe too small or unsupported symbol).
                pretty_assets = ', '.join(assets) or '—'
                return jsonify({
                    'status': 'error',
                    'message': (
                        f"Yahoo Finance no devolvió velas para [{pretty_assets}] "
                        f"con timeframe {timeframe} y {days_back} días. "
                        "Prueba con otro activo (Forex / Crypto / Índice major), "
                        "sube el timeframe a 1h o 1d, o reduce el periodo. "
                        "OTC e índices propios del broker no existen en Yahoo Finance."
                    ),
                    'assets':    assets,
                    'timeframe': timeframe,
                    'days_back': days_back,
                }), 400

            total_candles = sum(len(v) for v in candles_data.values())
            logger.info(f"Fetched {total_candles} total candles across {len(candles_data)} assets")

            # Build config
            config = BacktestConfig(
                strategy_name=strategy_name,
                strategy_params=data.get('strategy_params', {}),
                initial_capital=float(data.get('initial_capital', 10000)),
                trade_amount=float(data.get('trade_amount', 100)),
                trade_amount_type=data.get('trade_amount_type', 'fixed'),
                payout_rate=float(data.get('payout_rate', 0.85)),
                max_trades_per_day=int(data.get('max_trades_per_day', 50)),
                stop_loss_daily=float(data.get('stop_loss_daily', 0.10)),
                take_profit_daily=float(data.get('take_profit_daily', 0.20)),
                timeframe=timeframe,
                assets=list(candles_data.keys()),
                use_martingale=bool(data.get('use_martingale', False)),
                martingale_multiplier=float(data.get('martingale_multiplier', 2.0)),
                martingale_max_steps=int(data.get('martingale_max_steps', 3)),
                min_confidence=float(data.get('min_confidence', 60)),
            )

            # Inject expiration info into config for engine
            config.expiration_minutes = expiration_minutes

            engine = BacktestEngine(config)
            result = engine.run(candles_data)

            result_id = f"auto_{int(time.time())}_{strategy_name}"
            result_dict = result.to_dict()
            result_dict['data_info'] = {
                'source': 'yfinance',
                'assets': list(candles_data.keys()),
                'candles_per_asset': {k: len(v) for k, v in candles_data.items()},
                'timeframe': timeframe,
                'days_back': days_back,
            }
            self.results_cache[result_id] = result_dict
            self._save_result(result_id, result_dict)

            return jsonify({
                'status': 'success',
                'result_id': result_id,
                'result': result_dict,
            })

        except Exception as e:
            logger.error(f"Error in auto_backtest: {e}", exc_info=True)
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def _generate_sample_candles(self, count: int) -> List[Dict]:
        """Generate sample OHLCV candles for testing."""
        import random
        
        candles = []
        base_price = 1.1000  # Starting price
        timestamp = datetime.now() - timedelta(minutes=count * 5)
        
        for i in range(count):
            # Random walk with slight upward bias
            change = random.gauss(0.0001, 0.002)
            
            open_price = base_price
            close_price = base_price + change
            high_price = max(open_price, close_price) + abs(random.gauss(0, 0.001))
            low_price = min(open_price, close_price) - abs(random.gauss(0, 0.001))
            volume = random.randint(1000, 10000)
            
            candles.append({
                'open': round(open_price, 5),
                'high': round(high_price, 5),
                'low': round(low_price, 5),
                'close': round(close_price, 5),
                'volume': volume,
                'timestamp': int(timestamp.timestamp())
            })
            
            base_price = close_price
            timestamp += timedelta(minutes=5)
        
        return candles
    
    def _save_result(self, result_id: str, result: Dict):
        """Save backtest result to file."""
        try:
            filepath = os.path.join(self.data_dir, f"{result_id}.json")
            with open(filepath, 'w') as f:
                json.dump(result, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving result: {e}")
    
    def _load_result(self, result_id: str) -> Optional[Dict]:
        """Load backtest result from file."""
        try:
            filepath = os.path.join(self.data_dir, f"{result_id}.json")
            if os.path.exists(filepath):
                with open(filepath, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading result: {e}")
        return None


# Singleton instance
backtesting_controller = BacktestingController()
