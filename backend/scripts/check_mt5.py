"""Diagnóstico de la conexión con MT5 (solo lectura, no envía órdenes).

    .venv\\Scripts\\python scripts\\check_mt5.py EURUSD GBPUSD XAUUSD
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tradebot.broker import MT5Error, find_terminals  # noqa: E402
from tradebot.context import build_context  # noqa: E402


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    symbols = sys.argv[1:] or ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"]
    print("Terminales encontrados:", find_terminals() or "ninguno en rutas habituales")

    ctx = build_context()
    try:
        account = ctx.connect()
    except MT5Error as exc:
        print(f"ERROR de conexión: {exc}")
        return 1

    term = ctx.client.terminal_status()
    print(f"\nCuenta     {account.login} @ {account.server} ({account.mode.upper()})")
    print(f"Balance    {account.balance:.2f} {account.currency}  equity {account.equity:.2f}  apalancamiento 1:{account.leverage}")
    print(f"Terminal   {term.get('company')} build {term.get('build')} — {term.get('path')}")
    print(f"Algo Trading {'ACTIVADO' if term.get('algo_trading_enabled') else 'DESACTIVADO (actívalo para que el bot pueda operar)'}")
    off = ctx.client.utc_offset(ctx.resolver.resolve(symbols[0])) if symbols else 0
    print(f"Hora servidor = UTC{off / 3600:+.1f}h")

    print("\nSímbolos:")
    for s in symbols:
        try:
            spec = ctx.resolver.spec(s)
            tick = ctx.market.tick(s)
            print(f"  {s:8} -> {spec.name:10} bid {tick['bid']:<10} spread {spec.spread:>3} pts  "
                  f"lote {spec.volume_min}-{spec.volume_max} paso {spec.volume_step}  "
                  f"tick {spec.tick_value} {account.currency}  stops_level {spec.stops_level}")
        except MT5Error as exc:
            print(f"  {s:8} -> no disponible: {exc}")

    positions = ctx.executor.positions(only_mine=False)
    print(f"\nPosiciones abiertas en la cuenta: {len(positions)}")
    for p in positions:
        print(f"  #{p.ticket} {p.symbol} {p.side} {p.volume} @ {p.price_open} P&L {p.profit:+.2f} (magic {p.magic})")
    ctx.client.disconnect()
    return 0


if __name__ == "__main__":
    sys.exit(main())
