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

# No hay servidor predeterminado — el broker lo aporta el usuario en cada conexión.
# Ejemplos comunes: 'AdmiralsSC-Demo', 'ICMarkets-Demo02', 'Pepperstone-Demo', etc.

class MT5Controller:
    def __init__(self):
        self.current_account = None
        
    @property
    def connected(self) -> bool:
        return trading_service.get_mt5() is not None

    @validate_schema(ConnectSchema)
    def connect(self, validated_data: ConnectSchema):
        try:
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

            if not credentials.server:
                return jsonify({
                    'status': 'error',
                    'message': 'El campo "server" es obligatorio. Consulta el nombre exacto del servidor en tu terminal MT5 (Herramientas → Opciones → Servidor).'
                }), 400
            server = credentials.server
            
            logging.info(f"MT5 connecting to server: {server} with login: {login}")
            
            import glob

            initialized = mt5.initialize()
            attempted_paths = []

            # 1) Try user-supplied path first
            if not initialized and credentials.terminal_path and os.path.exists(credentials.terminal_path):
                attempted_paths.append(credentials.terminal_path)
                try:
                    if mt5.initialize(path=credentials.terminal_path):
                        initialized = True
                        logging.info(f"MT5 initialized using custom terminal at: {credentials.terminal_path}")
                except Exception:
                    pass

            # 2) Try known broker paths
            if not initialized:
                common_paths = [
                    # Generic
                    r"C:\Program Files\MetaTrader 5\terminal64.exe",
                    r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe",
                    # Pepperstone
                    r"C:\Program Files\Pepperstone MetaTrader 5\terminal64.exe",
                    r"C:\Program Files\Pepperstone MT5\terminal64.exe",
                    r"C:\Program Files (x86)\Pepperstone MetaTrader 5\terminal64.exe",
                    # Admirals / Admiral Markets
                    r"C:\Program Files\Admirals MetaTrader 5\terminal64.exe",
                    r"C:\Program Files\Admiral Markets MetaTrader 5\terminal64.exe",
                    r"C:\Program Files\Admiral Markets MT5\terminal64.exe",
                    # IC Markets
                    r"C:\Program Files\ICMarkets MetaTrader 5\terminal64.exe",
                    r"C:\Program Files\IC Markets MetaTrader 5\terminal64.exe",
                    # XM
                    r"C:\Program Files\XM Global MT5\terminal64.exe",
                    r"C:\Program Files\XM MT5\terminal64.exe",
                    # FTMO
                    r"C:\Program Files\FTMO MetaTrader 5\terminal64.exe",
                    # Others
                    r"C:\Program Files\Exness MT5\terminal64.exe",
                    r"C:\Program Files\HFM MetaTrader 5\terminal64.exe",
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

            # 3) Glob scan across all Program Files subfolders
            if not initialized:
                for search_root in [
                    r"C:\Program Files",
                    r"C:\Program Files (x86)",
                ]:
                    pattern = os.path.join(search_root, "*MetaTrader*", "terminal64.exe")
                    for found in glob.glob(pattern, recursive=False):
                        if found in attempted_paths:
                            continue
                        attempted_paths.append(found)
                        try:
                            if mt5.initialize(path=found):
                                initialized = True
                                logging.info(f"MT5 auto-discovered terminal at: {found}")
                                break
                        except Exception:
                            pass
                    if initialized:
                        break

            if not initialized:
                last_err = mt5.last_error() if hasattr(mt5, 'last_error') else ('unknown', 'unknown')
                return jsonify({
                    'status': 'error',
                    'message': (
                        'No se pudo inicializar MetaTrader 5. '
                        'Verifica que: (1) el terminal MT5 de Pepperstone esté instalado y ABIERTO, '
                        '(2) la ruta del terminal sea correcta. '
                        f'Error MT5: {last_err}'
                    ),
                    'last_error': str(last_err),
                    'attempted_paths': attempted_paths
                }), 500

            # Check if terminal is already logged in (common when terminal is running)
            account_info = mt5.account_info()
            already_logged_in = (
                account_info is not None and
                account_info.login == login
            )

            if not already_logged_in:
                authorized = mt5.login(login=login, password=password, server=server)

                if not authorized:
                    login_err = mt5.last_error()
                    # (1, 'Success') means the terminal is connected but login() returned
                    # False because it was already authenticated — re-check account_info
                    if login_err[0] == 1:
                        account_info = mt5.account_info()
                        if account_info is None:
                            mt5.shutdown()
                            return jsonify({
                                'status': 'error',
                                'message': (
                                    'El terminal MT5 está conectado pero no se pudo obtener '
                                    'la información de la cuenta. '
                                    'Verifica que estés logueado con la cuenta correcta en el terminal.'
                                )
                            }), 401
                        # account_info exists — terminal is connected under a different account
                        logging.warning(
                            f"MT5 login() returned False but terminal is logged in as "
                            f"{account_info.login} (requested: {login})"
                        )
                        if account_info.login != login:
                            mt5.shutdown()
                            return jsonify({
                                'status': 'error',
                                'message': (
                                    f'El terminal MT5 está logueado con la cuenta {account_info.login}, '
                                    f'no con la cuenta solicitada {login}. '
                                    f'Cierra el terminal, ábrelo de nuevo e inicia sesión con la cuenta correcta.'
                                )
                            }), 401
                    else:
                        mt5.shutdown()
                        return jsonify({
                            'status': 'error',
                            'message': (
                                f'Error de autorización: {login_err}. '
                                f'Verifica tus credenciales y el servidor ({server}).'
                            )
                        }), 401
                else:
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

            trading_service.set_mt5(self.current_account)

            return jsonify({
                'status': 'connected',
                'message': f'Conexión exitosa con {server} ({self.current_account["account_type"]})',
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
            if MT5_AVAILABLE and mt5 is not None:
                try:
                    mt5.shutdown()
                except Exception:
                    pass
            trading_service.disconnect_all()
            self.current_account = None
            return jsonify({'status': 'success', 'message': 'Desconexión exitosa'})
        except Exception as e:
            logging.error(f"Error al desconectar: {str(e)}")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def get_status(self):
        """Return MT5 connection status with live balance refresh."""
        try:
            session = trading_service.get_mt5()
            if not session:
                return jsonify({'status': 'disconnected', 'connected': False})

            if MT5_AVAILABLE and mt5 is not None:
                try:
                    info = mt5.account_info()
                    if info is not None:
                        self.current_account = {
                            'login': info.login,
                            'server': info.server,
                            'balance': info.balance,
                            'equity': info.equity,
                            'margin': info.margin,
                            'free_margin': info.margin_free,
                            'leverage': info.leverage,
                            'currency': info.currency,
                            'account_type': session.get('account_type', 'DEMO'),
                        }
                        trading_service.set_mt5(self.current_account)
                        session = self.current_account
                except Exception as e:
                    logging.warning(f"Could not refresh MT5 live data: {e}")

            return jsonify({
                'status': 'connected',
                'connected': True,
                'platform': 'mt5',
                'accountInfo': session
            })
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def get_account_info(self):
        """Return live account info from MT5 terminal."""
        return self.get_status()

    def get_open_trades(self):
        """Return currently open positions with real-time P&L."""
        try:
            if not self.connected:
                return jsonify({'status': 'error', 'message': 'No hay conexión activa'}), 400
            if not MT5_AVAILABLE or mt5 is None:
                return jsonify({'status': 'error', 'message': 'MT5 no disponible'}), 500

            positions = mt5.positions_get()
            if positions is None:
                return jsonify({'status': 'success', 'positions': [], 'total_pnl': 0.0})

            result = []
            for p in positions:
                result.append({
                    'ticket': p.ticket,
                    'symbol': p.symbol,
                    'type': 'buy' if p.type == 0 else 'sell',
                    'volume': p.volume,
                    'open_price': p.price_open,
                    'current_price': p.price_current,
                    'profit': p.profit,
                    'swap': p.swap,
                    'comment': p.comment,
                    'open_time': str(p.time),
                })
            total_pnl = sum(p['profit'] for p in result)
            return jsonify({'status': 'success', 'positions': result, 'total_pnl': total_pnl})
        except Exception as e:
            logging.error(f"Error al obtener posiciones MT5: {str(e)}")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def get_symbols(self):
        try:
            if not self.connected:
                return jsonify({'status': 'error', 'message': 'No hay conexión activa'}), 400

            symbols = mt5.symbols_get()
            symbols_list = [symbol.name for symbol in symbols]
            return jsonify({'status': 'success', 'symbols': symbols_list})
        except Exception as e:
            logging.error(f"Error al obtener símbolos: {str(e)}")
            return jsonify({'status': 'error', 'message': str(e)}), 500

    def get_historical_data(self):
        try:
            if not self.connected:
                return jsonify({'status': 'error', 'message': 'No hay conexión activa'}), 400

            data = request.args
            symbol = data.get('symbol')
            timeframe = data.get('timeframe', '1h')
            n_candles = int(data.get('n_candles', 1000))

            if not symbol:
                return jsonify({'error': 'Símbolo es requerido'}), 400

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

            # Some brokers list synthetic/OTC pairs that don't exist in MT5 at
            # all (e.g. EURUSD-OTC). Trying to query them with copy_rates raises
            # a generic error and floods the browser console with 500s. Treat
            # symbols that are not visible in this terminal as "no data" rather
            # than as a server error.
            try:
                info = mt5.symbol_info(symbol)
            except Exception:
                info = None
            if info is None:
                return jsonify({
                    'status': 'success',
                    'data': [],
                    'message': f'Símbolo {symbol} no disponible en este broker MT5',
                })
            if not getattr(info, 'visible', False):
                try:
                    mt5.symbol_select(symbol, True)
                except Exception:
                    pass

            rates = mt5.copy_rates_from_pos(symbol, tf, 0, n_candles)
            
            if rates is None or len(rates) == 0:
                # Empty dataset → still a successful HTTP response so the front
                # end can fall back gracefully without a 500.
                return jsonify({
                    'status': 'success',
                    'data': [],
                    'message': f'Sin velas para {symbol}: {mt5.last_error() if rates is None else "vacío"}',
                })

            df = pd.DataFrame(rates)
            df['time'] = pd.to_datetime(df['time'], unit='s')
            return jsonify({'status': 'success', 'data': df.to_dict('records')})

        except Exception as e:
            logging.error(f"Error al obtener datos históricos: {str(e)}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
