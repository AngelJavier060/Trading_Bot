from flask import jsonify, request
import logging
from datetime import datetime
import pandas as pd
import os
from services.trading_service import trading_service
from api.utils.validators import validate_schema
from models.schemas import ConnectSchema

# Try to import MetaTrader5, handle if not installed
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False
    logging.warning("MetaTrader5 module not installed - MT5 features will be disabled")

# Ejemplo de configuración para Admiral Markets
ADMIRAL_SERVERS = {
    'demo': 'AdmiralMarkets-Demo',
    'real': 'AdmiralMarkets-Live'
}

class MT5Controller:
    def __init__(self):
        self.current_account = None
        
    @property
    def connected(self) -> bool:
        return trading_service.get_mt5() is not None

    @validate_schema(ConnectSchema)
    def connect(self, validated_data: ConnectSchema):
        try:
            # Check if MT5 is available
            if not MT5_AVAILABLE or mt5 is None:
                return jsonify({
                    'status': 'error',
                    'message': 'MetaTrader5 no está instalado. Instala con: pip install MetaTrader5'
                }), 500
            
            credentials = validated_data.credentials
            
            login = credentials.login
            password = credentials.password
            is_demo = validated_data.is_demo
            
            if login is None or not password:
                return jsonify({'error': 'Credenciales incompletas (login y password requeridos)'}), 400

            # Use custom server from request, or fallback to default Admiral servers
            if credentials.server:
                server = credentials.server
            else:
                server = ADMIRAL_SERVERS['demo'] if is_demo else ADMIRAL_SERVERS['real']
            
            logging.info(f"MT5 connecting to server: {server} with login: {login}")
            
            # Inicializar MT5 (con fallback a rutas comunes de terminal)
            initialized = mt5.initialize()
            attempted_paths = []
            
            # Try custom terminal path if provided
            if not initialized and credentials.terminal_path and os.path.exists(credentials.terminal_path):
                attempted_paths.append(credentials.terminal_path)
                try:
                    if mt5.initialize(path=credentials.terminal_path):
                        initialized = True
                        logging.info(f"MT5 initialized using custom terminal at: {credentials.terminal_path}")
                except Exception:
                    pass
            
            # Try common paths if still not initialized
            if not initialized:
                common_paths = [
                    r"C:\\Program Files\\MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files (x86)\\MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files\\Admiral Markets MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files\\Admirals MetaTrader 5\\terminal64.exe",
                    r"C:\\Program Files\\Admiral Markets MT5\\terminal64.exe",
                ]
                for path in common_paths:
                    if os.path.exists(path):
                        attempted_paths.append(path)
                        try:
                            if mt5.initialize(path=path):
                                initialized = True
                                logging.info(f"MT5 initialized using terminal at: {path}")
                                break
                        except Exception:
                            pass
            
            if not initialized:
                last_err = mt5.last_error() if hasattr(mt5, 'last_error') else ('unknown', 'unknown')
                return jsonify({
                    'status': 'error',
                    'message': 'No se pudo inicializar MetaTrader 5. Verifica que el terminal esté instalado y abierto.',
                    'last_error': str(last_err),
                    'attempted_paths': attempted_paths
                }), 500

            # Intentar login con Admiral Markets
            authorized = mt5.login(
                login=login,
                password=password,
                server=server
            )
            
            if not authorized:
                mt5.shutdown()
                return jsonify({
                    'status': 'error',
                    'message': f'Error de autorización: {mt5.last_error()}. Verifica tus credenciales y el servidor ({server}).'
                }), 401

            # Obtener información de la cuenta
            account_info = mt5.account_info()
            if account_info is None:
                mt5.shutdown()
                return jsonify({
                    'status': 'error',
                    'message': 'No se pudo obtener información de la cuenta'
                }), 500

            self.current_account = {
                'login': login,
                'server': server,
                'balance': account_info.balance,
                'equity': account_info.equity,
                'margin': account_info.margin,
                'free_margin': account_info.margin_free,
                'leverage': account_info.leverage,
                'currency': account_info.currency,
                'account_type': 'DEMO' if is_demo else 'REAL'
            }

            # Guardar en el servicio centralizado
            trading_service.set_mt5(self.current_account)

            return jsonify({
                'status': 'connected',
                'message': f'Conexión exitosa con Admiral Markets ({self.current_account["account_type"]})',
                'accountInfo': self.current_account
            })

        except Exception as e:
            logging.error(f"Error en la conexión MT5: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Error al conectar: {str(e)}'
            }), 500

    def disconnect(self):
        try:
            trading_service.disconnect_all()
            self.current_account = None
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

    def get_symbols(self):
        try:
            if not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            symbols = mt5.symbols_get()
            symbols_list = [symbol.name for symbol in symbols]
            
            return jsonify({
                'status': 'success',
                'symbols': symbols_list
            })
        except Exception as e:
            logging.error(f"Error al obtener símbolos: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def get_historical_data(self):
        try:
            if not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

            data = request.args
            symbol = data.get('symbol')
            timeframe = data.get('timeframe', '1h')
            n_candles = int(data.get('n_candles', 1000))

            if not symbol:
                return jsonify({'error': 'Símbolo es requerido'}), 400

            # Mapeo de timeframes
            timeframe_map = {
                '1m': mt5.TIMEFRAME_M1,
                '5m': mt5.TIMEFRAME_M5,
                '15m': mt5.TIMEFRAME_M15,
                '30m': mt5.TIMEFRAME_M30,
                '1h': mt5.TIMEFRAME_H1,
                '4h': mt5.TIMEFRAME_H4,
                '1d': mt5.TIMEFRAME_D1,
            }

            tf = timeframe_map.get(timeframe, mt5.TIMEFRAME_H1)
            rates = mt5.copy_rates_from_pos(symbol, tf, 0, n_candles)
            
            if rates is None:
                return jsonify({
                    'status': 'error',
                    'message': f'Error al obtener datos: {mt5.last_error()}'
                }), 500

            # Convertir a DataFrame
            df = pd.DataFrame(rates)
            df['time'] = pd.to_datetime(df['time'], unit='s')
            
            return jsonify({
                'status': 'success',
                'data': df.to_dict('records')
            })

        except Exception as e:
            logging.error(f"Error al obtener datos históricos: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500