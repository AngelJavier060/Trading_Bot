"""Prueba de ejecución real en cuenta DEMO: abre 0.01 lotes con SL/TP y la cierra.

Verifica de punta a punta: resolución de símbolo, envío de orden, SL/TP,
cierre y lectura del P&L desde el historial. Se niega a correr en cuentas reales.

    .venv\\Scripts\\python scripts\\demo_trade.py --symbol EURUSD --side buy --hold 10 --yes
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tradebot.broker import BUY, MT5Error  # noqa: E402
from tradebot.context import build_context  # noqa: E402
from tradebot.planner import current_atr  # noqa: E402
from tradebot.risk import atr_stops  # noqa: E402


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", default="EURUSD")
    p.add_argument("--side", choices=["buy", "sell"], default="buy")
    p.add_argument("--volume", type=float, default=0.01)
    p.add_argument("--hold", type=int, default=10, help="Segundos con la posición abierta")
    p.add_argument("--yes", action="store_true", help="Confirmar que se envíen órdenes")
    args = p.parse_args()

    ctx = build_context()
    account = ctx.connect()
    print(f"Cuenta {account.login} @ {account.server} ({account.mode})")
    if not account.is_demo:
        print("ABORTADO: esta prueba solo se ejecuta en cuentas DEMO.")
        return 2
    if not ctx.client.terminal_status().get("algo_trading_enabled"):
        print("ABORTADO: activa 'Algo Trading' en el terminal MT5.")
        return 2
    if not args.yes:
        print("Añade --yes para enviar la orden de prueba.")
        return 2

    spec = ctx.resolver.spec(args.symbol)
    df = ctx.market.candles(args.symbol, "M15", 100)
    tick = ctx.market.tick(args.symbol)
    entry = tick["ask"] if args.side == BUY else tick["bid"]
    sl, tp = atr_stops(args.side, entry, current_atr(df, 14), 1.5, 2.5, spec)
    print(f"Abriendo {args.side} {args.volume} {spec.name} @ ~{entry} SL {sl} TP {tp}")

    opened = ctx.executor.open_market(spec.name, args.side, args.volume, sl, tp, comment="demo_trade test")
    print(f"  -> ok={opened.ok} retcode={opened.retcode} {opened.comment} ticket={opened.ticket} precio={opened.price}")
    if not opened.ok:
        return 1

    positions = [x for x in ctx.executor.positions() if x.ticket == opened.ticket]
    if positions:
        pos = positions[0]
        print(f"  Posición #{pos.ticket}: {pos.side} {pos.volume} @ {pos.price_open} SL {pos.sl} TP {pos.tp} "
              f"abierta {pos.time_open:%H:%M:%S} UTC")
    time.sleep(args.hold)

    closed = ctx.executor.close_position(opened.ticket, comment="demo_trade close")
    print(f"Cierre -> ok={closed.ok} retcode={closed.retcode} {closed.comment} precio={closed.price}")

    result = None
    for _ in range(10):
        result = ctx.executor.closed_position_result(opened.ticket)
        if result:
            break
        time.sleep(1)
    print(f"Resultado según historial MT5: {result}")
    ctx.client.disconnect()
    return 0 if closed.ok and result else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except MT5Error as exc:
        print(f"ERROR MT5: {exc}")
        sys.exit(1)
