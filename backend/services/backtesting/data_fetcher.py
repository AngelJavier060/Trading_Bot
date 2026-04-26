"""
Backtesting Data Fetcher
========================
Fetches real historical OHLCV data from Yahoo Finance for use in backtesting.
Requires `yfinance` (declared in backend/requirements.txt).
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import math

logger = logging.getLogger(__name__)

# Map common trading symbols to Yahoo Finance tickers.
# Keep this in sync with IQ_OPTION_ASSETS / MT5_ASSETS in the frontend.
TICKER_MAP: Dict[str, str] = {
    # Forex (majors)
    'EURUSD': 'EURUSD=X', 'GBPUSD': 'GBPUSD=X', 'USDJPY': 'USDJPY=X',
    'USDCHF': 'USDCHF=X', 'AUDUSD': 'AUDUSD=X', 'NZDUSD': 'NZDUSD=X',
    'USDCAD': 'USDCAD=X',
    # Forex (crosses)
    'EURGBP': 'EURGBP=X', 'EURJPY': 'EURJPY=X', 'GBPJPY': 'GBPJPY=X',
    'AUDJPY': 'AUDJPY=X', 'CADJPY': 'CADJPY=X', 'CHFJPY': 'CHFJPY=X',
    'EURCHF': 'EURCHF=X', 'EURCAD': 'EURCAD=X', 'AUDCAD': 'AUDCAD=X',
    'AUDNZD': 'AUDNZD=X', 'GBPCAD': 'GBPCAD=X', 'GBPAUD': 'GBPAUD=X',
    'NZDJPY': 'NZDJPY=X',
    # Crypto
    'BTCUSD': 'BTC-USD', 'ETHUSD': 'ETH-USD', 'BNBUSD': 'BNB-USD',
    'LTCUSD': 'LTC-USD', 'XRPUSD': 'XRP-USD',
    # Indices
    'US30':   '^DJI',   'US500':  '^GSPC', 'US100':  '^NDX',
    'NAS100': '^NDX',   'SPX500': '^GSPC', 'GER30':  '^GDAXI',
    'UK100':  '^FTSE',  'JPN225': '^N225',
    # Commodities (note: Yahoo may not return intraday for futures, we fall
    # back to daily candles inside fetch_candles when intraday is empty).
    'XAUUSD': 'GC=F', 'GOLD':   'GC=F',
    'XAGUSD': 'SI=F', 'SILVER': 'SI=F',
    'USOIL':  'CL=F', 'OIL':    'CL=F', 'WTIUSD': 'CL=F',
    'UKOIL':  'BZ=F', 'XBRUSD': 'BZ=F', 'BRENT':  'BZ=F',
}

# Yahoo Finance interval codes
YF_INTERVAL_MAP: Dict[str, str] = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '1h',  # 4h must be resampled from 1h
    '1d': '1d',
}

# Max historical lookback per interval (Yahoo Finance limits)
YF_MAX_DAYS: Dict[str, int] = {
    '1m': 7, '5m': 58, '15m': 58, '30m': 58,
    '1h': 728, '4h': 728, '1d': 3650,
}


def _to_yf_ticker(symbol: str) -> str:
    """Convert a trading symbol to a Yahoo Finance ticker.

    Strips IQ Option's ``-OTC`` suffix and other separators before lookup so
    that the same map can resolve both IQ Option and MT5 symbols.
    """
    cleaned = symbol.upper().replace('-OTC', '').replace('_OTC', '')
    cleaned = cleaned.replace('-', '').replace('_', '').replace('/', '')
    if cleaned in TICKER_MAP:
        return TICKER_MAP[cleaned]
    # Last resort: forex pair heuristic (e.g. 6 letters → add Yahoo "=X").
    if len(cleaned) == 6 and cleaned.isalpha():
        return f"{cleaned}=X"
    return cleaned


def _resample_to_4h(df) -> 'pd.DataFrame':
    """Resample 1h DataFrame to 4h bars."""
    import pandas as pd
    df.index = pd.to_datetime(df.index)
    ohlc_map = {'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'}
    resampled = df.resample('4h').agg(ohlc_map).dropna()
    return resampled


def fetch_candles(
    symbol: str,
    timeframe: str = '5m',
    days_back: int = 30,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> List[Dict]:
    """
    Fetch OHLCV candles from Yahoo Finance.

    Returns list of dicts: {open, high, low, close, volume, timestamp}
    """
    try:
        import yfinance as yf
        import pandas as pd

        ticker_sym = _to_yf_ticker(symbol)
        interval = YF_INTERVAL_MAP.get(timeframe, '5m')
        max_days = YF_MAX_DAYS.get(timeframe, 58)

        # Date range
        if end_date is None:
            end_date = datetime.now()
        if start_date is None:
            actual_days = min(days_back, max_days)
            start_date = end_date - timedelta(days=actual_days)
        else:
            # Clamp to max allowed
            allowed_start = end_date - timedelta(days=max_days)
            if start_date < allowed_start:
                logger.warning(
                    f"Requested start {start_date} exceeds yfinance limit for {timeframe}. "
                    f"Clamping to {allowed_start}"
                )
                start_date = allowed_start

        logger.info(f"Fetching {ticker_sym} {interval} from {start_date.date()} to {end_date.date()}")

        ticker = yf.Ticker(ticker_sym)
        fetch_interval = '1h' if timeframe == '4h' else interval
        df = ticker.history(
            start=start_date.strftime('%Y-%m-%d'),
            end=end_date.strftime('%Y-%m-%d'),
            interval=fetch_interval,
            auto_adjust=True,
        )

        # Some symbols (especially futures used for commodities like GC=F,
        # CL=F, SI=F) don't return intraday data. Fall back to daily candles
        # so the backtest still runs instead of erroring out.
        if (df is None or df.empty) and fetch_interval not in ('1d', '1wk', '1mo'):
            logger.warning(
                f"No intraday data for {ticker_sym} @ {fetch_interval}; "
                f"retrying with 1d to keep the backtest alive."
            )
            try:
                df = ticker.history(
                    start=(end_date - timedelta(days=YF_MAX_DAYS['1d'])).strftime('%Y-%m-%d'),
                    end=end_date.strftime('%Y-%m-%d'),
                    interval='1d',
                    auto_adjust=True,
                )
            except Exception:
                df = None

        if df is None or df.empty:
            logger.warning(f"No data returned for {ticker_sym} {interval}")
            return []

        # Resample if 4h
        if timeframe == '4h':
            df = _resample_to_4h(df)

        # Convert to list of dicts
        candles = []
        for ts, row in df.iterrows():
            try:
                ts_epoch = int(pd.Timestamp(ts).timestamp())
                candles.append({
                    'open':      round(float(row['Open']),  5),
                    'high':      round(float(row['High']),  5),
                    'low':       round(float(row['Low']),   5),
                    'close':     round(float(row['Close']), 5),
                    'volume':    int(row.get('Volume', 0) or 0),
                    'timestamp': ts_epoch,
                })
            except Exception:
                continue

        logger.info(f"Fetched {len(candles)} candles for {ticker_sym} {interval}")
        return candles

    except ImportError:
        logger.error("yfinance not installed. Run: pip install yfinance")
        return []
    except Exception as e:
        logger.error(f"Error fetching data for {symbol}: {e}")
        return []


def fetch_multi_asset(
    symbols: List[str],
    timeframe: str = '5m',
    days_back: int = 30,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Dict[str, List[Dict]]:
    """Fetch candles for multiple assets. Returns dict of symbol -> candles."""
    result = {}
    for symbol in symbols:
        candles = fetch_candles(symbol, timeframe, days_back, start_date, end_date)
        if candles:
            result[symbol] = candles
        else:
            logger.warning(f"No candles fetched for {symbol}")
    return result


def get_available_symbols() -> List[Dict]:
    """Return list of supported symbols with labels."""
    return [
        {'symbol': 'EURUSD', 'label': 'EUR/USD', 'category': 'Forex'},
        {'symbol': 'GBPUSD', 'label': 'GBP/USD', 'category': 'Forex'},
        {'symbol': 'USDJPY', 'label': 'USD/JPY', 'category': 'Forex'},
        {'symbol': 'AUDUSD', 'label': 'AUD/USD', 'category': 'Forex'},
        {'symbol': 'USDCAD', 'label': 'USD/CAD', 'category': 'Forex'},
        {'symbol': 'USDCHF', 'label': 'USD/CHF', 'category': 'Forex'},
        {'symbol': 'EURGBP', 'label': 'EUR/GBP', 'category': 'Forex'},
        {'symbol': 'EURJPY', 'label': 'EUR/JPY', 'category': 'Forex'},
        {'symbol': 'GBPJPY', 'label': 'GBP/JPY', 'category': 'Forex'},
        {'symbol': 'BTCUSD', 'label': 'BTC/USD', 'category': 'Crypto'},
        {'symbol': 'ETHUSD', 'label': 'ETH/USD', 'category': 'Crypto'},
        {'symbol': 'XAUUSD', 'label': 'XAU/USD (Oro)', 'category': 'Commodities'},
        {'symbol': 'US500',  'label': 'S&P 500', 'category': 'Indices'},
        {'symbol': 'US100',  'label': 'NASDAQ 100', 'category': 'Indices'},
    ]
