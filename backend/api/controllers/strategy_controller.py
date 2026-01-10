"""
Strategy Controller - Trading Bot
Controlador para gestión de estrategias configurables.
"""

from flask import jsonify, request
from typing import Dict, Any, List
import logging
from datetime import datetime

from database.service import trading_db

logger = logging.getLogger(__name__)


class StrategyController:
    """Controlador para gestión de estrategias de trading."""
    
    def get_all_strategies(self):
        """Obtener todas las estrategias."""
        try:
            active_only = request.args.get('active_only', 'true').lower() == 'true'
            visible_only = request.args.get('visible_only', 'false').lower() == 'true'
            
            strategies = trading_db.get_strategies(active_only, visible_only)
            
            return jsonify({
                'status': 'success',
                'count': len(strategies),
                'strategies': strategies
            })
        except Exception as e:
            logger.error(f"Error obteniendo estrategias: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def get_strategy(self, strategy_name: str):
        """Obtener una estrategia específica."""
        try:
            strategy = trading_db.get_strategy(strategy_name)
            
            if not strategy:
                return jsonify({
                    'status': 'error',
                    'message': f"Estrategia '{strategy_name}' no encontrada"
                }), 404
            
            return jsonify({
                'status': 'success',
                'strategy': strategy
            })
        except Exception as e:
            logger.error(f"Error obteniendo estrategia {strategy_name}: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def create_strategy(self):
        """Crear una nueva estrategia."""
        try:
            data = request.get_json()
            
            if not data or not data.get('name'):
                return jsonify({
                    'status': 'error',
                    'message': 'Nombre de estrategia requerido'
                }), 400
            
            # Verificar que no exista
            existing = trading_db.get_strategy(data['name'])
            if existing:
                return jsonify({
                    'status': 'error',
                    'message': f"La estrategia '{data['name']}' ya existe"
                }), 409
            
            strategy = trading_db.create_strategy(data)
            
            return jsonify({
                'status': 'success',
                'message': 'Estrategia creada exitosamente',
                'strategy': strategy
            }), 201
        except Exception as e:
            logger.error(f"Error creando estrategia: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def update_strategy(self, strategy_id: int):
        """Actualizar una estrategia existente."""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'Datos de actualización requeridos'
                }), 400
            
            save_version = request.args.get('save_version', 'true').lower() == 'true'
            
            strategy = trading_db.update_strategy(strategy_id, data, save_version)
            
            if not strategy:
                return jsonify({
                    'status': 'error',
                    'message': 'Estrategia no encontrada'
                }), 404
            
            return jsonify({
                'status': 'success',
                'message': 'Estrategia actualizada exitosamente',
                'strategy': strategy
            })
        except Exception as e:
            logger.error(f"Error actualizando estrategia {strategy_id}: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def toggle_strategy(self, strategy_id: int):
        """Activar/desactivar una estrategia."""
        try:
            data = request.get_json()
            is_active = data.get('is_active', True) if data else True
            
            strategy = trading_db.toggle_strategy(strategy_id, is_active)
            
            if not strategy:
                return jsonify({
                    'status': 'error',
                    'message': 'Estrategia no encontrada'
                }), 404
            
            return jsonify({
                'status': 'success',
                'message': f"Estrategia {'activada' if is_active else 'desactivada'}",
                'strategy': strategy
            })
        except Exception as e:
            logger.error(f"Error toggleando estrategia {strategy_id}: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def get_top_strategies(self):
        """Obtener las mejores estrategias por rendimiento."""
        try:
            limit = request.args.get('limit', 5, type=int)
            strategies = trading_db.get_top_strategies(limit)
            
            return jsonify({
                'status': 'success',
                'strategies': strategies
            })
        except Exception as e:
            logger.error(f"Error obteniendo top estrategias: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def get_indicator_configs(self):
        """Obtener configuraciones de indicadores."""
        try:
            indicator_name = request.args.get('name')
            configs = trading_db.get_indicator_configs(indicator_name)
            
            return jsonify({
                'status': 'success',
                'count': len(configs),
                'indicators': configs
            })
        except Exception as e:
            logger.error(f"Error obteniendo indicadores: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def create_indicator_config(self):
        """Crear configuración de indicador."""
        try:
            data = request.get_json()
            
            if not data or not data.get('name') or not data.get('parameters'):
                return jsonify({
                    'status': 'error',
                    'message': 'Nombre y parámetros requeridos'
                }), 400
            
            config = trading_db.create_indicator_config(data)
            
            return jsonify({
                'status': 'success',
                'message': 'Configuración de indicador creada',
                'indicator': config
            }), 201
        except Exception as e:
            logger.error(f"Error creando indicador: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def update_indicator_config(self, config_id: int):
        """Actualizar configuración de indicador."""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'Datos de actualización requeridos'
                }), 400
            
            config = trading_db.update_indicator_config(config_id, data)
            
            if not config:
                return jsonify({
                    'status': 'error',
                    'message': 'Configuración no encontrada'
                }), 404
            
            return jsonify({
                'status': 'success',
                'message': 'Configuración actualizada',
                'indicator': config
            })
        except Exception as e:
            logger.error(f"Error actualizando indicador {config_id}: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500


class ConfigController:
    """Controlador para configuración del robot."""
    
    def get_robot_config(self):
        """Obtener configuración actual del robot."""
        try:
            config_name = request.args.get('name', 'default')
            config = trading_db.get_robot_config(config_name)
            
            if not config:
                return jsonify({
                    'status': 'error',
                    'message': 'Configuración no encontrada'
                }), 404
            
            return jsonify({
                'status': 'success',
                'config': config
            })
        except Exception as e:
            logger.error(f"Error obteniendo configuración: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def save_robot_config(self):
        """Guardar configuración del robot."""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'Datos de configuración requeridos'
                }), 400
            
            config_name = data.pop('config_name', 'default')
            config = trading_db.save_robot_config(data, config_name)
            
            return jsonify({
                'status': 'success',
                'message': 'Configuración guardada exitosamente',
                'config': config
            })
        except Exception as e:
            logger.error(f"Error guardando configuración: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def update_robot_config(self):
        """Actualizar configuración parcialmente."""
        try:
            data = request.get_json()
            
            if not data:
                return jsonify({
                    'status': 'error',
                    'message': 'Datos de actualización requeridos'
                }), 400
            
            config_name = data.pop('config_name', 'default')
            config = trading_db.update_robot_config(data, config_name)
            
            if not config:
                return jsonify({
                    'status': 'error',
                    'message': 'Configuración no encontrada'
                }), 404
            
            return jsonify({
                'status': 'success',
                'message': 'Configuración actualizada',
                'config': config
            })
        except Exception as e:
            logger.error(f"Error actualizando configuración: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def get_performance_stats(self):
        """Obtener estadísticas de rendimiento."""
        try:
            platform = request.args.get('platform')
            account_type = request.args.get('account_type')
            symbol = request.args.get('symbol')
            strategy = request.args.get('strategy')
            days = request.args.get('days', type=int)
            
            stats = trading_db.get_trade_stats(
                platform=platform,
                account_type=account_type,
                symbol=symbol,
                strategy=strategy,
                days=days
            )
            
            return jsonify({
                'status': 'success',
                'stats': stats
            })
        except Exception as e:
            logger.error(f"Error obteniendo estadísticas: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def get_daily_performance(self):
        """Obtener rendimiento diario."""
        try:
            date_str = request.args.get('date')
            date = datetime.fromisoformat(date_str) if date_str else None
            
            performance = trading_db.get_daily_performance(date)
            
            return jsonify({
                'status': 'success',
                'performance': performance
            })
        except Exception as e:
            logger.error(f"Error obteniendo rendimiento diario: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    def get_signal_accuracy(self):
        """Obtener precisión de señales."""
        try:
            strategy = request.args.get('strategy')
            accuracy = trading_db.get_signal_accuracy(strategy)
            
            return jsonify({
                'status': 'success',
                'accuracy': accuracy
            })
        except Exception as e:
            logger.error(f"Error obteniendo precisión de señales: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500


# Instancias de controladores
strategy_controller = StrategyController()
config_controller = ConfigController()
