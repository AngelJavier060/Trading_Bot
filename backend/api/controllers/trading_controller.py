from flask import jsonify, request
from iqoptionapi.stable_api import IQ_Option
from typing import Optional
import logging
from datetime import datetime
import time
import json
import os
import concurrent.futures
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

def _unpack_check_win_v4(raw):
    """Igual que LiveTradingService: normaliza respuesta de iqoptionapi.check_win_v4."""
    if raw is None:
        return None, None
    if isinstance(raw, (tuple, list)):
        if len(raw) >= 2:
            return raw[0], raw[1]
        if len(raw) == 1:
            return raw[0], None
    if isinstance(raw, (int, float)):
        return True, raw
    return None, None


try:
    from iqoptionapi.constants import ACTIVES as _IQ_ACTIVES_CODES

    IQ_ACTIVE_ID_TO_NAME = {int(v): k for k, v in _IQ_ACTIVES_CODES.items()}
except Exception:
    IQ_ACTIVE_ID_TO_NAME = {}


def _unwrap_iq_get_positions_result(raw):
    """IQ_Option.get_positions devuelve (ok, msg) â€” el controlador antiguo trataba la tupla como truthy y mezclaba tipos."""
    if isinstance(raw, tuple):
        if len(raw) >= 2:
            return bool(raw[0]), raw[1]
        if len(raw) == 1:
            return bool(raw[0]), raw[0]
    if raw in (None, False):
        return False, None
    return True, raw


def _iq_positions_msg_to_list(msg):
    if msg is None:
        return []
    if isinstance(msg, list):
        return msg
    if isinstance(msg, dict):
        for key in (
            "positions",
            "items",
            "result",
            "opened",
            "active_positions",
            "binary_options",
            "turbo_options",
            "digital_options",
            "data",
        ):
            inner = msg.get(key)
            if isinstance(inner, list):
                return inner
            if inner and isinstance(inner, dict):
                inner2 = inner.get("positions") or inner.get("items")
                if isinstance(inner2, list):
                    return inner2
        if "id" in msg or "active" in msg or "external_id" in msg:
            return [msg]
    return []


def _flatten_iq_position_row(pos: dict) -> dict:
    """Algunas respuestas anidan datos en raw_event u order."""
    if not isinstance(pos, dict):
        return pos
    out = dict(pos)
    raw = pos.get("raw_event")
    if isinstance(raw, dict):
        for k, v in raw.items():
            if k not in out or out.get(k) in (None, "", 0):
                out[k] = v
    nested = pos.get("order")
    if isinstance(nested, dict):
        for k, v in nested.items():
            if k not in out or out.get(k) in (None, "", 0):
                out[k] = v
    return out


def _position_row_id(pos: dict):
    for k in (
        "external_id",
        "id",
        "order_id",
        "option_id",
        "position_id",
        "buy_order_id",
    ):
        v = pos.get(k)
        if v is not None and v != "":
            return v
    return None


def _epochish_to_seconds(val):
    if val is None:
        return None
    try:
        x = float(val)
    except (TypeError, ValueError):
        return None
    # Timestamps en ms (p. ej. 1.7e12) â†’ segundos UNIX
    if x > 1e11:
        return x / 1000.0
    return x


def _resolve_iq_active_symbol(pos: dict) -> str:
    a = pos.get("active") or pos.get("underlying") or pos.get("asset") or pos.get("symbol")
    if a is None:
        aid = pos.get("active_id") or pos.get("instrument_id")
        if aid is not None:
            try:
                i = int(aid)
                return IQ_ACTIVE_ID_TO_NAME.get(i, f"#{i}")
            except (TypeError, ValueError):
                return str(aid)
        return ""
    if isinstance(a, str) and not a.isdigit():
        return a
    try:
        i = int(a)
        return IQ_ACTIVE_ID_TO_NAME.get(i, str(a))
    except (TypeError, ValueError):
        return str(a)


