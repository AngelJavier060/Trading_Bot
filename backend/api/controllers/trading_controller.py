from flask import jsonify, request
from iqoptionapi.stable_api import IQ_Option
import logging
from datetime import datetime

class TradingController:
    def __init__(self):
        self.iq = None
        self.connected = False
        self.current_account_type = "PRACTICE"
        self.last_check = None
        self.current_config = None

    def connect(self):
        try:
            data = request.json
            credentials = data.get('credentials', {})
            account_type = data.get('account_type', 'PRACTICE')
            
            email = credentials.get('email')
            password = credentials.get('password')

            if not email or not password:
                return jsonify({'error': 'Credenciales incompletas'}), 400

            # Crear nueva instancia de IQ_Option
            self.iq = IQ_Option(email, password)
            
            # Intentar conexión
            status, reason = self.iq.connect()
            
            if status:
                # Cambiar a cuenta demo/real según corresponda
                if account_type == "REAL":
                    self.iq.change_balance('REAL')
                else:
                    self.iq.change_balance('PRACTICE')
                
                self.connected = True
                self.current_account_type = account_type
                self.last_check = datetime.now()

                # Obtener información de la cuenta
                balance = self.iq.get_balance()
                currency = self.iq.get_currency()

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
            if not self.connected or not self.iq:
                return jsonify({
                    'status': 'disconnected',
                    'message': 'No hay conexión activa'
                })

            # Verificar si la conexión sigue activa
            if self.iq.check_connect():
                balance = self.iq.get_balance()
                return jsonify({
                    'status': 'connected',
                    'message': 'Conexión activa',
                    'accountInfo': {
                        'account_type': self.current_account_type,
                        'balance': balance
                    }
                })
            else:
                self.connected = False
                return jsonify({
                    'status': 'disconnected',
                    'message': 'Conexión perdida'
                })

        except Exception as e:
            logging.error(f"Error al verificar conexión: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def disconnect(self):
        try:
            if self.iq:
                self.iq.disconnect()
                self.iq = None
                self.connected = False
                self.last_check = None
                return jsonify({
                    'status': 'success',
                    'message': 'Desconexión exitosa'
                })
            return jsonify({
                'status': 'warning',
                'message': 'No había conexión activa'
            })
        except Exception as e:
            logging.error(f"Error al desconectar: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

    def save_config(self):
        try:
            data = request.json
            
            # Validar datos requeridos
            required_fields = ['platform', 'marketType', 'risk', 'timeframes', 'strategies']
            for field in required_fields:
                if field not in data:
                    return jsonify({
                        'status': 'error',
                        'message': f'Campo requerido faltante: {field}'
                    }), 400

            # Aquí puedes agregar la lógica para guardar en una base de datos
            # Por ahora solo guardamos en memoria
            self.current_config = data

            return jsonify({
                'status': 'success',
                'message': 'Configuración guardada exitosamente',
                'config': data
            })

        except Exception as e:
            logging.error(f"Error al guardar configuración: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'Error al guardar configuración: {str(e)}'
            }), 500
