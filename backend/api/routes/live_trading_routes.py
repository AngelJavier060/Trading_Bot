"""
Live Trading API Routes
=======================
Routes for live trading operations with real-time status.

NOTE: Flask must be started with threaded=True (default in dev) for SSE to work —
each SSE client holds an open response stream in its own thread.
"""

import queue as _queue
from flask import Blueprint, Response, stream_with_context, request
from api.controllers.live_trading_controller import live_trading_controller

live_trading_bp = Blueprint('live_trading', __name__)


@live_trading_bp.route('/status', methods=['GET'])
def get_bot_status():
    """Get current bot status."""
    return live_trading_controller.get_bot_status()


@live_trading_bp.route('/start', methods=['POST'])
def start_bot():
    """Start the trading bot."""
    return live_trading_controller.start_bot()


@live_trading_bp.route('/stop', methods=['POST'])
def stop_bot():
    """Stop the trading bot."""
    return live_trading_controller.stop_bot()


@live_trading_bp.route('/scan', methods=['POST'])
def scan_and_analyze():
    """Scan market and analyze for signals."""
    return live_trading_controller.scan_and_analyze()


@live_trading_bp.route('/execute', methods=['POST'])
def execute_trade():
    """Execute a trade with XAI explanation."""
    return live_trading_controller.execute_trade()


@live_trading_bp.route('/complete', methods=['POST'])
def complete_trade():
    """Complete a pending trade."""
    return live_trading_controller.complete_trade()


@live_trading_bp.route('/history', methods=['GET'])
def get_trade_history():
    """Get trade history."""
    return live_trading_controller.get_trade_history()


@live_trading_bp.route('/history/advanced', methods=['GET'])
def get_trade_history_advanced():
    """Get filtered trade history."""
    return live_trading_controller.get_trade_history_advanced()


@live_trading_bp.route('/history/export', methods=['GET'])
def export_trade_history():
    """Export filtered trade history."""
    return live_trading_controller.export_trade_history()


@live_trading_bp.route('/signals', methods=['GET'])
def get_signal_log():
    """Get recent signals."""
    return live_trading_controller.get_signal_log()


@live_trading_bp.route('/loss-analysis', methods=['GET'])
def get_loss_analysis():
    """Get loss pattern analysis."""
    return live_trading_controller.get_loss_analysis()


@live_trading_bp.route('/strategy-ranking', methods=['GET'])
def get_strategy_ranking():
    """Get strategy performance ranking and auto-selected best strategies."""
    return live_trading_controller.get_strategy_ranking()


@live_trading_bp.route('/signals/ignored', methods=['GET'])
def get_ignored_signals():
    """Señales ignoradas con motivo (volatilidad, racha, noticia, etc.)."""
    return live_trading_controller.get_ignored_signals()


@live_trading_bp.route('/daily-progress', methods=['GET'])
def get_daily_progress():
    """Snapshot de PnL diario, racha y estado de pausa para el Dashboard."""
    return live_trading_controller.get_daily_progress()


@live_trading_bp.route('/news/upcoming', methods=['GET'])
def get_upcoming_news():
    """
    Próximas noticias económicas relevantes.
    Fuente preferida: ForexFactory (feed JSON público, cacheado 30 min).
    Fallback automático: calendario heurístico local si la red falla.
    """
    from flask import jsonify
    from services.news_provider import get_upcoming
    try:
        limit = int(request.args.get('limit', 5))
        impact = request.args.get('impact')  # 'high' | 'medium' | None
        prefer_live = request.args.get('prefer_live', '1') not in ('0', 'false', 'False')
        items = get_upcoming(
            limit=max(1, min(limit, 20)),
            impact=impact,
            prefer_live=prefer_live,
        )
        source = items[0].get('source') if items else None
        return jsonify({'status': 'success', 'items': items, 'source': source})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e), 'items': []}), 500


@live_trading_bp.route('/news/refresh', methods=['POST'])
def refresh_news_cache():
    """Invalida el caché del feed para forzar un re-fetch en el próximo GET."""
    from flask import jsonify
    from services.news_provider import invalidate_cache
    invalidate_cache()
    return jsonify({'status': 'success', 'message': 'Caché de noticias invalidado'})


@live_trading_bp.route('/news/status', methods=['GET'])
def news_status():
    """Diagnóstico del caché de noticias (fuente actual, edad, etc.)."""
    from flask import jsonify
    from services.news_provider import get_status
    return jsonify({'status': 'success', **get_status()})


@live_trading_bp.route('/reset-daily', methods=['POST'])
def reset_daily_counters():
    """Reinicia manualmente contadores diarios (con confirmación en UI)."""
    return live_trading_controller.reset_daily_counters()


@live_trading_bp.route('/notifications/telegram/test', methods=['POST'])
def test_telegram():
    """Envía un mensaje de prueba al chat de Telegram configurado."""
    return live_trading_controller.test_telegram()


@live_trading_bp.route('/auto-train', methods=['POST'])
def auto_train_now():
    """Trigger immediate ML retraining."""
    return live_trading_controller.auto_train_now()


@live_trading_bp.route('/trainer-status', methods=['GET'])
def get_trainer_status():
    """Get auto-trainer and ML model status."""
    return live_trading_controller.get_trainer_status()


@live_trading_bp.route('/test', methods=['GET'])
def test():
    """Test route."""
    return {"message": "Live trading routes working", "status": "ok"}


@live_trading_bp.route('/events', methods=['GET'])
def sse_events():
    """
    Server-Sent Events stream — pushes trade_result, balance_update,
    trade_timeout events in real time as IQ Option orders settle.

    Frontend connects once:  new EventSource('/api/live/events')
    """
    from services.trading.sse_service import sse_service

    client_q = sse_service.subscribe()

    def generate():
        try:
            # Initial handshake
            yield "event: connected\ndata: {\"status\": \"ok\"}\n\n"
            while True:
                try:
                    msg = client_q.get(timeout=20)
                    yield msg
                except _queue.Empty:
                    # Keep-alive comment every 20 s so proxies don't close the connection
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            sse_service.unsubscribe(client_q)

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


@live_trading_bp.route('/debug-buy', methods=['GET'])
def debug_buy():
    """
    Diagnostic endpoint — checks IQ Option connection health and asset
    availability WITHOUT placing a real order.

    Query params:
        symbol  (default: EURUSD)
    """
    return live_trading_controller.debug_buy()