def _normalize_iq_open_position(pos: dict, instrument_type: str) -> dict:
    pos = _flatten_iq_position_row(pos)
    sym = _resolve_iq_active_symbol(pos)
    raw_dir = (pos.get("dir") or pos.get("direction") or "").lower()
    if raw_dir in ("call", "up", "buy"):
        direction = "call"
    else:
        direction = "put"
    try:
        amount = float(pos.get("amount") or pos.get("invest") or pos.get("sum") or pos.get("deposit") or 0)
    except (TypeError, ValueError):
        amount = 0.0
    oid = _position_row_id(pos)
    created = _epochish_to_seconds(
        pos.get("created")
        or pos.get("created_at")
        or pos.get("open_time")
        or pos.get("timestamp")
        or pos.get("purchase_time")
        or pos.get("openTime")
    )
    exp = _epochish_to_seconds(
        pos.get("expiration")
        or pos.get("exp_time")
        or pos.get("expire_time")
        or pos.get("expiration_time")
        or pos.get("close_reason_time")
        or pos.get("finish_time")
        or pos.get("close_time")
        or pos.get("purchase_end_time")
        or pos.get("expirationTime")
    )
    try:
        open_quote = float(
            pos.get("open_quote")
            or pos.get("openQuote")
            or pos.get("open_price")
            or pos.get("open_underlying_price")
            or pos.get("strike")
            or pos.get("value")
            or 0
        )
    except (TypeError, ValueError):
        open_quote = 0.0
    try:
        current_quote = float(
            pos.get("current_quote")
            or pos.get("curr_quote")
            or pos.get("quote")
            or pos.get("current_price")
            or pos.get("curr_price")
            or pos.get("underlying_price")
            or 0
        )
    except (TypeError, ValueError):
        current_quote = 0.0
    exp_profit_keys = (
        "expected_profit",
        "close_effect_amount",
        "close_profit",
        "profit_amount",
        "pnl",
        "profit",
        "profit_income",
        "expected_payoff",
    )
    expected_profit = None
    for k in exp_profit_keys:
        v = pos.get(k)
        if v is not None:
            try:
                expected_profit = float(v)
                break
            except (TypeError, ValueError):
                continue
    if expected_profit is None:
        expected_profit = 0.0
    is_otc = isinstance(sym, str) and ("-OTC" in sym.upper() or " OTC" in sym.upper())
    # Determinar categoría de mercado para el frontend
    norm_types = ['digital-option', 'fx-option', 'forex', 'cfd', 'crypto', 'multi-option']
    if is_otc:
        market_type = 'otc'
    elif instrument_type in norm_types:
        market_type = 'mercado_normal'
    else:
        market_type = 'binarias'
    kind = "digital" if "digital" in instrument_type else "binary"
    return {
        "order_id": oid,
        "symbol": sym,
        "direction": direction,
        "amount": amount,
        "instrument_type": instrument_type,
        "instrument_kind": kind,
        "is_otc": is_otc,
        "open_quote": open_quote,
        "current_quote": current_quote,
        "created_at_sec": created,
        "expiration_sec": exp,
        "expected_profit": expected_profit,
    }


LIVE_UI_SYNC_FILE = os.path.join("data", "live_trading_ui_sync.json")


