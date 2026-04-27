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

        # Asegurar conexión o demo. Si se pide `platform=iqoption|mt5` y este worker
        # no tiene sesión (típico: Gunicorn multi-proceso, login en otro worker), no
        # devolver 400: misma lógica que sin ?platform= (sync + activo o demo).
        degraded = False
        degraded_requested_platform = None
        if platform:
            pl = platform.lower()
            if pl == 'demo' and not unified_data_service.is_connected('demo'):
                unified_data_service.connect('demo', {})
            if unified_data_service.is_connected(pl):
                df = unified_data_service.get_candles(symbol, timeframe, count, platform=pl)
            else:
                if pl in ('iqoption', 'mt5'):
                    degraded = True
                    degraded_requested_platform = pl
                logger.info(
                    'candles: broker %s no conectado en este proceso; usando activo/demo',
                    pl,
                )
                if not unified_data_service.is_connected():
                    unified_data_service.connect('demo', {})
                df = unified_data_service.get_candles(symbol, timeframe, count)
        else:
            # If no platform specified, prefer real broker session; only fallback to demo if none connected
            if not unified_data_service.is_connected():
                unified_data_service.connect('demo', {})
            df = unified_data_service.get_candles(symbol, timeframe, count)

        payload = {
            'status': 'success',
            'data': df.to_dict(orient='records'),
            'degraded': degraded,
        }
        if degraded:
            payload['requested_platform'] = degraded_requested_platform
            payload['degraded_message'] = (
                'El bróker solicitado no está conectado en este servidor (p. ej. otro proceso '
                'en producción). Se muestran velas del proveedor disponible (activo o demo).'
            )
        return jsonify(payload)
    except Exception as e:
        logger.error(f"Error en /api/data/candles: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
