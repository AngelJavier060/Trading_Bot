from flask import Blueprint, request, jsonify
import logging
from services.data import unified_data_service

data_bp = Blueprint('data', __name__)
logger = logging.getLogger(__name__)


@data_bp.route('/candles', methods=['GET'])
def get_candles():
    try:
        symbol = request.args.get('symbol')
        timeframe = request.args.get('timeframe', '5m')
        count = int(request.args.get('count') or request.args.get('n_candles') or 500)
        platform = request.args.get('platform')

        if not symbol:
            return jsonify({'status': 'error', 'message': 'Símbolo es requerido'}), 400

        # Sync from real broker sessions if available (prevents demo fallback when IQ is connected)
        try:
            unified_data_service.sync_from_trading_service()
        except Exception:
            pass

        # Ensure connection or connect to demo
        if platform:
            if platform == 'demo' and not unified_data_service.is_connected('demo'):
                unified_data_service.connect('demo', {})
            elif not unified_data_service.is_connected(platform):
                return jsonify({'status': 'error', 'message': f'No hay conexión activa con {platform}'}), 400
            df = unified_data_service.get_candles(symbol, timeframe, count, platform=platform)
        else:
            # If no platform specified, prefer real broker session; only fallback to demo if none connected
            if not unified_data_service.is_connected():
                unified_data_service.connect('demo', {})
            df = unified_data_service.get_candles(symbol, timeframe, count)

        return jsonify({
            'status': 'success',
            'data': df.to_dict(orient='records')
        })
    except Exception as e:
        logger.error(f"Error en /api/data/candles: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