class TradingController:
    def __init__(self):
        # El estado ahora se gestionarÃ¡ preferentemente a travÃ©s de trading_service
        self.current_account_type = "PRACTICE"
        self.last_check = None
        self.current_config = None
        self.email = None
        self._load_ui_sync_from_disk()

    def _load_ui_sync_from_disk(self) -> None:
        try:
            if os.path.isfile(LIVE_UI_SYNC_FILE):
                with open(LIVE_UI_SYNC_FILE, "r", encoding="utf-8") as f:
                    self.current_config = json.load(f)
        except Exception as e:
            logging.debug(f"No se pudo cargar {LIVE_UI_SYNC_FILE}: {e}")

    def get_config(self):
        """Devuelve la Ãºltima configuraciÃ³n de panel guardada en disco (o memoria)."""
        try:
            if self.current_config is None:
                self._load_ui_sync_from_disk()
            if not self.current_config:
                return jsonify({"status": "success", "config": None}), 200
            return jsonify({"status": "success", "config": self.current_config}), 200
        except Exception as e:
            logging.error(f"get_config: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

    @property
    def iq(self) -> Optional[IQ_Option]:
        return trading_service.get_iq_option()

    @property
    def connected(self) -> bool:
        try:
            iq = self.iq
            return iq is not None and bool(iq.check_connect())
        except Exception:
            return False

    @validate_schema(ConnectSchema)
    def connect(self, validated_data: ConnectSchema):
        try:
            credentials = validated_data.credentials
            account_type = validated_data.account_type or 'PRACTICE'
            demo_only = request.get_json(silent=True, force=True) or {}
            demo_only = bool(demo_only.get('demo_only', False))

            # â”€â”€ MODO DEMO SIN BROKER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if demo_only:
                self.current_account_type = 'PRACTICE'
                self.email = credentials.email or 'demo@local'
                return jsonify({
                    'status': 'connected',
                    'message': 'Modo Demo local activo (sin broker)',
                    'accountInfo': {
                        'account_type': 'PRACTICE',
                        'balance': 10000.0,
                        'currency': 'USD',
                        'email': self.email,
                        'mode': 'demo_local'
                    }
                })

            # â”€â”€ CONEXIÃ“N REAL A IQ OPTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            email = credentials.email
            if not email or not credentials.password:
                return jsonify({'status': 'error', 'message': 'Email y contraseÃ±a son obligatorios'}), 400

            logging.info(f"Conectando a IQ Option: {email}")
            iq_instance = IQ_Option(email, credentials.password)

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(iq_instance.connect)
                    try:
                        result = future.result(timeout=30)
                        if isinstance(result, tuple):
                            status, reason = result
                        else:
                            status = bool(result)
                            reason = None
                    except concurrent.futures.TimeoutError:
                        logging.error("IQ Option connect() timeout despuÃ©s de 30s")
                        return jsonify({
                            'status': 'error',
                            'message': 'La conexiÃ³n con IQ Option tardÃ³ demasiado (>30s). '
                                       'Verifica tu conexiÃ³n a internet o intenta nuevamente.'
                        }), 408
            except Exception as conn_err:
                logging.error(f"ExcepciÃ³n en iq_instance.connect(): {conn_err}")
                status = False
                reason = str(conn_err)

            logging.info(f"IQ Option connect â†’ status={status}, reason={reason}")

            if status:
                try:
                    if account_type == 'REAL':
                        iq_instance.change_balance('REAL')
                    else:
                        iq_instance.change_balance('PRACTICE')
                except Exception:
                    pass

                trading_service.set_iq_option(iq_instance)
                try:
                    from services.data import unified_data_service
                    unified_data_service.sync_from_trading_service()
                except Exception:
                    pass

                self.current_account_type = account_type
                self.last_check = datetime.now()
                self.email = email

                try:
                    balance = iq_instance.get_balance()
                    currency = iq_instance.get_currency()
                except Exception:
                    balance, currency = 0.0, 'USD'

                return jsonify({
                    'status': 'connected',
                    'message': 'ConexiÃ³n exitosa con IQ Option',
                    'accountInfo': {
                        'account_type': account_type,
                        'balance': balance,
                        'currency': currency,
                        'email': email
                    }
                })
            else:
                # Proporcionar mensajes de error claros
                reason_str = str(reason) if reason else ''
                if not reason_str or reason_str.lower() in ('none', 'false', ''):
                    msg = ('Credenciales incorrectas. Verifica tu email y contraseÃ±a de IQ Option.'
                           ' Si usas 2FA, desactÃ­valo temporalmente desde la app de IQ Option.')
                elif 'wrong' in reason_str.lower() or 'invalid' in reason_str.lower():
                    msg = f'Email o contraseÃ±a incorrectos ({reason_str})'
                elif '2fa' in reason_str.lower() or 'two' in reason_str.lower():
                    msg = 'Tu cuenta tiene autenticaciÃ³n de dos factores (2FA). DesactÃ­vala desde IQ Option antes de conectar.'
                else:
                    msg = f'IQ Option rechazÃ³ la conexiÃ³n: {reason_str}'
                logging.warning(f"IQ Option login failed: {msg}")
                return jsonify({'status': 'error', 'message': msg}), 401

        except Exception as e:
            logging.error(f"Error en la conexiÃ³n: {str(e)}")
            return jsonify({'status': 'error', 'message': f'Error inesperado: {str(e)}'}), 500

    def check_connection(self):
        try:
            if not self.connected:
                return jsonify({
                    'status': 'disconnected',
                    'message': 'No hay conexiÃ³n activa'
                })

            try:
                balance = self.iq.get_balance()
            except Exception:
                balance = 0.0

            try:
                currency = self.iq.get_currency()
            except Exception:
                currency = 'USD'

            return jsonify({
                'status': 'connected',
                'message': 'ConexiÃ³n activa',
                'accountInfo': {
                    'account_type': self.current_account_type,
                    'balance': balance,
                    'currency': currency
                }
            })

        except Exception as e:
            logging.error(f"Error al verificar conexiÃ³n: {str(e)}")
            return jsonify({
                'status': 'disconnected',
                'message': 'Sin conexiÃ³n'
            })

    def disconnect(self):
        try:
            trading_service.disconnect_all()
            self.last_check = None
            return jsonify({
                'status': 'success',
                'message': 'DesconexiÃ³n exitosa'
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
                    'message': 'No hay conexiÃ³n activa'
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
                    'message': 'No hay conexiÃ³n activa'
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
            logging.error(f"Error al obtener informaciÃ³n de cuenta: {str(e)}")
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
            
            # Sin sesiÃ³n broker: no simular como Ã©xito (evita confusiÃ³n con operaciones reales)
            if not self.iq or not self.connected:
                logging.warning(
                    f"Orden rechazada â€” sin IQ Option conectado: {asset} {direction.upper()} ${amount}"
                )
                return jsonify({
                    'status': 'error',
                    'message': (
                        'No hay conexiÃ³n activa con IQ Option. Conecta la cuenta en el panel '
                        'antes de enviar Ã³rdenes; no se ejecutarÃ¡ ninguna operaciÃ³n simulada en el broker.'
                    ),
                    'code': 'BROKER_NOT_CONNECTED',
                    'mode': 'simulation_blocked',
                }), 503

            # Rest of real trading logic follows...
            amount = validated_data.amount
            direction = validated_data.direction.lower()
            expiration = validated_data.expiration

            # Cargar configuraciÃ³n de usuario para lÃ­mites de riesgo (si existe)
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
                    logging.error("max_daily_trades no es un entero vÃ¡lido en user_config.json")
                try:
                    if mda is not None:
                        max_daily_amount = float(mda)
                except Exception:
                    logging.error("max_daily_risk_amount no es un nÃºmero vÃ¡lido en user_config.json")

            # LÃ­mite diario por monto usando config base si no hay override
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
                    logging.error(f"No se pudo leer config.json para lÃ­mites de riesgo: {e}")

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
                    'mode': 'live',
                    'order_id': order_id,
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
                    'message': 'No hay conexiÃ³n activa'
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
        """Ejecuta una estrategia bÃ¡sica EMA+RSI sobre IQ Option."""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexiÃ³n activa'
                }), 400

            # Valores desde datos validados
            asset = validated_data.asset
            interval = validated_data.interval
            n_candles = validated_data.n_candles
            amount = validated_data.amount
            expiration = validated_data.expiration
            auto_execute = validated_data.auto_execute

            # Intentar leer configuraciÃ³n de usuario si faltan parÃ¡metros clave
            user_config = None
            try:
                config_path = os.path.join('data', 'user_config.json')
                if os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        user_config = json.load(f)
            except Exception as e:
                logging.error(f"No se pudo leer user_config.json: {e}")

            # Calcular amount a partir del riesgo (%) sobre el balance si no se especificÃ³
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

            # Registrar siempre el anÃ¡lisis de la estrategia
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
                logging.error(f"No se pudo registrar log de anÃ¡lisis: {e}")

            # EjecuciÃ³n opcional de la orden
            if auto_execute and signal in ['call', 'put']:
                amount_float = float(amount)
                expiration_int = int(expiration)

                # LÃ­mites de riesgo diarios
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
            logging.error(f"Error al ejecutar estrategia bÃ¡sica: {str(e)}")
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
                    'message': 'No se recibiÃ³ configuraciÃ³n'
                }), 400

            raw_mt = (data.get('iq_market_type') or data.get('iqMarketType') or 'otc')
            iq_mt = str(raw_mt).lower().strip()
            if iq_mt not in ('otc', 'binary'):
                iq_mt = 'otc'

            # Base + todas las claves del cliente (p. ej. serverMotor, filtros de /api/live/start)
            base = {
                'mode': data.get('mode', 'manual'),
                'platform': data.get('platform', 'iqoption'),
                'account_type': data.get('account_type', 'DEMO'),
                'symbols': data.get('symbols', ['EURUSD']),
                'strategies': data.get('strategies', ['ema_rsi']),
                'strategy_id': data.get('strategy_id') or data.get('strategyId'),
                'strategy_param_overrides': data.get('strategy_param_overrides')
                or data.get('strategyParamOverrides'),
                'timeframe': data.get('timeframe', '5m'),
                'analysis_interval': data.get('analysis_interval', 30),
                'max_concurrent_trades': data.get('max_concurrent_trades', 3),
                'trade_amount': data.get('trade_amount', 10),
                'expiration_time': data.get('expiration_time', 5),
                'iq_market_type': iq_mt,
                'marketType': 'OTC' if iq_mt == 'otc' else 'Binarias',
                'risk': data.get('risk', 'medium'),
                'timeframes': data.get('timeframes', ['5m']),
            }
            merged = {**base}
            for k, v in (data or {}).items():
                if k not in merged or v is not None:
                    merged[k] = v
            self.current_config = merged

            try:
                os.makedirs(os.path.dirname(LIVE_UI_SYNC_FILE), exist_ok=True)
                with open(LIVE_UI_SYNC_FILE, 'w', encoding='utf-8') as f:
                    json.dump(merged, f, indent=2, default=str)
            except Exception as werr:
                logging.warning(f"No se pudo escribir {LIVE_UI_SYNC_FILE}: {werr}")

            logging.info(f"ConfiguraciÃ³n guardada: {self.current_config}")

            return jsonify({
                'status': 'success',
                'message': 'ConfiguraciÃ³n guardada exitosamente',
                'config': self.current_config
            })

        except Exception as e:
            logging.error(f"Error al guardar configuraciÃ³n: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Error al guardar configuraciÃ³n: {str(e)}'
            }), 500

    def get_assets(self):
        try:
            # Activos por defecto cuando no hay conexiÃ³n
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

            # Cargar lÃ­mites desde user_config.json si existen
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
                            logging.error("max_daily_trades no es un entero vÃ¡lido en user_config.json")
                    if mda is not None:
                        try:
                            max_daily_amount = float(mda)
                        except Exception:
                            logging.error("max_daily_risk_amount no es un nÃºmero vÃ¡lido en user_config.json")
            except Exception as e:
                logging.error(f"No se pudo leer user_config.json para lÃ­mites de riesgo: {e}")

            # Si no hay lÃ­mite diario configurado, intentar usar config base
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
                    logging.error(f"No se pudo leer config.json para lÃ­mites de riesgo: {e}")

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
                    'message': 'No hay conexiÃ³n activa'
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
                    'message': 'No hay conexiÃ³n activa'
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
                    'message': 'No hay conexiÃ³n activa'
                }), 400

            try:
                try:
                    oid = int(str(order_id).strip())
                except (TypeError, ValueError):
                    return jsonify({
                        'status': 'error',
                        'message': 'order_id invÃ¡lido'
                    }), 400

                raw = self.iq.check_win_v4(oid)
                status_part, profit_part = _unpack_check_win_v4(raw)

                if isinstance(status_part, str) and status_part.lower() in (
                    'pending', 'open', 'active', 'processing'
                ):
                    return jsonify({
                        'status': 'pending',
                        'order_id': order_id,
                        'message': 'Order still active'
                    })

                if status_part is None and profit_part is None:
                    return jsonify({
                        'status': 'pending',
                        'order_id': order_id,
                        'message': 'Order still active'
                    })

                try:
                    profit = float(profit_part) if profit_part is not None else None
                except (TypeError, ValueError):
                    profit = None

                if profit is None:
                    return jsonify({
                        'status': 'pending',
                        'order_id': order_id,
                        'message': 'Esperando PnL del broker'
                    })

                return jsonify({
                    'status': 'closed',
                    'order_id': order_id,
                    'win': profit > 0,
                    'profit': profit,
                    'result': 'win' if profit > 0 else 'loss'
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

    def _ensure_iq_balance_matches_panel(self) -> None:
        """get-positions filtra por user_balance_id; alinear con demo/real del panel."""
        iq = self.iq
        if not iq:
            return
        try:
            acct = str(self.current_account_type or "PRACTICE").upper()
            iq.change_balance("REAL" if acct == "REAL" else "PRACTICE")
            time.sleep(0.12)
        except Exception:
            pass

    def _try_iq_portfolio_get_positions(self, iq, instrument_type: str, limit: int = 80) -> list:
        """Fallback API v3 por si el get-positions clÃ¡sico devuelve vacÃ­o."""
        try:
            iq.api.positions = None
            iq.api.portfolio("sendMessage", "portfolio.get-positions", instrument_type, "", limit, 0)
            deadline = time.time() + 5.0
            while iq.api.positions is None and time.time() < deadline:
                time.sleep(0.02)
            payload = iq.api.positions
            if not isinstance(payload, dict):
                return []
            st = payload.get("status")
            try:
                ok = int(st) == 2000
            except (TypeError, ValueError):
                ok = st in (2000, "2000")
            if not ok:
                return []
            return _iq_positions_msg_to_list(payload.get("msg"))
        except Exception as e:
            logging.debug("portfolio.get-positions %s: %s", instrument_type, e)
            return []

    def _collect_iq_option_open_positions(self):
        """Binarias OTC clÃ¡sicas usan turbo/binary-option; digital-option es otro producto."""
        iq = self.iq
        if not iq or not self.connected:
            return []
        self._ensure_iq_balance_matches_panel()
        merged = []
        seen = set()
        instrument_types = (
            "turbo-option",
            "binary-option",
            "digital-option",
            "blitz-option",
            "fx-option",
            "crypto",
            "forex",
            "cfd",
            "multi-option",
        )
        for it in instrument_types:
            batch = []
            try:
                raw = iq.get_positions(it)
                ok, msg = _unwrap_iq_get_positions_result(raw)
                if ok and msg is not None:
                    batch = _iq_positions_msg_to_list(msg)
            except Exception as e:
                logging.debug("get_positions %s: %s", it, e)
            if not batch:
                try:
                    batch = self._try_iq_portfolio_get_positions(iq, it)
                except Exception as e:
                    logging.debug("portfolio positions %s: %s", it, e)
            for pos in batch:
                if not isinstance(pos, dict):
                    continue
                flat = _flatten_iq_position_row(pos)
                oid = _position_row_id(flat)
                if oid is None:
                    continue
                uid = f"{it}:{oid}"
                if uid in seen:
                    continue
                seen.add(uid)
                merged.append(_normalize_iq_open_position(flat, it))
        return merged

    def get_open_positions(self):
        """Posiciones abiertas en IQ Option (binarias / turbo / digital), normalizadas para el frontend."""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'code': 'BROKER_NOT_CONNECTED',
                    'message': 'No hay conexiÃ³n activa',
                    'positions': [],
                    'count': 0,
                }), 400

            positions = self._collect_iq_option_open_positions()
            total_expected = sum(float(p.get('expected_profit') or 0) for p in positions)
            return jsonify({
                'status': 'success',
                'positions': positions,
                'count': len(positions),
                'total_expected_profit': total_expected,
                'source': 'iqoption',
            })
        except Exception as e:
            logging.error(f'Error get_open_positions: {e}')
            return jsonify({
                'status': 'error',
                'message': str(e),
                'positions': [],
            }), 500

    def sync_with_platform(self):
        """Synchronize local state with platform"""
        try:
            if not self.iq or not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexiÃ³n activa'
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

            # Posiciones abiertas (binarias OTC = turbo-option; antes solo digital-option)
            try:
                sync_data['open_positions'] = self._collect_iq_option_open_positions()
            except Exception as e:
                logging.debug(f'open_positions sync: {e}')

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

