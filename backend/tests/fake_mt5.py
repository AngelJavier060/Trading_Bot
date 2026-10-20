"""Imitación mínima del módulo MetaTrader5 para tests (sin terminal)."""

from __future__ import annotations

import time
from types import SimpleNamespace as NS

import numpy as np


class FakeMT5:
    # constantes usadas por el código
    TIMEFRAME_M1, TIMEFRAME_M5, TIMEFRAME_M15, TIMEFRAME_M30 = 1, 5, 15, 30
    TIMEFRAME_H1, TIMEFRAME_H4, TIMEFRAME_D1 = 16385, 16388, 16408
    TRADE_ACTION_DEAL, TRADE_ACTION_SLTP = 1, 6
    ORDER_TYPE_BUY, ORDER_TYPE_SELL = 0, 1
    POSITION_TYPE_BUY, POSITION_TYPE_SELL = 0, 1
    ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
    ORDER_TIME_GTC = 0
    TRADE_RETCODE_DONE, TRADE_RETCODE_PLACED = 10009, 10008
    DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY = 0, 1, 3
    DEAL_REASON_SL, DEAL_REASON_TP = 4, 5

    def __init__(self, *, mode: int = 0, algo: bool = True, symbols=None, rates=None, server_offset: int = 0):
        self.mode = mode
        self.algo = algo
        self.initialized = False
        self.server_offset = server_offset
        # cuentas que el "terminal" conoce: login -> (contraseña, servidor, modo 0 demo / 2 real)
        self.accounts = {123: ("pw123", "Fake-Demo", mode), 456: ("pw456", "Fake-Live", 2)}
        self.current_login = 123
        self.remembered = set()     # cuentas cuya contraseña recuerda el terminal
        self._error = (1, "Success")
        self.init_calls = []
        self.symbols = symbols or {
            "EURUSD-T": dict(digits=5, point=0.00001, trade_tick_size=0.00001, trade_tick_value=1.0,
                             trade_contract_size=100000, volume_min=0.01, volume_max=100, volume_step=0.01,
                             trade_stops_level=0, spread=10, filling_mode=3, trade_mode=4, bid=1.10000),
            "#PLUS500-T": dict(digits=2, point=0.01, trade_tick_size=0.01, trade_tick_value=0.01,
                               trade_contract_size=1, volume_min=1, volume_max=100, volume_step=1,
                               trade_stops_level=0, spread=5, filling_mode=1, trade_mode=4, bid=30.0),
            "GOLD-T": dict(digits=2, point=0.01, trade_tick_size=0.01, trade_tick_value=1.0,
                           trade_contract_size=100, volume_min=0.01, volume_max=25, volume_step=0.01,
                           trade_stops_level=40, spread=50, filling_mode=2, trade_mode=4, bid=2400.0),
        }
        self.rates = rates if rates is not None else {}
        self.positions: dict[int, NS] = {}
        self.deals: list[NS] = []
        self.sent: list[dict] = []
        self._ticket = 1000
        self.reject_next = False

    # ── conexión ───────────────────────────────────────────────────────
    def initialize(self, *args, **kwargs):
        self.init_calls.append((args, kwargs))
        login = kwargs.get("login")
        if login:
            known = self.accounts.get(login)
            password, server = kwargs.get("password", ""), kwargs.get("server", "")
            ok = known is not None and known[1] == server and (
                known[0] == password or (password == "" and login in self.remembered))
            if not ok:
                self._error = (-6, "Terminal: Authorization failed")
                return False
            self.current_login = login
        self._error = (1, "Success")
        self.initialized = True
        return True

    def shutdown(self):
        self.initialized = False

    def last_error(self):
        return self._error

    def login(self, login, password="", server=""):
        known = self.accounts.get(int(login))
        ok = known is not None and known[1] == (server or known[1]) and (
            known[0] == password or (password == "" and int(login) in self.remembered))
        if not ok:
            self._error = (-6, "Terminal: Authorization failed")
            return False
        self.current_login = int(login)
        self._error = (1, "Success")
        return True

    def terminal_info(self):
        return NS(connected=self.initialized, trade_allowed=self.algo, company="Fake", path="C:/fake", build=1)

    def account_info(self):
        if not self.initialized:
            return None
        equity = 10_000.0 + sum(p.profit for p in self.positions.values())
        _, server, mode = self.accounts[self.current_login]
        return NS(login=self.current_login, server=server, name="Test", currency="USD", balance=10_000.0, equity=equity,
                  margin=0.0, margin_free=equity, leverage=100, trade_mode=mode, trade_allowed=True)

    # ── símbolos ───────────────────────────────────────────────────────
    def _info(self, name):
        s = self.symbols[name]
        return NS(name=name, visible=True, description=name, path=f"Fake\\{name}", **s)

    def symbol_info(self, name):
        return self._info(name) if name in self.symbols else None

    def symbols_get(self, group="*"):
        needle = group.strip("*").upper()
        return [self._info(n) for n in self.symbols if needle in n.upper()]

    def symbol_select(self, name, enable=True):
        return name in self.symbols

    def symbol_info_tick(self, name):
        if name not in self.symbols:
            return None
        s = self.symbols[name]
        return NS(bid=s["bid"], ask=s["bid"] + s["spread"] * s["point"], time=int(time.time()) + self.server_offset)

    # ── velas ──────────────────────────────────────────────────────────
    def copy_rates_from_pos(self, name, tf, start, count):
        r = self.rates.get(name)
        if r is None:
            return None
        end = len(r) - start
        return r[max(0, end - count):end]

    def copy_rates_range(self, name, tf, date_from, date_to):
        r = self.rates.get(name)
        if r is None:
            return None
        lo, hi = date_from.timestamp(), date_to.timestamp()
        return r[(r["time"] >= lo) & (r["time"] <= hi)]

    # ── órdenes ────────────────────────────────────────────────────────
    def order_check(self, request):
        return NS(retcode=0, comment="Done")

    def order_send(self, request):
        self.sent.append(request)
        if self.reject_next:
            self.reject_next = False
            return NS(retcode=10019, comment="No money", order=0, price=0.0, volume=0.0)
        self._ticket += 1
        if "position" in request:  # cierre
            pos = self.positions.pop(request["position"])
            self.deals.append(NS(position_id=pos.ticket, symbol=pos.symbol, entry=self.DEAL_ENTRY_OUT, profit=12.5,
                                 swap=0.0, commission=-0.5, fee=0.0, price=request["price"],
                                 time=int(time.time()) + self.server_offset, reason=3))
            return NS(retcode=self.TRADE_RETCODE_DONE, comment="Done", order=self._ticket,
                      price=request["price"], volume=request["volume"])
        pos = NS(ticket=self._ticket, symbol=request["symbol"], type=request["type"], volume=request["volume"],
                 price_open=request["price"], sl=request["sl"], tp=request["tp"], profit=0.0,
                 time=int(time.time()) + self.server_offset, magic=request["magic"], comment=request["comment"])
        self.positions[pos.ticket] = pos
        return NS(retcode=self.TRADE_RETCODE_DONE, comment="Done", order=pos.ticket,
                  price=request["price"], volume=request["volume"])

    def positions_get(self, ticket=None, **kwargs):
        if ticket is not None:
            p = self.positions.get(ticket)
            return (p,) if p else ()
        return tuple(self.positions.values())

    def history_deals_get(self, date_from, date_to, position=None, **kwargs):
        return tuple(d for d in self.deals if position is None or d.position_id == position)

    # ── helpers de test ────────────────────────────────────────────────
    def close_externally(self, ticket, profit, reason=None):
        """Simula que el broker cerró la posición (SL/TP)."""
        pos = self.positions.pop(ticket)
        self.deals.append(NS(position_id=ticket, symbol=pos.symbol, entry=self.DEAL_ENTRY_OUT, profit=profit,
                             swap=0.0, commission=0.0, fee=0.0, price=pos.sl,
                             time=int(time.time()) + self.server_offset,
                             reason=reason if reason is not None else self.DEAL_REASON_SL))


def make_rates(closes, start_ts: int = 1_700_000_000, step: int = 900, spread: int = 10, wick: float = 0.0002):
    """Array estructurado como el de copy_rates_* a partir de una lista de cierres."""
    dtype = [("time", "i8"), ("open", "f8"), ("high", "f8"), ("low", "f8"), ("close", "f8"),
             ("tick_volume", "i8"), ("spread", "i4"), ("real_volume", "i8")]
    out = np.zeros(len(closes), dtype=dtype)
    prev = closes[0]
    for i, c in enumerate(closes):
        o = prev
        out[i] = (start_ts + i * step, o, max(o, c) + wick, min(o, c) - wick, c, 100, spread, 0)
        prev = c
    return out
