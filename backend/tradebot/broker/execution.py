"""Envío y gestión de órdenes en MT5."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from .client import MT5Client
from .models import BUY, SELL, MT5Error, OrderResult, Position, SymbolSpec
from .symbols import SymbolResolver

logger = logging.getLogger(__name__)

# Bits de SymbolInfo.filling_mode
_FILLING_FOK = 1
_FILLING_IOC = 2


class OrderExecutor:
    def __init__(self, client: MT5Client, resolver: SymbolResolver, magic: int = 234000, deviation_points: int = 20):
        self.client = client
        self.resolver = resolver
        self.magic = magic
        self.deviation = deviation_points

    # ── helpers ─────────────────────────────────────────────────────────

    def _filling(self, spec: SymbolSpec) -> int:
        api = self.client.api
        if spec.filling_mode & _FILLING_IOC:
            return api.ORDER_FILLING_IOC
        if spec.filling_mode & _FILLING_FOK:
            return api.ORDER_FILLING_FOK
        return api.ORDER_FILLING_RETURN

    def _send(self, request: dict) -> OrderResult:
        api = self.client.api
        with self.client.lock:
            check = api.order_check(request)
            if check is None or check.retcode not in (0, api.TRADE_RETCODE_DONE):
                code = check.retcode if check is not None else -1
                comment = check.comment if check is not None else str(self.client.last_error())
                return OrderResult(ok=False, retcode=code, comment=f"order_check: {comment}", request=request)
            result = api.order_send(request)
        if result is None:
            return OrderResult(ok=False, retcode=-1, comment=f"order_send: {self.client.last_error()}", request=request)
        ok = result.retcode in (api.TRADE_RETCODE_DONE, api.TRADE_RETCODE_PLACED)
        return OrderResult(
            ok=ok,
            retcode=int(result.retcode),
            comment=str(result.comment),
            ticket=int(result.order) if ok else None,
            price=float(result.price) if ok else None,
            volume=float(result.volume) if ok else None,
            request=request,
        )

    # ── órdenes ─────────────────────────────────────────────────────────

    def open_market(
        self,
        symbol: str,
        side: str,
        volume: float,
        sl: float = 0.0,
        tp: float = 0.0,
        comment: str = "",
    ) -> OrderResult:
        if side not in (BUY, SELL):
            raise ValueError(f"side inválido: {side}")
        api = self.client.api
        spec = self.resolver.spec(symbol)
        if spec.trade_mode != 4:
            return OrderResult(ok=False, retcode=-1, comment=f"{spec.name} no admite operar (trade_mode={spec.trade_mode})")
        tick = self.client.call("symbol_info_tick", spec.name)
        if tick is None:
            raise MT5Error(f"Sin precio para {spec.name}")
        price = float(tick.ask if side == BUY else tick.bid)
        request = {
            "action": api.TRADE_ACTION_DEAL,
            "symbol": spec.name,
            "volume": spec.round_volume_down(volume),
            "type": api.ORDER_TYPE_BUY if side == BUY else api.ORDER_TYPE_SELL,
            "price": price,
            "sl": spec.round_price(sl) if sl else 0.0,
            "tp": spec.round_price(tp) if tp else 0.0,
            "deviation": self.deviation,
            "magic": self.magic,
            "comment": comment[:31],
            "type_time": api.ORDER_TIME_GTC,
            "type_filling": self._filling(spec),
        }
        result = self._send(request)
        if result.ok:
            logger.info("Orden %s %s %.2f lotes @ %s (SL %s TP %s) ticket=%s",
                        side, spec.name, request["volume"], result.price, request["sl"], request["tp"], result.ticket)
        else:
            logger.warning("Orden rechazada %s %s: %s %s", side, spec.name, result.retcode, result.comment)
        return result

    def close_position(self, ticket: int, comment: str = "close") -> OrderResult:
        api = self.client.api
        found = self.client.call("positions_get", ticket=ticket)
        if not found:
            return OrderResult(ok=False, retcode=-1, comment=f"La posición {ticket} no existe (¿ya cerrada?)")
        p = found[0]
        spec = self.resolver.spec(p.symbol)
        tick = self.client.call("symbol_info_tick", p.symbol)
        is_buy = p.type == api.POSITION_TYPE_BUY
        request = {
            "action": api.TRADE_ACTION_DEAL,
            "symbol": p.symbol,
            "volume": float(p.volume),
            "type": api.ORDER_TYPE_SELL if is_buy else api.ORDER_TYPE_BUY,
            "position": int(ticket),
            "price": float(tick.bid if is_buy else tick.ask),
            "deviation": self.deviation,
            "magic": self.magic,
            "comment": comment[:31],
            "type_time": api.ORDER_TIME_GTC,
            "type_filling": self._filling(spec),
        }
        return self._send(request)

    def modify_stops(self, ticket: int, sl: float, tp: float) -> OrderResult:
        api = self.client.api
        found = self.client.call("positions_get", ticket=ticket)
        if not found:
            return OrderResult(ok=False, retcode=-1, comment=f"La posición {ticket} no existe")
        spec = self.resolver.spec(found[0].symbol)
        request = {
            "action": api.TRADE_ACTION_SLTP,
            "symbol": spec.name,
            "position": int(ticket),
            "sl": spec.round_price(sl) if sl else 0.0,
            "tp": spec.round_price(tp) if tp else 0.0,
            "magic": self.magic,
        }
        return self._send(request)

    # ── consultas ───────────────────────────────────────────────────────

    def positions(self, only_mine: bool = True) -> list[Position]:
        api = self.client.api
        raw = self.client.call("positions_get") or []
        out = []
        for p in raw:
            if only_mine and int(p.magic) != self.magic:
                continue
            out.append(Position(
                ticket=int(p.ticket),
                symbol=str(p.symbol),
                side=BUY if p.type == api.POSITION_TYPE_BUY else SELL,
                volume=float(p.volume),
                price_open=float(p.price_open),
                sl=float(p.sl),
                tp=float(p.tp),
                profit=float(p.profit),
                time_open=datetime.fromtimestamp(int(p.time) - self.client.utc_offset(str(p.symbol)), tz=timezone.utc),
                magic=int(p.magic),
                comment=str(p.comment),
            ))
        return out

    def closed_position_result(self, ticket: int, lookback_days: int = 7) -> Optional[dict]:
        """Resultado final de una posición cerrada a partir de sus deals.

        Devuelve None si la posición sigue abierta o no hay historial.
        net = profit + swap + commission (+ fee) de todos sus deals.
        """
        if self.client.call("positions_get", ticket=ticket):
            return None
        now = datetime.now(timezone.utc)
        deals = self.client.call("history_deals_get", now - timedelta(days=lookback_days), now + timedelta(days=1), position=ticket)
        if not deals:
            return None
        api = self.client.api
        net = sum(float(d.profit) + float(d.swap) + float(d.commission) + float(getattr(d, "fee", 0.0)) for d in deals)
        exits = [d for d in deals if d.entry in (api.DEAL_ENTRY_OUT, api.DEAL_ENTRY_OUT_BY)]
        last = exits[-1] if exits else deals[-1]
        reason_map = {
            getattr(api, "DEAL_REASON_SL", -1): "sl",
            getattr(api, "DEAL_REASON_TP", -2): "tp",
            getattr(api, "DEAL_REASON_SO", -3): "stop_out",
        }
        return {
            "ticket": ticket,
            "net_profit": round(net, 2),
            "close_price": float(last.price),
            "close_time": datetime.fromtimestamp(int(last.time) - self.client.utc_offset(str(last.symbol)), tz=timezone.utc).isoformat(),
            "reason": reason_map.get(int(getattr(last, "reason", -99)), "manual_or_bot"),
            "result": "win" if net > 0 else ("loss" if net < 0 else "breakeven"),
        }

    def closed_deal_stats(self, days: int = 30) -> dict:
        """Ganadas/perdidas a partir de history_deals_get de MT5 (no de la base del bot)."""
        now = datetime.now(timezone.utc)
        deals = self.client.call("history_deals_get", now - timedelta(days=days), now + timedelta(days=1)) or []
        api = self.client.api
        outs = [d for d in deals if int(getattr(d, "entry", -1)) in (api.DEAL_ENTRY_OUT, api.DEAL_ENTRY_OUT_BY)]
        nets = [float(d.profit) + float(getattr(d, "swap", 0)) + float(getattr(d, "commission", 0))
                + float(getattr(d, "fee", 0)) for d in outs]
        wins = [x for x in nets if x > 0]
        losses = [x for x in nets if x < 0]
        n = len(nets)
        gp, gl = sum(wins), -sum(losses)
        return {
            "source": "mt5_history_deals",
            "days": days,
            "trades": n,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(len(wins) / n * 100, 2) if n else 0.0,
            "net_profit": round(sum(nets), 2),
            "profit_factor": round(gp / gl, 2) if gl else (999.99 if gp else 0.0),
            "avg_r": 0.0,
        }
