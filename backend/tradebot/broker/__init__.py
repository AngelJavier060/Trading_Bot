"""Capa de acceso a MetaTrader 5."""

from .client import MT5Client, find_terminals
from .execution import OrderExecutor
from .market_data import MarketData, frame_to_candles
from .models import BUY, SELL, AccountInfo, MT5Error, OrderResult, Position, SymbolSpec
from .symbols import SymbolResolver, canonical

__all__ = [
    "BUY", "SELL", "AccountInfo", "MT5Client", "MT5Error", "MarketData", "OrderExecutor",
    "OrderResult", "Position", "SymbolResolver", "SymbolSpec", "canonical", "find_terminals",
    "frame_to_candles",
]
