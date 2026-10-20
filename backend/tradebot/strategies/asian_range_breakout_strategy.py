"""Ruptura del rango asiático (mismo criterio que Asian_Range_Breakout_EA.mq5).

Las horas son las de las velas de MT5 (hora del servidor). En M5 replica mejor
los pending Buy Stop / Sell Stop del experto: un disparo por día, OCO, SL al
otro lado (o al medio) y TP en R.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .base_strategy import BaseStrategy, SignalReason, SignalType, TradingSignal


def _none(name: str, indicators: Optional[dict] = None) -> TradingSignal:
    return TradingSignal(
        signal=SignalType.NONE, confidence=0, indicators=indicators or {},
        reasons=[], strategy_name=name,
    )


@dataclass
class _State:
    last_t: Optional[datetime] = None
    last_signal: Optional[TradingSignal] = None
    cal_day: Optional[object] = None
    day_high: float = 0.0
    day_low: float = 0.0
    prev_close: Optional[float] = None
    daily_tr: list = field(default_factory=list)
    session_hi: Optional[float] = None
    session_lo: Optional[float] = None
    day_placed: Optional[int] = None
    filled: bool = False
    buy_stop: Optional[float] = None
    sell_stop: Optional[float] = None
    sl_buy: float = 0.0
    tp_buy: float = 0.0
    sl_sell: float = 0.0
    tp_sell: float = 0.0
    ema_h1: Optional[float] = None
    ema_hour: Optional[int] = None
    hour_close: Optional[float] = None


class AsianRangeBreakoutStrategy(BaseStrategy):
    name = "asian_range_breakout"
    description = "Ruptura del rango asiático con Buy Stop / Sell Stop (1 operación por día)"
    version = "1.0.0"
    min_candles = 80
    uses_own_stops = True

    def default_params(self) -> Dict:
        return {
            "range_start": 0,
            "range_end": 9,
            "trade_end": 15,
            "close_hour": 22,
            "min_range_atr": 0.10,
            "max_range_atr": 0.60,
            "buffer_atr": 0.02,
            "max_spread_pts": 30,
            "trend_filter": False,
            "trend_ema": 200,
            "trade_monday": True,
            "trade_tuesday": True,
            "trade_wednesday": True,
            "trade_thursday": True,
            "trade_friday": True,
            "sl_mode": 0,
            "rr": 1.5,
            "atr_period": 14,
        }

    def __init__(self, params: Optional[Dict] = None):
        super().__init__(params)
        self._st: Dict[str, _State] = {}

    def analyze(self, candles: List[Dict], candles_htf: Optional[List[Dict]] = None, *, asset: str = "") -> TradingSignal:
        if not candles:
            return _none(self.name)
        key = asset or "_"
        st = self._st.setdefault(key, _State())
        last_t = self.reference_time(candles)
        if st.last_t is None:
            sig = _none(self.name)
            for c in candles:
                sig = self._on_bar(st, c) or sig
            st.last_t = last_t
            st.last_signal = sig
            return sig
        if last_t == st.last_t:
            return st.last_signal or _none(self.name)
        if last_t < st.last_t:
            self._st[key] = _State()
            return self.analyze(candles, candles_htf, asset=asset)
        sig = self._on_bar(st, candles[-1])
        st.last_t = last_t
        st.last_signal = sig
        return sig

    def _on_bar(self, st: _State, candle: Dict) -> TradingSignal:
        t = self._bar_time(candle)
        o, h, l, c = float(candle["open"]), float(candle["high"]), float(candle["low"]), float(candle["close"])
        p = self.params
        start_h, end_h = int(p["range_start"]), int(p["range_end"])
        trade_end, close_h = int(p["trade_end"]), int(p["close_hour"])
        yday = t.timetuple().tm_yday
        hour = t.hour
        day = t.date()

        if st.cal_day is None:
            st.cal_day, st.day_high, st.day_low = day, h, l
        elif day != st.cal_day:
            if st.prev_close is not None:
                tr = max(st.day_high - st.day_low, abs(st.day_high - st.prev_close), abs(st.day_low - st.prev_close))
                st.daily_tr.append(tr)
            st.cal_day, st.day_high, st.day_low = day, h, l
            st.session_hi = st.session_lo = None
            st.filled = False
            st.buy_stop = st.sell_stop = None
        else:
            st.day_high = max(st.day_high, h)
            st.day_low = min(st.day_low, l)
        st.prev_close = c

        if st.ema_hour is not None and hour != st.ema_hour and st.hour_close is not None:
            st.ema_h1 = self._ema(st.ema_h1, st.hour_close, int(p["trend_ema"]))
        st.ema_hour = hour
        st.hour_close = c

        if self._in_session(hour, start_h, end_h):
            st.session_hi = h if st.session_hi is None else max(st.session_hi, h)
            st.session_lo = l if st.session_lo is None else min(st.session_lo, l)

        spread = float(candle.get("spread") or 0)

        if st.buy_stop is not None or st.sell_stop is not None:
            if hour >= trade_end and not st.filled:
                st.buy_stop = st.sell_stop = None
            elif close_h > 0 and hour >= close_h:
                st.buy_stop = st.sell_stop = None
            elif not st.filled:
                hit_buy = st.buy_stop is not None and h >= st.buy_stop
                hit_sell = st.sell_stop is not None and l <= st.sell_stop
                side = None
                if hit_buy and hit_sell:
                    db = abs(o - st.buy_stop)
                    ds = abs(o - st.sell_stop)
                    side = "buy" if db <= ds else "sell"
                elif hit_buy:
                    side = "buy"
                elif hit_sell:
                    side = "sell"
                if side == "buy":
                    entry, sl, tp = st.buy_stop, st.sl_buy, st.tp_buy
                    st.filled = True
                    st.buy_stop = st.sell_stop = None
                    return self._signal(SignalType.BUY, c, sl, tp, entry, "compra")
                if side == "sell":
                    entry, sl, tp = st.sell_stop, st.sl_sell, st.tp_sell
                    st.filled = True
                    st.buy_stop = st.sell_stop = None
                    return self._signal(SignalType.SELL, c, sl, tp, entry, "venta")

        if (
            yday != st.day_placed
            and end_h <= hour < trade_end
            and self._day_ok(t)
            and not st.filled
            and st.buy_stop is None
            and st.sell_stop is None
        ):
            st.day_placed = yday
            self._place(st, c, spread)

        return _none(self.name)

    def _place(self, st: _State, close: float, spread_pts: float) -> None:
        p = self.params
        if st.session_hi is None or st.session_lo is None:
            return
        hi, lo = st.session_hi, st.session_lo
        rng = hi - lo
        atr_d = self._atr(st)
        if atr_d <= 0:
            return
        if rng < atr_d * float(p["min_range_atr"]) or rng > atr_d * float(p["max_range_atr"]):
            return
        if spread_pts and spread_pts > float(p["max_spread_pts"]):
            return
        allow_buy = allow_sell = True
        if p["trend_filter"] and st.ema_h1 is not None:
            allow_buy = close > st.ema_h1
            allow_sell = close < st.ema_h1
        buf = atr_d * float(p["buffer_atr"])
        mid = (hi + lo) / 2.0
        rr = float(p["rr"])
        middle = int(p["sl_mode"]) == 1
        if allow_buy:
            e = hi + buf
            sl = mid if middle else lo - buf
            risk = e - sl
            if risk > 0 and close < e:
                st.buy_stop = e
                st.sl_buy = sl
                st.tp_buy = (e + risk * rr) if rr > 0 else 0.0
        if allow_sell:
            e = lo - buf
            sl = mid if middle else hi + buf
            risk = sl - e
            if risk > 0 and close > e:
                st.sell_stop = e
                st.sl_sell = sl
                st.tp_sell = (e - risk * rr) if rr > 0 else 0.0

    def _signal(self, kind: SignalType, close: float, sl: float, tp: float, entry: float, label: str) -> TradingSignal:
        entry = float(entry)
        return TradingSignal(
            signal=kind,
            confidence=72.0,
            indicators={"entry_price": entry, "sl": float(sl), "tp": float(tp), "close": close},
            reasons=[SignalReason(
                indicator="Rango asiático",
                condition=f"Ruptura {label} del rango: entrada {entry:.5f} SL {sl:.5f}",
                value=entry, threshold=sl, met=True, weight=3.0,
            )],
            strategy_name=self.name,
        )

    def _atr(self, st: _State) -> float:
        n = int(self.params["atr_period"])
        if len(st.daily_tr) < n:
            return 0.0
        return sum(st.daily_tr[-n:]) / n

    @staticmethod
    def _ema(prev: Optional[float], price: float, period: int) -> float:
        if prev is None:
            return price
        a = 2.0 / (period + 1)
        return a * price + (1 - a) * prev

    @staticmethod
    def _in_session(hour: int, start_h: int, end_h: int) -> bool:
        if start_h <= end_h:
            return start_h <= hour < end_h
        return hour >= start_h or hour < end_h

    def _day_ok(self, t: datetime) -> bool:
        mql = (t.weekday() + 1) % 7
        keys = {1: "trade_monday", 2: "trade_tuesday", 3: "trade_wednesday", 4: "trade_thursday", 5: "trade_friday"}
        key = keys.get(mql)
        return bool(key and self.params.get(key, True))

    @staticmethod
    def _bar_time(candle: Dict) -> datetime:
        t = candle.get("time")
        if isinstance(t, datetime):
            return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
        return datetime.fromtimestamp(float(t), tz=timezone.utc)
