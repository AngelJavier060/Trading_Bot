from flask import jsonify, request
from iqoptionapi.stable_api import IQ_Option
from typing import Optional
import logging
from datetime import datetime
import time
import json
import os
from services.ai.prediction_service import basic_ema_rsi_signal, basic_ema_rsi_decision
from services.risk_manager import can_place_trade, register_trade, get_risk_state
from services.trade_logger import log_trade
from services.trading_service import trading_service
from api.utils.validators import validate_schema
from models.schemas import ConnectSchema, OrderSchema, StrategySchema, ScanSchema, SwitchAccountSchema, CloseOrderSchema

# Import database service
try:
    from database.service import trading_db
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    logging.warning("Database service not available")

class TradingController:
    def __init__(self):
        # El estado ahora se gestionará preferentemente a través de trading_service
        self.current_account_type = "PRACTICE"
        self.last_check = None
        self.current_config = None
        self.email = None

    @property
    def iq(self) -> Optional[IQ_Option]:
        return trading_service.get_iq_option()

    @property
    def connected(self) -> bool:
        return self.iq is not None and self.iq.check_connect()

    @validate_schema(ConnectSchema)
    def connect(self, validated_data: ConnectSchema):
        try:
            logging.info(f"Intento de conexión recibido para plataforma: {validated_data.platform}")
            credentials = validated_data.credentials
            account_type = validated_data.account_type
            
            email = credentials.email
            # No loguear la contraseña por seguridad
            
            if not email or not credentials.password:
                logging.error("Credenciales incompletas recibidas")
                return jsonify({'error': 'Credenciales incompletas'}), 400

            logging.info(f"Intentando conectar a IQ Option con email: {email}")
            
            # Crear nueva instancia de IQ_Option
            iq_instance = IQ_Option(email, credentials.password)
            
            # Intentar conexión
            status, reason = iq_instance.connect()
            
            logging.info(f"Resultado de conexión IQ Option: status={status}, reason={reason}")
            
            if status:
                # Cambiar a cuenta demo/real según corresponda
                if account_type == "REAL":
                    iq_instance.change_balance('REAL')
                else:
                    iq_instance.change_balance('PRACTICE')
                
                # Guardar en el servicio centralizado
                trading_service.set_iq_option(iq_instance)

                # Alinear data service con la sesión real (evitar providers paralelos/demo)
                try:
                    from services.data import unified_data_service
                    unified_data_service.sync_from_trading_service()
                except Exception:
                    pass
                
                self.current_account_type = account_type
                self.last_check = datetime.now()
                self.email = email

                # Obtener información de la cuenta
                balance = iq_instance.get_balance()
                currency = iq_instance.get_currency()

                return jsonify({
                    'status': 'connected',
                    'message': 'Conexión exitosa con IQ Option',
                    'accountInfo': {
                        'account_type': account_type,
                        'balance': balance,
                        'currency': currency,
                        'email': email
                    }
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': f'Error de conexión: {reason}'
                }), 401

        except Exception as e:
            logging.error(f"Error en la conexión: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Error de conexión: {str(e)}'
            }), 500

    def check_connection(self):
        try:
            if not self.connected:
                return jsonify({
                    'status': 'disconnected',
                    'message': 'No hay conexión activa'
                })

            balance = self.iq.get_balance()
            return jsonify({
                'status': 'connected',
                'message': 'Conexión activa',
                'accountInfo': {
                    'account_type': self.current_account_type,
                    'balance': balance
                }
            })

        except Exception as e:
            logging.error(f"Error al verificar conexión: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def disconnect(self):
        try:
            trading_service.disconnect_all()
            self.last_check = None
            return jsonify({
                'status': 'success',
                'message': 'Desconexión exitosa'
            })
        except Exception as e:
            logging.error(f"Error al desconectar: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @validate_schema(SwitchAccountSchema)
    def switch_account(self, validated_data: SwitchAccountSchema):
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            account_type = validated_data.account_type

            if account_type == "REAL":
                self.iq.change_balance('REAL')
            else:
                self.iq.change_balance('PRACTICE')

            self.current_account_type = account_type
            balance = self.iq.get_balance()
            currency = self.iq.get_currency()

            return jsonify({
                'status': 'success',
                'message': 'Cuenta cambiada correctamente',
                'accountInfo': {
                    'account_type': account_type,
                    'balance': balance,
                    'currency': currency
                }
            })
        except Exception as e:
            logging.error(f"Error al cambiar de cuenta: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_account_info(self):
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            balance = self.iq.get_balance()
            currency = self.iq.get_currency()

            return jsonify({
                'status': 'success',
                'accountInfo': {
                    'account_type': self.current_account_type,
                    'balance': balance,
                    'currency': currency,
                    'email': self.email
                }
            })
        except Exception as e:
            logging.error(f"Error al obtener información de cuenta: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @validate_schema(OrderSchema)
    def place_order(self, validated_data: OrderSchema):
        try:
            asset = validated_data.get_asset()
            amount = validated_data.amount
            direction = validated_data.direction.lower()
            expiration = validated_data.expiration
            
            # If not connected, run in simulation mode
            if not self.iq or not self.connected:
                import random
                from datetime import datetime
                
                # Generate simulated order
                order_id = f"SIM-{int(datetime.now().timestamp())}-{random.randint(1000, 9999)}"
                entry_price = round(random.uniform(1.05, 1.15), 5) if 'EUR' in asset or 'GBP' in asset else round(random.uniform(100, 150), 3)
                
                logging.info(f"[SIMULACIÓN] Orden: {asset} {direction.upper()} ${amount} exp:{expiration}m")
                
                return jsonify({
                    'status': 'success',
                    'message': 'Orden simulada ejecutada',
                    'order_id': order_id,
                    'entry_price': entry_price,
                    'asset': asset,
                    'direction': direction,
                    'amount': amount,
                    'expiration': expiration,
                    'mode': 'simulation'
                })

            # Rest of real trading logic follows...
            amount = validated_data.amount
            direction = validated_data.direction.lower()
            expiration = validated_data.expiration

            # Cargar configuración de usuario para límites de riesgo (si existe)
            user_config = None
            try:
                config_path = os.path.join('data', 'user_config.json')
                if os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        user_config = json.load(f)
            except Exception as e:
                logging.error(f"No se pudo leer user_config.json: {e}")

            max_trades_per_day = None
            max_daily_amount = None
            if user_config:
                mdt = user_config.get('max_daily_trades')
                mda = user_config.get('max_daily_risk_amount')
                try:
                    if mdt is not None:
                        max_trades_per_day = int(mdt)
                except Exception:
                    logging.error("max_daily_trades no es un entero válido en user_config.json")
                try:
                    if mda is not None:
                        max_daily_amount = float(mda)
                except Exception:
                    logging.error("max_daily_risk_amount no es un número válido en user_config.json")

            # Límite diario por monto usando config base si no hay override
            if max_daily_amount is None:
                try:
                    base_config_path = os.path.join('data', 'config.json')
                    if os.path.exists(base_config_path):
                        with open(base_config_path, 'r', encoding='utf-8') as f:
                            base_config = json.load(f)
                        risk_params = base_config.get('risk_parameters', {})
                        default_risk_amount = risk_params.get('default_risk_amount')
                        if default_risk_amount is not None:
                            max_daily_amount = float(default_risk_amount)
                except Exception as e:
                    logging.error(f"No se pudo leer config.json para límites de riesgo: {e}")

            allowed, reason = can_place_trade(amount, max_trades_per_day, max_daily_amount)
            if not allowed:
                return jsonify({
                    'status': 'error',
                    'message': reason
                }), 400

            # Get entry price before placing order
            entry_price = None
            try:
                candles = self.iq.get_candles(asset, 60, 1, time.time())
                if candles:
                    entry_price = candles[-1]['close']
            except:
                pass

            status, order_id = self.iq.buy(amount, asset, direction, expiration)

            if status and order_id:
                register_trade(amount)
                log_trade(
                    event_type='open',
                    source='manual_order',
                    account_type=self.current_account_type,
                    email=self.email,
                    asset=asset,
                    amount=amount,
                    direction=direction,
                    expiration=expiration,
                    order_id=order_id,
                    extra={'user_config': user_config} if user_config else None,
                )
                
                # Persist to database
                trade_record = None
                if DB_AVAILABLE:
                    try:
                        # Get additional info from request
                        extra_data = request.get_json() or {}
                        
                        trade_record = trading_db.record_trade(
                            symbol=asset,
                            direction=direction,
                            amount=amount,
                            platform='iqoption',
                            account_type=self.current_account_type,
                            strategy_name=extra_data.get('strategy'),
                            signal_id=extra_data.get('signal_id'),
                            confidence=extra_data.get('confidence'),
                            indicators=extra_data.get('indicators'),
                            technical_justification=extra_data.get('explanation'),
                            entry_reasons=extra_data.get('reasons'),
                            timeframe=extra_data.get('timeframe', '5m'),
                            expiration_minutes=expiration,
                            entry_price=entry_price,
                            execution_mode=extra_data.get('execution_mode', 'manual'),
                            order_id_platform=str(order_id),
                            account_email=self.email
                        )
                        logging.info(f"Trade persisted to DB: {trade_record.get('trade_id')}")
                    except Exception as db_err:
                        logging.error(f"Error persisting trade to DB: {db_err}")
                
                return jsonify({
                    'status': 'success',
                    'message': 'Orden ejecutada correctamente',
                    'order': {
                        'id': order_id,
                        'asset': asset,
                        'amount': amount,
                        'direction': direction,
                        'expiration': expiration,
                        'entry_price': entry_price
                    },
                    'trade_id': trade_record.get('trade_id') if trade_record else None
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'La orden no pudo ser ejecutada'
                }), 500
        except Exception as e:
            logging.error(f"Error al ejecutar orden: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @validate_schema(CloseOrderSchema)
    def close_order(self, validated_data: CloseOrderSchema):
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            order_id = validated_data.order_id

            result = self.iq.sell_option(order_id)

            log_trade(
                event_type='close',
                source='manual_order',
                account_type=self.current_account_type,
                email=self.email,
                order_id=order_id,
                extra={'result': result},
            )

            return jsonify({
                'status': 'success' if result else 'error',
                'result': result
            })
        except Exception as e:
            logging.error(f"Error al cerrar orden: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @validate_schema(StrategySchema)
    def run_basic_strategy(self, validated_data: StrategySchema):
        """Ejecuta una estrategia básica EMA+RSI sobre IQ Option."""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            # Valores desde datos validados
            asset = validated_data.asset
            interval = validated_data.interval
            n_candles = validated_data.n_candles
            amount = validated_data.amount
            expiration = validated_data.expiration
            auto_execute = validated_data.auto_execute

            # Intentar leer configuración de usuario si faltan parámetros clave
            user_config = None
            try:
                config_path = os.path.join('data', 'user_config.json')
                if os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        user_config = json.load(f)
            except Exception as e:
                logging.error(f"No se pudo leer user_config.json: {e}")

            # Calcular amount a partir del riesgo (%) sobre el balance si no se especificó
            if amount is None and user_config:
                risk = user_config.get('risk')  # se interpreta como % del balance
                try:
                    if risk is not None:
                        risk = float(risk)
                        balance = float(self.iq.get_balance())
                        amount = balance * (risk / 100.0)
                except Exception as e:
                    logging.error(f"No se pudo calcular amount desde risk: {e}")

            # Fallback a 1 si no hay amount calculado ni especificado
            if amount is None:
                amount = 1.0

            if expiration is None:
                expiration = 1

            end_from = time.time()
            candles = self.iq.get_candles(asset, interval, n_candles, end_from)

            if not candles:
                return jsonify({
                    'status': 'error',
                    'message': 'No se pudieron obtener velas para el activo indicado'
                }), 500

            decision = basic_ema_rsi_decision(candles)
            signal = decision.get('signal')

            response = {
                'status': 'success',
                'signal': signal,
                'decision': decision,
                'params': {
                    'asset': asset,
                    'interval': interval,
                    'n_candles': n_candles
                }
            }

            # Registrar siempre el análisis de la estrategia
            try:
                log_trade(
                    event_type='analysis',
                    source='basic_strategy',
                    account_type=self.current_account_type,
                    email=self.email,
                    asset=asset,
                    extra={
                        'decision': decision,
                        'params': {
                            'asset': asset,
                            'interval': interval,
                            'n_candles': n_candles,
                        },
                    },
                )
            except Exception as e:
                logging.error(f"No se pudo registrar log de análisis: {e}")

            # Ejecución opcional de la orden
            if auto_execute and signal in ['call', 'put']:
                amount_float = float(amount)
                expiration_int = int(expiration)

                # Límites de riesgo diarios
                max_trades_per_day = None
                max_daily_amount = None
                if user_config:
                    mdt = user_config.get('max_daily_trades')
                    mda = user_config.get('max_daily_risk_amount')
                    try:
                        if mdt is not None:
                            max_trades_per_day = int(mdt)
                    except Exception:
                        pass
                    try:
                        if mda is not None:
                            max_daily_amount = float(mda)
                    except Exception:
                        pass

                if max_daily_amount is None:
                    try:
                        base_config_path = os.path.join('data', 'config.json')
                        if os.path.exists(base_config_path):
                            with open(base_config_path, 'r', encoding='utf-8') as f:
                                base_config = json.load(f)
                            risk_params = base_config.get('risk_parameters', {})
                            default_risk_amount = risk_params.get('default_risk_amount')
                            if default_risk_amount is not None:
                                max_daily_amount = float(default_risk_amount)
                    except Exception as e:
                        pass

                allowed, reason = can_place_trade(amount_float, max_trades_per_day, max_daily_amount)
                if not allowed:
                    response['risk_blocked'] = True
                    response['risk_reason'] = reason
                    return jsonify(response), 400

                status, order_id = self.iq.buy(amount_float, asset, signal, expiration_int)

                if status and order_id:
                    register_trade(amount_float)
                    log_trade(
                        event_type='open',
                        source='basic_strategy',
                        account_type=self.current_account_type,
                        email=self.email,
                        asset=asset,
                        amount=amount_float,
                        direction=signal,
                        expiration=expiration_int,
                        order_id=order_id,
                        extra={
                            'decision': decision,
                            **({
                                'user_config': user_config,
                                'strategy': user_config.get('strategy') if user_config else None,
                                'timeframe': user_config.get('timeframe') if user_config else None,
                                'risk': user_config.get('risk') if user_config else None,
                            } if user_config else {}),
                        },
                    )

                response['order'] = {
                    'status': 'success' if status and order_id else 'error',
                    'id': order_id,
                    'asset': asset,
                    'amount': amount_float,
                    'direction': signal,
                    'expiration': expiration_int
                }

            return jsonify(response)
        except Exception as e:
            logging.error(f"Error al ejecutar estrategia básica: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def save_config(self):
        try:
            data = request.json
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'No se recibió configuración'
                }), 400

            # Accept any configuration format - store as-is
            self.current_config = {
                'mode': data.get('mode', 'manual'),
                'platform': data.get('platform', 'iqoption'),
                'account_type': data.get('account_type', 'DEMO'),
                'symbols': data.get('symbols', ['EURUSD']),
                'strategies': data.get('strategies', ['ema_rsi']),
                'timeframe': data.get('timeframe', '5m'),
                'analysis_interval': data.get('analysis_interval', 30),
                'max_concurrent_trades': data.get('max_concurrent_trades', 3),
                'trade_amount': data.get('trade_amount', 10),
                'expiration_time': data.get('expiration_time', 5),
                # Legacy fields for compatibility
                'marketType': data.get('marketType', 'forex'),
                'risk': data.get('risk', 'medium'),
                'timeframes': data.get('timeframes', ['5m']),
            }

            logging.info(f"Configuración guardada: {self.current_config}")

            return jsonify({
                'status': 'success',
                'message': 'Configuración guardada exitosamente',
                'config': self.current_config
            })

        except Exception as e:
            logging.error(f"Error al guardar configuración: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Error al guardar configuración: {str(e)}'
            }), 500

    def get_assets(self):
        try:
            # Activos por defecto cuando no hay conexión
            default_assets = {
                'EURUSD': {'open': True},
                'GBPUSD': {'open': True},
                'USDJPY': {'open': True},
                'AUDUSD': {'open': True},
                'USDCAD': {'open': True},
                'EURJPY': {'open': True},
                'GBPJPY': {'open': True},
                'EURGBP': {'open': True},
                'USDCHF': {'open': True},
                'NZDUSD': {'open': True},
                'EURAUD': {'open': True},
                'AUDJPY': {'open': True},
                'BTCUSD': {'open': True},
                'ETHUSD': {'open': True},
            }
            
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'success',
                    'activos': default_assets,
                    'source': 'default'
                })

            open_time = self.iq.get_all_open_time()

            activos = {}
            for instruments_type, instruments in open_time.items():
                for name, info in instruments.items():
                    is_open = bool(info.get('open'))
                    if name not in activos:
                        activos[name] = {'open': is_open}
                    else:
                        activos[name]['open'] = activos[name]['open'] or is_open

            return jsonify({
                'status': 'success',
                'activos': activos,
                'source': 'iqoption'
            })
        except Exception as e:
            logging.error(f"Error al obtener activos: {str(e)}")
            return jsonify({
                'status': 'success',
                'activos': {
                    'EURUSD': {'open': True},
                    'GBPUSD': {'open': True},
                    'USDJPY': {'open': True},
                    'AUDUSD': {'open': True},
                    'USDCAD': {'open': True},
                },
                'source': 'fallback'
            })

    def get_risk_state_api(self):
        try:
            state = get_risk_state()

            max_trades_per_day = None
            max_daily_amount = None

            # Cargar límites desde user_config.json si existen
            try:
                config_path = os.path.join('data', 'user_config.json')
                if os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        user_config = json.load(f)
                    mdt = user_config.get('max_daily_trades')
                    mda = user_config.get('max_daily_risk_amount')
                    if mdt is not None:
                        try:
                            max_trades_per_day = int(mdt)
                        except Exception:
                            logging.error("max_daily_trades no es un entero válido en user_config.json")
                    if mda is not None:
                        try:
                            max_daily_amount = float(mda)
                        except Exception:
                            logging.error("max_daily_risk_amount no es un número válido en user_config.json")
            except Exception as e:
                logging.error(f"No se pudo leer user_config.json para límites de riesgo: {e}")

            # Si no hay límite diario configurado, intentar usar config base
            if max_daily_amount is None:
                try:
                    base_config_path = os.path.join('data', 'config.json')
                    if os.path.exists(base_config_path):
                        with open(base_config_path, 'r', encoding='utf-8') as f:
                            base_config = json.load(f)
                        risk_params = base_config.get('risk_parameters', {})
                        default_risk_amount = risk_params.get('default_risk_amount')
                        if default_risk_amount is not None:
                            max_daily_amount = float(default_risk_amount)
                except Exception as e:
                    logging.error(f"No se pudo leer config.json para límites de riesgo: {e}")

            limits = {
                'max_daily_trades': max_trades_per_day,
                'max_daily_amount': max_daily_amount,
            }

            return jsonify({
                'status': 'success',
                'state': state,
                'limits': limits
            })
        except Exception as e:
            logging.error(f"Error al obtener estado de riesgo: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    @validate_schema(ScanSchema)
    def scan_assets(self, validated_data: ScanSchema):
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            assets_str = validated_data.assets
            interval = validated_data.interval
            n_candles = validated_data.n_candles

            assets_list = [a.strip() for a in assets_str.split(',') if a]
            
            results = {}
            end_from = time.time()

            for asset in assets_list:
                try:
                    candles = self.iq.get_candles(asset, interval, n_candles, end_from)
                    if candles:
                        decision = basic_ema_rsi_decision(candles)
                        results[asset] = {
                            'status': 'success',
                            'decision': decision
                        }
                    else:
                        results[asset] = {
                            'status': 'error',
                            'message': 'No se pudieron obtener velas'
                        }
                except Exception as e:
                    results[asset] = {
                        'status': 'error',
                        'message': str(e)
                    }

            return jsonify({
                'status': 'success',
                'scan': results
            })
        except Exception as e:
            logging.error(f"Error al escanear activos: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_trades(self):
        try:
            limit_param = request.args.get('limit')
            try:
                limit = int(limit_param) if limit_param is not None else 100
            except ValueError:
                limit = 100

            log_path = os.path.join('data', 'trade_log.jsonl')
            trades = []
            if os.path.exists(log_path):
                with open(log_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                for line in lines[-limit:]:
                    try:
                        trades.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

            return jsonify({
                'status': 'success',
                'count': len(trades),
                'trades': trades
            })
        except Exception as e:
            logging.error(f"Error al leer historial de operaciones: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_platform_history(self):
        """Get trade history directly from the trading platform"""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            limit_param = request.args.get('limit', 50)
            try:
                limit = int(limit_param)
            except ValueError:
                limit = 50

            # Get closed positions from IQ Option
            trades = []
            try:
                # Get recent closed orders
                result = self.iq.get_optioninfo_v2(limit)
                if result and 'msg' in result:
                    for order in result['msg']:
                        trade = {
                            'id': order.get('id'),
                            'symbol': order.get('active'),
                            'direction': 'call' if order.get('dir') == 'call' else 'put',
                            'amount': order.get('amount'),
                            'open_price': order.get('value'),
                            'close_price': order.get('close_value'),
                            'win': order.get('win') == 'win',
                            'profit': order.get('profit', 0),
                            'open_time': order.get('created'),
                            'close_time': order.get('expired'),
                            'platform': 'iqoption'
                        }
                        trades.append(trade)
            except Exception as e:
                logging.warning(f"Could not get platform history: {e}")
                # Return local trades instead
                return self.get_trades()

            return jsonify({
                'status': 'success',
                'count': len(trades),
                'trades': trades,
                'source': 'platform'
            })
        except Exception as e:
            logging.error(f"Error getting platform history: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_order_status(self, order_id):
        """Get status of a specific order"""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            try:
                # Check if order is complete
                result, profit = self.iq.check_win_v4(order_id)
                
                if result is not None:
                    return jsonify({
                        'status': 'closed',
                        'order_id': order_id,
                        'win': profit > 0,
                        'profit': profit,
                        'result': 'win' if profit > 0 else 'loss'
                    })
                else:
                    return jsonify({
                        'status': 'pending',
                        'order_id': order_id,
                        'message': 'Order still active'
                    })
            except Exception as e:
                return jsonify({
                    'status': 'pending',
                    'order_id': order_id,
                    'message': str(e)
                })
        except Exception as e:
            logging.error(f"Error checking order status: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_trading_status(self):
        """Get comprehensive trading status for the frontend"""
        try:
            status_data = {
                'connected': self.connected,
                'platform': 'iqoption',
                'account_type': self.current_account_type,
            }
            
            if self.connected:
                try:
                    balance = self.iq.get_balance()
                    currency = self.iq.get_currency()
                    status_data['account_info'] = {
                        'balance': balance,
                        'currency': currency,
                        'account_type': self.current_account_type,
                        'email': self.email
                    }
                except Exception as e:
                    logging.warning(f"Could not get account info: {e}")
            
            return jsonify({
                'status': 'connected' if self.connected else 'disconnected',
                **status_data
            })
        except Exception as e:
            logging.error(f"Error getting trading status: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def sync_with_platform(self):
        """Synchronize local state with platform"""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            sync_data = {
                'timestamp': datetime.now().isoformat(),
                'balance': None,
                'open_positions': [],
                'recent_trades': []
            }

            try:
                sync_data['balance'] = self.iq.get_balance()
            except:
                pass

            # Get open positions
            try:
                positions = self.iq.get_positions('digital-option')
                if positions:
                    sync_data['open_positions'] = positions
            except:
                pass

            return jsonify({
                'status': 'success',
                'sync': sync_data
            })
        except Exception as e:
            logging.error(f"Error syncing with platform: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_economic_calendar(self):
        """Get high-impact economic news for the day"""
        try:
            # Try to fetch from external API
            import requests
            from datetime import datetime, timedelta
            
            today = datetime.now().strftime('%Y-%m-%d')
            
            # Try forex factory or similar API
            try:
                # Using a free economic calendar API
                response = requests.get(
                    f'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
                    timeout=5
                )
                if response.status_code == 200:
                    data = response.json()
                    # Filter high impact events for today
                    events = []
                    for event in data:
                        if event.get('impact', '').lower() in ['high', 'medium']:
                            events.append({
                                'time': event.get('time', ''),
                                'currency': event.get('country', ''),
                                'event': event.get('title', ''),
                                'impact': 'high' if event.get('impact', '').lower() == 'high' else 'medium',
                                'forecast': event.get('forecast', ''),
                                'previous': event.get('previous', ''),
                            })
                    return jsonify({
                        'status': 'success',
                        'events': events[:20],  # Limit to 20 events
                        'source': 'api'
                    })
            except:
                pass
            
            # Fallback: return sample high-impact news
            sample_events = [
                {
                    'time': '08:30',
                    'currency': 'USD',
                    'event': 'Non-Farm Payrolls',
                    'impact': 'high',
                    'forecast': '200K',
                    'previous': '187K'
                },
                {
                    'time': '10:00',
                    'currency': 'USD',
                    'event': 'ISM Manufacturing PMI',
                    'impact': 'high',
                    'forecast': '47.5',
                    'previous': '46.7'
                },
                {
                    'time': '14:00',
                    'currency': 'EUR',
                    'event': 'ECB Interest Rate Decision',
                    'impact': 'high',
                    'forecast': '4.50%',
                    'previous': '4.50%'
                },
                {
                    'time': '15:30',
                    'currency': 'GBP',
                    'event': 'BoE Governor Speech',
                    'impact': 'medium'
                },
                {
                    'time': '16:00',
                    'currency': 'USD',
                    'event': 'FOMC Member Speech',
                    'impact': 'medium'
                },
            ]
            
            return jsonify({
                'status': 'success',
                'events': sample_events,
                'source': 'sample'
            })
            
        except Exception as e:
            logging.error(f"Error getting economic calendar: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e),
                'events': []
            }), 500
