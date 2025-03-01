from flask import jsonify, request
import logging
from datetime import datetime
import MetaTrader5 as mt5
import pandas as pd

# Ejemplo de configuración para Admiral Markets
ADMIRAL_SERVERS = {
    'demo': 'AdmiralMarkets-Demo',
    'real': 'AdmiralMarkets-Live'
}

class MT5Controller:
    def __init__(self):
        self.connected = False
        self.current_account = None
        
    def connect(self):
        try:
            data = request.json
            credentials = data.get('credentials', {})
            
            login = int(credentials.get('login'))
            password = credentials.get('password')
            is_demo = credentials.get('is_demo', True)
            
            server = ADMIRAL_SERVERS['demo'] if is_demo else ADMIRAL_SERVERS['real']
            
            if not all([login, password]):
                return jsonify({'error': 'Credenciales incompletas'}), 400

            # Verificar si MT5 está instalado
            if not mt5.__file__:
                return jsonify({
                    'status': 'error',
                    'message': 'MetaTrader 5 no está instalado. Por favor, instálalo primero.'
                }), 500

            # Inicializar MT5
            if not mt5.initialize():
                return jsonify({
                    'status': 'error',
                    'message': 'Error al inicializar MT5. Asegúrate de que esté instalado correctamente.'
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
                    'message': f'Error de autorización: {mt5.last_error()}. Verifica tus credenciales y el servidor.'
                }), 401

            # Obtener información de la cuenta
            account_info = mt5.account_info()
            if account_info is None:
                mt5.shutdown()
                return jsonify({
                    'status': 'error',
                    'message': 'No se pudo obtener información de la cuenta'
                }), 500

            self.connected = True
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

            return jsonify({
                'status': 'connected',
                'message': f'Conexión exitosa con Admiral Markets ({self.current_account["account_type"]})',
                'accountInfo': self.current_account
            })

        except Exception as e:
            logging.error(f"Error en la conexión MT5: {str(e)}")
            if mt5.initialize():
                mt5.shutdown()
            return jsonify({
                'status': 'error',
                'message': f'Error al conectar: {str(e)}'
            }), 500

    def disconnect(self):
        try:
            if mt5.initialize():
                mt5.shutdown()
            self.connected = False
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

    def get_historical_data(self, symbol, timeframe, n_candles=1000):
        try:
            if not self.connected:
                return jsonify({
                    'status': 'error',
                    'message': 'No hay conexión activa'
                }), 400

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