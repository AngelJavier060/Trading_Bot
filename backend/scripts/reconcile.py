"""Compara lo que hizo el bot en vivo con lo que dice el backtest para el mismo periodo.

    .venv\\Scripts\\python scripts\\reconcile.py --days 14
Usa la configuración guardada del bot (la última con la que se arrancó).
"""

from __future__ import annotations

import argparse
import sys

from _common import add_period_args, period, utf8_console

from tradebot.app import build_system
from tradebot.logging_setup import setup_logging
from tradebot.research.experiments import code_version
from tradebot.research.reconcile import reconcile


def main() -> int:
    utf8_console()
    p = argparse.ArgumentParser()
    add_period_args(p, days=14)
    p.add_argument("--balance", type=float, default=10_000)
    args = p.parse_args()

    system = build_system()
    setup_logging(system.settings.logs_dir, "WARNING")
    config = system.bot.saved_config()
    if config is None:
        print("No hay configuración guardada del bot: arráncalo al menos una vez.")
        return 1
    system.ctx.connect()
    date_from, date_to = period(args)
    report = reconcile(system.ctx, system.store, config, date_from, date_to, args.balance)

    for symbol, r in report["symbols"].items():
        s, t = r["signals"], r["trades"]
        print(f"== {symbol} ({date_from:%Y-%m-%d} -> {date_to:%Y-%m-%d}) ==")
        print(f"  Señales registradas en vivo: {s['live']} · coinciden con el backtest: {s['agreement_pct']}%")
        for m in s["mismatches"][:5]:
            print(f"    vela {m['bar_time'][:16]}: vivo {m['live']} vs backtest {m['backtest']}")
        print(f"  Operaciones: vivo {t['live']} · backtest {t['backtest']} · emparejadas {t['matched']} · "
              f"solo vivo {t['only_live']} · solo backtest {t['only_backtest']}")
        print(f"  Deslizamiento medio {t['avg_slippage_points']} pts · R medio vivo {t['live_avg_r']} vs backtest "
              f"{t['backtest_avg_r']} · mismo resultado {t['same_outcome_pct']}%")

    exp_id = system.store.add_experiment(
        name=f"vivo vs backtest {date_from:%Y-%m-%d}..{date_to:%Y-%m-%d}", kind="live_vs_backtest",
        config=report["config"], metrics={k: {"signals": {kk: vv for kk, vv in v["signals"].items() if kk != "mismatches"},
                                              "trades": {kk: vv for kk, vv in v["trades"].items()
                                                         if kk not in ("rows", "only_backtest_rows")}}
                                          for k, v in report["symbols"].items()},
        status="info", period_start=date_from.isoformat(), period_end=date_to.isoformat(), code_version=code_version(),
    )
    print(f"\nExperimento #{exp_id} registrado")
    system.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
