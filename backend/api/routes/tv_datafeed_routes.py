"""
TradingView Advanced Charts datafeed (UDF protocol).

Implements the minimum endpoints the Charting Library expects so the
front-end widget can render live candles and react to streaming updates
without depending on TradingView's hosted feed.

Reference: https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import pandas as pd
from flask import Blueprint, jsonify, request

from services.data import unified_data_service

logger = logging.getLogger(__name__)

tv_bp = Blueprint('tv_datafeed', __name__)

# Mapping from TradingView resolution codes to internal timeframe strings.
_RESOLUTION_MAP: Dict[str, str] = {
    '1':   '1m',
    '3':   '3m',
    '5':   '5m',
    '15':  '15m',
    '30':  '30m',
    '60':  '1h',
    '120': '2h',
    '240': '4h',
    '720': '12h',
    'D':   '1d',
    '1D':  '1d',
    'W':   '1w',
    '1W':  '1w',
}

_SUPPORTED_RESOLUTIONS = list(_RESOLUTION_MAP.keys())


def _normalize_resolution(resolution: Optional[str]) -> str:
    """Translate a TV resolution code into the backend timeframe string."""
    if not resolution:
        return '5m'
    return _RESOLUTION_MAP.get(resolution, _RESOLUTION_MAP.get(resolution.upper(), '5m'))


def _detect_pricescale(symbol: str) -> int:
    """Heuristic price scale (number of decimal places * 10^n) for a symbol."""
    s = symbol.upper().replace('-OTC', '')
    if 'JPY' in s:
        return 1000          # 3 decimals
    if any(c in s for c in ('BTC', 'ETH', 'XAU', 'XAG')):
        return 100           # 2 decimals
    return 100000            # 5 decimals (most FX pairs)


def _ensure_data_provider(preferred: Optional[str] = None) -> Optional[str]:
    """Make sure there's a usable data provider, preferring the one requested.

    Returns the platform name we'll actually query, or None if nothing is
    connected (the caller should bail out gracefully in that case).
    """
    try:
        unified_data_service.sync_from_trading_service()
    except Exception:
        pass
    if preferred:
        try:
            if unified_data_service.is_connected(preferred):
                return preferred
        except Exception:
            pass
    try:
        if unified_data_service.is_connected():
            return None  # active provider already; let get_candles pick it
    except Exception:
        pass
    try:
        unified_data_service.connect('demo', {})
        return 'demo'
    except Exception as exc:
        logger.warning('No se pudo conectar al data provider demo: %s', exc)
        return None


# ──────────────────────────────────────────────────────────────────────────────
# UDF endpoints
# ──────────────────────────────────────────────────────────────────────────────

@tv_bp.route('/config', methods=['GET'])
def config():
    """Capabilities advertised to the TradingView widget."""
    return jsonify({
        'supported_resolutions': _SUPPORTED_RESOLUTIONS,
        'supports_search': True,
        'supports_group_request': False,
        'supports_marks': False,
        'supports_timescale_marks': False,
        'supports_time': True,
        'exchanges': [
            {'value': '',          'name': 'All Exchanges', 'desc': ''},
            {'value': 'IQ_OPTION', 'name': 'IQ Option',     'desc': 'IQ Option binary/digital'},
            {'value': 'MT5',       'name': 'MetaTrader 5',  'desc': 'MetaTrader 5 broker feed'},
        ],
        'symbols_types': [
            {'name': 'All types', 'value': ''},
            {'name': 'Forex',     'value': 'forex'},
            {'name': 'Crypto',    'value': 'crypto'},
        ],
    })


@tv_bp.route('/time', methods=['GET'])
def server_time():
    """Server time in Unix seconds. The widget uses it to align bars."""
    return str(int(time.time())), 200, {'Content-Type': 'text/plain'}


@tv_bp.route('/symbols', methods=['GET'])
def resolve_symbol():
    """Symbol metadata. Called once when the widget loads a symbol."""
    symbol = (request.args.get('symbol') or '').strip()
    if not symbol:
        return jsonify({'s': 'error', 'errmsg': 'Symbol is required'}), 400
    is_otc = symbol.upper().endswith('-OTC')
    base = symbol.replace('-OTC', '').replace('-otc', '')
    info = {
        'name':                symbol,
        'ticker':              symbol,
        'full_name':           f"IQ_OPTION:{symbol}" if is_otc else base,
        'description':         f"{base}{' OTC' if is_otc else ''}",
        'type':                'forex' if not is_otc else 'forex',
        'session':             '24x7',
        'timezone':            'America/New_York',
        'exchange':            'IQ_OPTION' if is_otc else 'FX',
        'listed_exchange':     'IQ_OPTION' if is_otc else 'FX',
        'minmov':              1,
        'pricescale':          _detect_pricescale(symbol),
        'has_intraday':        True,
        'has_no_volume':       True,
        'has_weekly_and_monthly': False,
        'has_seconds':         False,
        'supported_resolutions': _SUPPORTED_RESOLUTIONS,
        'volume_precision':    0,
        'data_status':         'streaming',
        'currency_code':       base[-3:] if len(base) >= 3 else '',
    }
    return jsonify(info)


@tv_bp.route('/search', methods=['GET'])
def search_symbols():
    """Symbol search. Returns a small static list filtered by the query."""
    query = (request.args.get('query') or '').upper()
    static_universe: List[Dict[str, Any]] = [
        {'symbol': 'EURUSD',     'description': 'Euro / US Dollar'},
        {'symbol': 'GBPUSD',     'description': 'British Pound / US Dollar'},
        {'symbol': 'USDJPY',     'description': 'US Dollar / Japanese Yen'},
        {'symbol': 'AUDUSD',     'description': 'Australian Dollar / US Dollar'},
        {'symbol': 'EURUSD-OTC', 'description': 'EURUSD OTC (IQ Option)'},
        {'symbol': 'GBPUSD-OTC', 'description': 'GBPUSD OTC (IQ Option)'},
        {'symbol': 'USDJPY-OTC', 'description': 'USDJPY OTC (IQ Option)'},
        {'symbol': 'EURJPY-OTC', 'description': 'EURJPY OTC (IQ Option)'},
        {'symbol': 'NZDUSD-OTC', 'description': 'NZDUSD OTC (IQ Option)'},
    ]
    matches = [
        {
            'symbol':           u['symbol'],
            'full_name':        u['symbol'],
            'description':      u['description'],
            'exchange':         'IQ_OPTION' if 'OTC' in u['symbol'] else 'FX',
            'ticker':           u['symbol'],
            'type':             'forex',
        }
        for u in static_universe
        if not query or query in u['symbol']
    ][:30]
    return jsonify(matches)


@tv_bp.route('/history', methods=['GET'])
def history():
    """Historical bars between `from` and `to` for the given resolution."""
    symbol = (request.args.get('symbol') or '').strip()
    resolution = request.args.get('resolution') or '5'
    try:
        from_ts = int(request.args.get('from') or 0)
        to_ts = int(request.args.get('to') or int(time.time()))
    except ValueError:
        return jsonify({'s': 'error', 'errmsg': 'invalid timestamps'}), 400
    countback = request.args.get('countback')

    if not symbol:
        return jsonify({'s': 'error', 'errmsg': 'symbol is required'}), 400

    timeframe = _normalize_resolution(resolution)

    # Approximate how many bars cover the requested window so the provider has
    # enough history.  countback (when sent) takes precedence – TradingView uses
    # it to ask for a fixed number of trailing bars.
    seconds_per_bar = {
        '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
        '1h': 3600, '2h': 7200, '4h': 14400, '12h': 43200,
        '1d': 86400, '1w': 604800,
    }.get(timeframe, 300)
    requested_window = max(0, to_ts - from_ts)
    needed = (requested_window // seconds_per_bar) + 5
    if countback:
        try:
            needed = max(needed, int(countback))
        except ValueError:
            pass
    needed = max(50, min(int(needed), 5000))

    requested_platform = (request.args.get('platform') or '').strip().lower() or None
    chosen_platform = _ensure_data_provider(requested_platform)

    try:
        df = unified_data_service.get_candles(
            symbol, timeframe, int(needed), platform=chosen_platform
        )
    except Exception as exc:
        logger.warning('TV /history fetch failed for %s %s: %s', symbol, timeframe, exc)
        # Fall back to the demo provider so the chart still renders something.
        try:
            unified_data_service.connect('demo', {})
            df = unified_data_service.get_candles(symbol, timeframe, int(needed), platform='demo')
        except Exception:
            return jsonify({'s': 'error', 'errmsg': str(exc)}), 200

    if df is None or df.empty:
        return jsonify({'s': 'no_data'})

    # Normalize timestamp column to epoch seconds. Many providers use the
    # DataFrame index for the bar time, so handle both shapes.
    if df.index.name in ('time', 'timestamp', 'date') or isinstance(df.index, pd.DatetimeIndex):
        df = df.reset_index()
    rows = df.to_dict(orient='records')

    def to_epoch(value: Any) -> Optional[int]:
        """Best-effort conversion to Unix seconds.

        Handles raw ints/floats already in epoch (s or ms), ISO strings,
        datetime objects and pandas Timestamps.
        """
        if value is None:
            return None
        # Numeric epochs (seconds vs milliseconds heuristic).
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            n = int(value)
            if n > 10_000_000_000:   # too big for seconds → ms
                n //= 1000
            return n if n > 0 else None
        # Datetime-like objects.
        try:
            ts_dt = pd.Timestamp(value)
        except Exception:
            return None
        if pd.isna(ts_dt):
            return None
        if ts_dt.tzinfo is None:
            ts_dt = ts_dt.tz_localize('UTC')
        return int(ts_dt.timestamp())

    t: List[int] = []
    o: List[float] = []
    h: List[float] = []
    l: List[float] = []
    c: List[float] = []
    v: List[float] = []
    for row in rows:
        ts = to_epoch(row.get('time') or row.get('timestamp') or row.get('date') or row.get('index'))
        if ts is None:
            continue
        # Accept anything within [from_ts - 1bar, to_ts]; widget will trim.
        if not countback and (ts < from_ts - 60 or ts > to_ts + 60):
            continue
        try:
            t.append(int(ts))
            o.append(float(row.get('open', row.get('o', 0))))
            h.append(float(row.get('high', row.get('h', 0))))
            l.append(float(row.get('low',  row.get('l', 0))))
            c.append(float(row.get('close', row.get('c', 0))))
            v.append(float(row.get('volume', row.get('v', 0)) or 0))
        except (TypeError, ValueError):
            continue

    if not t:
        # Fallback: report the earliest bar so TradingView can request older data.
        earliest = None
        for row in rows:
            ts = to_epoch(row.get('time') or row.get('timestamp') or row.get('date') or row.get('index'))
            if ts is not None:
                earliest = ts if earliest is None else min(earliest, ts)
        return jsonify({'s': 'no_data', 'nextTime': earliest or from_ts})

    return jsonify({
        's': 'ok',
        't': t,
        'o': o,
        'h': h,
        'l': l,
        'c': c,
        'v': v,
    })


@tv_bp.route('/marks', methods=['GET'])
def marks():
    """Bar marks endpoint (not used yet – returns empty arrays)."""
    return jsonify({
        'id':    [],
        'time':  [],
        'color': [],
        'text':  [],
        'label': [],
        'labelFontColor': [],
        'minSize': [],
    })


@tv_bp.route('/timescale_marks', methods=['GET'])
def timescale_marks():
    """Timescale marks (not used yet – returns empty arrays)."""
    return jsonify([])
