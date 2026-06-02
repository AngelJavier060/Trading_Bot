"""
Price Action Reversal at Key Levels
===================================
Reversión en niveles clave: niveles en 15m (solo estructura), confirmación en 5m.

- 15m: últimas N velas, pivotes de soporte/resistencia agrupados con tolerancia ±0,1 %.
- 5m: martillo, estrella fugaz, engulfing alcista/bajista, doji + confirmación en la vela siguiente.
- Horario Ecuador: 08:00–12:00 (solo en esa ventana se devuelve señal ejecutable).
- Expiración recomendada en UI/bot: 15 minutos (3 velas de 5m).

Notas de implementación:
- `candles_htf` debe ser la serie de 15m; `candles` es 5m.
- El límite de 2 operaciones simultáneas y el 2 % de capital se aplican en el motor de ejecución / UI.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd

from .base_strategy import BaseStrategy, SignalReason, SignalType, TradingSignal


class PriceActionKeyLevelsStrategy(BaseStrategy):
    name = "price_action_key_levels"
    description = "Price Action Reversal at Key Levels — 15m niveles + 5m patrones"
    version = "1.0.0"
    min_candles = 35

    # Estado entre scans (espera máx. N velas 5m en una zona)
    _wait_state: ClassVar[Dict[str, Dict[str, Any]]] = {}

    def default_params(self) -> Dict:
        return {
            "lookback_15m": 200,
            "zone_tolerance_pct": 0.1,
            "min_touches": 2,
            "max_wait_5m_bars": 6,
            "strength_body_ratio": 0.70,
            "doji_max_body_pct": 0.05,
            "doji_min_wick_pct": 0.1,
            "session_start_ec": 8,
            "session_end_ec": 12,
            "break_lookback_15m": 50,
            "pivot_left": 2,
            "pivot_right": 2,
        }

    def _now_ecuador(self) -> datetime:
        return datetime.now(timezone.utc) - timedelta(hours=5)

    def _in_trading_session(self) -> bool:
        ec = self._now_ecuador()
        h = ec.hour + ec.minute / 60.0
        s0 = float(self.params["session_start_ec"])
        s1 = float(self.params["session_end_ec"])
        return s0 <= h <= s1

    @staticmethod
    def _row_parts(o: float, h: float, l: float, c: float) -> Tuple[float, float, float, float]:
        body = abs(c - o)
        top = max(o, c)
        bot = min(o, c)
        rng = max(h - l, 1e-12)
        uw = h - top
        lw = bot - l
        return body, uw, lw, rng

    def _hammer(self, o: float, h: float, l: float, c: float) -> bool:
        body, uw, lw, rng = self._row_parts(o, h, l, c)
        if rng <= 0 or body < 1e-12:
            return False
        if lw < 2 * body:
            return False
        if uw > 0.10 * rng:
            return False
        bot = min(o, c)
        return bot >= l + 0.66 * rng

    def _shooting_star(self, o: float, h: float, l: float, c: float) -> bool:
        body, uw, lw, rng = self._row_parts(o, h, l, c)
        if rng <= 0 or body < 1e-12:
            return False
        if uw < 2 * body:
            return False
        if lw > 0.10 * rng:
            return False
        top = max(o, c)
        return top <= h - 0.33 * rng

    @staticmethod
    def _bullish_engulfing(o0, c0, o1, c1) -> bool:
        if c0 >= o0:
            return False
        if c1 <= o1:
            return False
        return o1 <= c0 and c1 >= o0

    @staticmethod
    def _bearish_engulfing(o0, c0, o1, c1) -> bool:
        if c0 <= o0:
            return False
        if c1 >= o1:
            return False
        return o1 >= c0 and c1 <= o0

    def _is_doji(self, o: float, h: float, l: float, c: float, ref_price: float) -> bool:
        body = abs(c - o)
        max_body = ref_price * (self.params["doji_max_body_pct"] / 100.0)
        if body > max_body:
            return False
        _, uw, lw, rng = self._row_parts(o, h, l, c)
        min_w = ref_price * (self.params["doji_min_wick_pct"] / 100.0)
        return uw >= min_w and lw >= min_w and rng > 0

    def _strength_break(
        self, o: float, h: float, l: float, c: float, level_low: float, level_high: float, direction: str
    ) -> bool:
        """Vela de fuerza que rompe nivel (cuerpo >= ratio del rango)."""
        body, _, _, rng = self._row_parts(o, h, l, c)
        if rng <= 0:
            return False
        if body < self.params["strength_body_ratio"] * rng:
            return False
        if direction == "up":
            return c > level_high and min(o, c) <= level_high
        return c < level_low and max(o, c) >= level_low

    def _pivot_lows(self, df: pd.DataFrame) -> List[float]:
        pl = int(self.params["pivot_left"])
        pr = int(self.params["pivot_right"])
        lows = df["low"].values
        out: List[float] = []
        for i in range(pl, len(lows) - pr):
            seg = lows[i - pl : i + pr + 1]
            if lows[i] == seg.min() and lows[i] <= lows[i - 1] and lows[i] <= lows[i + 1]:
                out.append(float(lows[i]))
        return out

    def _pivot_highs(self, df: pd.DataFrame) -> List[float]:
        pl = int(self.params["pivot_left"])
        pr = int(self.params["pivot_right"])
        highs = df["high"].values
        out: List[float] = []
        for i in range(pl, len(highs) - pr):
            seg = highs[i - pl : i + pr + 1]
            if highs[i] == seg.max() and highs[i] >= highs[i - 1] and highs[i] >= highs[i + 1]:
                out.append(float(highs[i]))
        return out

    def _cluster_prices(self, prices: List[float], tol_pct: float) -> List[Tuple[float, int]]:
        if not prices:
            return []
        prices = sorted(prices)
        clusters: List[List[float]] = [[prices[0]]]
        for p in prices[1:]:
            c0 = sum(clusters[-1]) / len(clusters[-1])
            if abs(p - c0) / max(c0, 1e-12) * 100.0 <= tol_pct * 2.5:
                clusters[-1].append(p)
            else:
                clusters.append([p])
        return [(sum(c) / len(c), len(c)) for c in clusters]

    def _build_zones(self, df15: pd.DataFrame) -> List[Dict[str, Any]]:
        tol = float(self.params["zone_tolerance_pct"])
        lb = min(int(self.params["lookback_15m"]), len(df15))
        tail = df15.iloc[-lb:].copy()
        min_t = int(self.params["min_touches"])

        sup_centers = self._cluster_prices(self._pivot_lows(tail), tol)
        res_centers = self._cluster_prices(self._pivot_highs(tail), tol)

        zones: List[Dict[str, Any]] = []
        for center, touches in sup_centers:
            if touches < min_t:
                continue
            zl = center * (1 - tol / 100.0)
            zh = center * (1 + tol / 100.0)
            prio = 1 if touches >= 4 else (0.5 if touches == 3 else 0.0)
            zones.append(
                {
                    "kind": "support",
                    "center": center,
                    "low": zl,
                    "high": zh,
                    "touches": touches,
                    "priority": prio,
                }
            )
        for center, touches in res_centers:
            if touches < min_t:
                continue
            zl = center * (1 - tol / 100.0)
            zh = center * (1 + tol / 100.0)
            prio = 1 if touches >= 4 else (0.5 if touches == 3 else 0.0)
            zones.append(
                {
                    "kind": "resistance",
                    "center": center,
                    "low": zl,
                    "high": zh,
                    "touches": touches,
                    "priority": prio,
                }
            )

        bl = int(self.params["break_lookback_15m"])
        recent = tail.iloc[-bl:] if len(tail) >= bl else tail
        alive: List[Dict[str, Any]] = []
        for z in zones:
            broken = False
            for _, row in recent.iterrows():
                o, h, l, c = float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"])
                if z["kind"] == "resistance" and self._strength_break(o, h, l, c, z["low"], z["high"], "up"):
                    broken = True
                    break
                if z["kind"] == "support" and self._strength_break(o, h, l, c, z["low"], z["high"], "down"):
                    broken = True
                    break
            if not broken:
                alive.append(z)
        return alive

    @staticmethod
    def _bar_overlaps_zone(hi: float, lo: float, z: Dict[str, Any]) -> bool:
        return not (hi < z["low"] or lo > z["high"])

    def _clear_wait(self, key: str) -> None:
        if key in self._wait_state:
            del self._wait_state[key]

    def analyze(
        self,
        candles: List[Dict],
        candles_htf: Optional[List[Dict]] = None,
        *,
        asset: str = "",
    ) -> TradingSignal:
        reasons: List[SignalReason] = []
        key = asset or "_default"

        if not candles_htf or len(candles_htf) < 20:
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={},
                reasons=[
                    SignalReason(
                        indicator="HTF",
                        condition="Faltan velas 15m (candles_htf) para niveles",
                        value=float(len(candles_htf or [])),
                        threshold=20,
                        met=False,
                        weight=0,
                    )
                ],
                strategy_name=self.name,
            )

        df5 = self.candles_to_df(candles)
        df15 = self.candles_to_df(candles_htf)

        if len(df5) < self.min_candles:
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={},
                reasons=[],
                strategy_name=self.name,
            )

        in_sess = self._in_trading_session()
        reasons.append(
            SignalReason(
                indicator="Horario EC",
                condition="08:00–12:00 Ecuador (ejecución)",
                value=1.0 if in_sess else 0.0,
                threshold=1.0,
                met=in_sess,
                weight=2.0,
            )
        )
        if not in_sess:
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={"in_session": 0.0},
                reasons=reasons,
                strategy_name=self.name,
            )

        zones = self._build_zones(df15)
        if not zones:
            reasons.append(
                SignalReason(
                    indicator="Niveles 15m",
                    condition="Sin zonas S/R válidas (mín. 2 toques)",
                    value=0,
                    threshold=1,
                    met=False,
                    weight=0,
                )
            )
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={"zones": 0},
                reasons=reasons,
                strategy_name=self.name,
            )

        i = len(df5) - 1
        row = df5.iloc[i]
        o, h, l, c = float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"])
        prev = df5.iloc[i - 1]
        po, ph, pl, pc = float(prev["open"]), float(prev["high"]), float(prev["low"]), float(prev["close"])

        touching: List[Dict[str, Any]] = [z for z in zones if self._bar_overlaps_zone(h, l, z)]

        # --- espera en zona (máx. N velas 5m) ---
        max_wait = int(self.params["max_wait_5m_bars"])
        st = self._wait_state.get(key)
        if touching:
            z0 = max(touching, key=lambda z: (z["priority"], z["touches"]))
            if st is None or st.get("zone_center") != z0["center"]:
                self._wait_state[key] = {"start_i": i, "zone_center": z0["center"], "zone": z0}
            st = self._wait_state[key]
        elif st:
            if i - int(st.get("start_i", i)) >= max_wait:
                self._clear_wait(key)
            st = self._wait_state.get(key)

        if st and i - int(st.get("start_i", i)) >= max_wait:
            self._clear_wait(key)

        def zone_ok_for_call(z: Dict[str, Any]) -> bool:
            return z["kind"] == "support" and z["touches"] >= int(self.params["min_touches"])

        def zone_ok_for_put(z: Dict[str, Any]) -> bool:
            return z["kind"] == "resistance" and z["touches"] >= int(self.params["min_touches"])

        signal_type = SignalType.NONE
        pattern_name = ""
        active_zone: Optional[Dict[str, Any]] = None

        for z in touching:
            if zone_ok_for_call(z) and self._hammer(o, h, l, c):
                signal_type = SignalType.CALL
                pattern_name = "Hammer"
                active_zone = z
                break
            if zone_ok_for_put(z) and self._shooting_star(o, h, l, c):
                signal_type = SignalType.PUT
                pattern_name = "Shooting Star"
                active_zone = z
                break

        if signal_type == SignalType.NONE:
            for z in touching:
                if zone_ok_for_call(z) and self._bullish_engulfing(po, pc, o, c):
                    signal_type = SignalType.CALL
                    pattern_name = "Bullish Engulfing"
                    active_zone = z
                    break
                if zone_ok_for_put(z) and self._bearish_engulfing(po, pc, o, c):
                    signal_type = SignalType.PUT
                    pattern_name = "Bearish Engulfing"
                    active_zone = z
                    break

        if signal_type == SignalType.NONE and i >= 2:
            ref = float(pc)
            o1, h1, l1, c1 = po, ph, pl, pc
            if self._is_doji(o1, h1, l1, c1, ref):
                for z in zones:
                    if not (
                        z["low"] <= o1 <= z["high"]
                        or z["low"] <= c1 <= z["high"]
                        or self._bar_overlaps_zone(h1, l1, z)
                    ):
                        continue
                    if zone_ok_for_call(z) and c > o:
                        signal_type = SignalType.CALL
                        pattern_name = "Doji+Confirmación alcista"
                        active_zone = z
                        break
                    if zone_ok_for_put(z) and c < o:
                        signal_type = SignalType.PUT
                        pattern_name = "Doji+Confirmación bajista"
                        active_zone = z
                        break

        if signal_type == SignalType.NONE:
            return TradingSignal(
                signal=SignalType.NONE,
                confidence=0,
                indicators={"zones": len(zones), "touching": len(touching)},
                reasons=reasons,
                strategy_name=self.name,
            )

        self._clear_wait(key)

        base_conf = 62.0
        if active_zone:
            base_conf += min(18.0, 4.0 * int(active_zone["touches"]))
            base_conf += 6.0 * float(active_zone.get("priority", 0))

        reasons.append(
            SignalReason(
                indicator="Patrón",
                condition=f"{pattern_name} en nivel {active_zone['kind'] if active_zone else '?'}",
                value=c,
                threshold=active_zone["center"] if active_zone else 0,
                met=True,
                weight=3.0,
            )
        )
        reasons.append(
            SignalReason(
                indicator="Toques nivel",
                condition="Mínimo 2 toques en 15m",
                value=float(active_zone["touches"]) if active_zone else 0,
                threshold=float(self.params["min_touches"]),
                met=True,
                weight=2.0,
            )
        )

        return TradingSignal(
            signal=signal_type,
            confidence=min(92.0, base_conf),
            indicators={
                "level_center": active_zone["center"] if active_zone else 0,
                "pattern": pattern_name,
                "zones_active": len(zones),
            },
            reasons=reasons,
            strategy_name=self.name,
        )
