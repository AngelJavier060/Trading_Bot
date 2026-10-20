"""Entrena el filtro ML para una estrategia y lo guarda en data/models.

Antes de usar un modelo en vivo, valida que mejora a la estrategia sin filtro:
    .venv\\Scripts\\python scripts\\walkforward.py --mode ml --strategy macd ...

Ejemplo:
    .venv\\Scripts\\python scripts\\train_model.py --symbol EURUSD,GBPUSD,XAUUSD --timeframe H1 --strategy macd --days 730
Luego, en la configuración del bot: "params": {"ml_model": "<id>", "ml_threshold": 0.5, ...}
"""

from __future__ import annotations

import argparse
import sys

import pandas as pd
from _common import add_period_args, add_trading_args, build_config, period, utf8_console

from tradebot.app import build_system
from tradebot.backtest import load_history
from tradebot.logging_setup import setup_logging
from tradebot.ml.labeling import build_signal_dataset
from tradebot.ml.train import train_model


def main() -> int:
    utf8_console()
    p = argparse.ArgumentParser(description="Entrenar el filtro ML de señales")
    add_trading_args(p)
    add_period_args(p, days=730)
    args = p.parse_args()

    system = build_system()
    setup_logging(system.settings.logs_dir, "WARNING")
    ctx = system.ctx
    ctx.connect()
    date_from, date_to = period(args)

    datasets, names = [], []
    for symbol in [s.strip() for s in args.symbol.split(",") if s.strip()]:
        spec = ctx.resolver.spec(symbol)
        df = load_history(ctx.market, symbol, args.timeframe, date_from, date_to, ctx.settings.cache_dir)
        params = build_config(args, spec.name).params
        data = build_signal_dataset(df, spec, params, spread_points=args.spread)
        print(f"{spec.name}: {len(data)} señales · ganadoras {data['label'].mean() * 100:.1f}%")
        datasets.append(data)
        names.append(spec.name)

    dataset = pd.concat(datasets, ignore_index=True)
    model = train_model(dataset, params, names)
    path = model.save(system.settings.models_dir)
    v = model.info.validation
    print(f"\nModelo {model.info.id} guardado en {path}")
    print(f"Validación (último 20%, no visto): AUC {v.get('auc', '-')} · Brier {v.get('brier', '-')} · "
          f"{v['samples']} señales · base {v['base_rate'] * 100:.1f}% ganadoras")
    print("AUC 0.5 = no distingue nada; > 0.55 empieza a ser útil. Confírmalo con walkforward.py --mode ml.")
    system.store.add_experiment(
        name=f"modelo {model.info.id}", kind="ml_model", config=model.info.to_dict(),
        metrics=v, status="info", period_start=date_from.isoformat(), period_end=date_to.isoformat(),
        artifacts={"model_path": str(path)},
    )
    system.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
