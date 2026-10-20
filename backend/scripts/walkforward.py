"""Validación walk-forward y registro del experimento.

Ejemplos:
  # ¿La estrategia tal cual tiene ventaja fuera de muestra?
  .venv\\Scripts\\python scripts\\walkforward.py --symbol EURUSD --timeframe H1 --strategy macd --days 730

  # Elegir SL/TP en cada ventana de entrenamiento y medir en la siguiente
  .venv\\Scripts\\python scripts\\walkforward.py --strategy macd --mode optimize --grid "sl_atr_mult=1,1.5,2;tp_atr_mult=1.5,2.5,3.5"

  # ¿El filtro ML mejora a la estrategia sin filtro?
  .venv\\Scripts\\python scripts\\walkforward.py --strategy macd --mode ml --ml-threshold 0.5
"""

from __future__ import annotations

import argparse
import json
import sys

from _common import add_period_args, add_trading_args, build_config, fmt_metrics, period, utf8_console

from tradebot.app import build_system
from tradebot.backtest import load_history
from tradebot.logging_setup import setup_logging
from tradebot.research.evaluation import Criteria
from tradebot.research.experiments import record_walkforward
from tradebot.research.walkforward import make_folds, parse_grid, run_walkforward


def main() -> int:
    utf8_console()
    p = argparse.ArgumentParser(description="Walk-forward con histórico de MT5")
    add_trading_args(p)
    add_period_args(p, days=730)
    p.add_argument("--mode", choices=["fixed", "optimize", "ml"], default="fixed")
    p.add_argument("--train-days", type=int, default=180)
    p.add_argument("--test-days", type=int, default=60)
    p.add_argument("--anchored", action="store_true", help="El entrenamiento siempre empieza al inicio")
    p.add_argument("--grid", default="", help="Rejilla para --mode optimize")
    p.add_argument("--ml-threshold", type=float, default=0.5)
    p.add_argument("--min-trades", type=int, default=30, help="Criterio: operaciones mínimas fuera de muestra")
    p.add_argument("--name", default="", help="Nombre del experimento")
    p.add_argument("--notes", default="")
    p.add_argument("--no-save", action="store_true", help="No registrar el experimento")
    args = p.parse_args()

    system = build_system()
    setup_logging(system.settings.logs_dir, "WARNING")
    ctx = system.ctx
    account = ctx.connect()
    date_from, date_to = period(args)
    folds = make_folds(date_from, date_to, args.train_days, args.test_days, args.anchored)
    print(f"Cuenta {account.login} ({account.mode}) · {len(folds)} ventanas de {args.train_days}d entrenamiento "
          f"+ {args.test_days}d prueba · modo {args.mode}\n")

    status = 0
    for symbol in [s.strip() for s in args.symbol.split(",") if s.strip()]:
        spec = ctx.resolver.spec(symbol)
        df = load_history(ctx.market, symbol, args.timeframe, date_from, date_to, ctx.settings.cache_dir)
        base = build_config(args, spec.name)
        result = run_walkforward(df, spec, base, folds, mode=args.mode, grid=parse_grid(args.grid),
                                 ml_threshold=args.ml_threshold)

        print(f"== {spec.name} {args.timeframe} {args.strategy} ==")
        for f in result.folds:
            extra = f" elegido {f['chosen']}" if "chosen" in f else ""
            if "test_signal_metrics" in f:
                extra = f" AUC prueba {f['test_signal_metrics'].get('auc', '-')}"
            print(f"  ventana {f['fold']}: {f['train_end'][:10]} -> {f['test_end'][:10]} | "
                  f"candidato PF {f['candidate']['profit_factor']:5.2f} ({f['candidate']['total_trades']} ops) | "
                  f"referencia PF {f['baseline']['profit_factor']:5.2f}{extra}")
        print(f"  CANDIDATO  {fmt_metrics(result.candidate)}")
        if args.mode != "fixed":
            print(f"  REFERENCIA {fmt_metrics(result.baseline)}")
        b = result.candidate["bootstrap"]
        print(f"  R medio {b['mean_r']} (IC95 {b['ci95_low']} … {b['ci95_high']}) · P(ventaja real) {b['prob_edge']}")

        if not args.no_save:
            config = {"backtest": base.to_dict(), "mode": args.mode, "grid": parse_grid(args.grid),
                      "train_days": args.train_days, "test_days": args.test_days, "anchored": args.anchored,
                      "ml_threshold": args.ml_threshold}
            name = args.name or f"{args.strategy} {spec.name} {args.timeframe} {args.mode}"
            exp_id, verdict = record_walkforward(
                system.store, name, config, result, (date_from.isoformat(), date_to.isoformat()),
                Criteria(min_trades=args.min_trades), notes=args.notes)
            print(f"\n  Experimento #{exp_id}: {'APROBADO' if verdict['passed'] else 'NO aprobado'}")
            for c in verdict["checks"]:
                print(f"    {'✔' if c['passed'] else '✘'} {c['check']}: {c['detail']}")
        print()
    system.shutdown()
    return status


if __name__ == "__main__":
    sys.exit(main())
