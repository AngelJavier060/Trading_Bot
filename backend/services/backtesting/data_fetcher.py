"""
Backtesting Data Fetcher
========================
Fetches real historical OHLCV data from Yahoo Finance for use in backtesting.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import math

logger = logging.getLogger(__name__)

# Map common trading symbols to Yahoo Finance tickers
TICKER_MAP: Dict[str, str] = {
    # Forex
    'EURUSD': 'EURUSD=X', 'GBPUSD': 'GBPUSD=X', 'USDJPY': 'USDJPY=X',
    'USDCHF': 'USDCHF=X', 'AUDUSD': 'AUDUSD=X', 'NZDUSD': 'NZDUSD=X',
    'USDCAD': 'USDCAD=X', 'EURGBP': 'EURGBP=X', 'EURJPY': 'EURJPY=X',
    'GBPJPY': 'GBPJPY=X', 'AUDJPY': 'AUDJPY=X', 'CADJPY': 'CADJPY=X',
    # Crypto
    'BTCUSD': 'BTC-USD', 'ETHUSD': 'ETH-USD', 'BNBUSD': 'BNB-USD',
    # Indices
    'US30': '^DJI', 'US500': '^GSPC', 'US100': '^NDX',
    # Commodities
    'XAUUSD': 'GC=F', 'GOLD': 'GC=F', 'SILVER': 'SI=F', 'XAGUSD': 'SI=F',
    'OIL': 'CL=F', 'XBRUSD': 'BZ=F',
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
    """Convert a trading symbol to a Yahoo Finance ticker."""
    upper = symbol.upper().replace('-', '').replace('_', '').replace('/', '')
    return TICKER_MAP.get(upper, upper)


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
