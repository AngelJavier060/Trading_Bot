"""Backtest desde la línea de comandos con histórico real de MT5.

Ejemplos (desde la carpeta backend, con el terminal MT5 abierto):
    .venv\\Scripts\\python scripts\\backtest.py --symbol EURUSD --timeframe M15 --strategy macd --days 180
    .venv\\Scripts\\python scripts\\backtest.py --symbol EURUSD,GBPUSD --strategy all --days 365 --save
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tradebot.backtest import BacktestConfig, BacktestEngine, load_history  # noqa: E402
from tradebot.context import build_context  # noqa: E402
from tradebot.logging_setup import setup_logging  # noqa: E402
from tradebot.planner import StrategyParams  # noqa: E402
from tradebot.risk import RiskLimits  # noqa: E402
from tradebot.strategies import AVAILABLE_STRATEGIES  # noqa: E402

COLUMNS = [
    ("symbol", "Símbolo", 10), ("strategy", "Estrategia", 24), ("total_trades", "Ops", 5),
    ("win_rate", "Win%", 6), ("profit_factor", "PF", 6), ("net_profit", "Neto", 10),
    ("return_pct", "Ret%", 7), ("max_drawdown_pct", "DD%", 6), ("avg_r", "R prom", 7),
    ("max_consecutive_losses", "Pérd.seg", 8),
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Backtest de estrategias con datos de MT5")
    p.add_argument("--symbol", default="EURUSD", help="Uno o varios separados por coma")
    p.add_argument("--timeframe", default="M15")
    p.add_argument("--strategy", default="ema_rsi", help=f"'all' o una de: {', '.join(AVAILABLE_STRATEGIES)}")
    p.add_argument("--days", type=int, default=180, help="Días hacia atrás (si no se da --from)")
    p.add_argument("--from", dest="date_from", help="YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", help="YYYY-MM-DD (por defecto hoy)")
    p.add_argument("--balance", type=float, default=10_000)
    p.add_argument("--risk", type=float, default=0.5, help="%% de riesgo por operación")
    p.add_argument("--sl-atr", type=float, default=1.5)
    p.add_argument("--tp-atr", type=float, default=2.5, help="0 = sin TP")
    p.add_argument("--max-bars", type=int, default=0, help="Cierre por tiempo en velas (0 = no)")
    p.add_argument("--min-sl-spread", type=float, default=5.0, help="SL mínimo en múltiplos del spread")
    p.add_argument("--ml-model", default="", help="Id de modelo ML para filtrar señales")
    p.add_argument("--ml-threshold", type=float, default=0.5)
    p.add_argument("--min-conf", type=float, default=0, help="Confianza mínima de la señal (%%)")
    p.add_argument("--max-daily-loss", type=float, default=3.0)
    p.add_argument("--max-trades-day", type=int, default=10)
    p.add_argument("--spread", type=int, default=None, help="Spread fijo en puntos (por defecto el histórico)")
    p.add_argument("--commission", type=float, default=0.0, help="Comisión por lote y lado")
    p.add_argument("--slippage", type=int, default=0, help="Deslizamiento en puntos")
    p.add_argument("--refresh", action="store_true", help="Ignorar caché de histórico")
    p.add_argument("--save", action="store_true", help="Guardar el informe JSON en data/backtests")
    p.add_argument("--trades", action="store_true", help="Imprimir la lista de operaciones")
    return p.parse_args()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    ctx = build_context()
    setup_logging(ctx.settings.data_dir / "logs", "WARNING")

    date_to = datetime.strptime(args.date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) if args.date_to else datetime.now(timezone.utc)
    date_from = (
        datetime.strptime(args.date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if args.date_from else date_to - timedelta(days=args.days)
    )
    strategies = list(AVAILABLE_STRATEGIES) if args.strategy == "all" else [s.strip() for s in args.strategy.split(",")]
    symbols = [s.strip() for s in args.symbol.split(",") if s.strip()]

    account = ctx.connect()
    print(f"Cuenta {account.login} @ {account.server} ({account.mode}) — {account.currency}")
    print(f"Periodo {date_from:%Y-%m-%d} -> {date_to:%Y-%m-%d} | TF {args.timeframe} | riesgo {args.risk}% | "
          f"SL {args.sl_atr} ATR | TP {args.tp_atr} ATR | cierre tiempo {args.max_bars or 'no'}\n")

    rows, reports = [], []
    for symbol in symbols:
        spec = ctx.resolver.spec(symbol)
        df = load_history(ctx.market, symbol, args.timeframe, date_from, date_to, ctx.settings.cache_dir, args.refresh)
        print(f"{symbol} -> {spec.name}: {len(df)} velas, spread actual {spec.spread} pts, "
              f"tick {spec.tick_value} {account.currency}/lote")
        for strategy in strategies:
            config = BacktestConfig(
                symbol=spec.name,
                params=StrategyParams(
                    strategy=strategy, timeframe=args.timeframe, min_confidence=args.min_conf,
                    sl_atr_mult=args.sl_atr, tp_atr_mult=args.tp_atr, max_bars_in_trade=args.max_bars,
                    min_sl_spread_mult=args.min_sl_spread, ml_model=args.ml_model, ml_threshold=args.ml_threshold,
                ),
                limits=RiskLimits(
                    risk_per_trade_pct=args.risk, max_daily_loss_pct=args.max_daily_loss,
                    max_trades_per_day=args.max_trades_day,
                ),
                initial_balance=args.balance,
                spread_points=args.spread,
                commission_per_lot=args.commission,
                slippage_points=args.slippage,
            )
            result = BacktestEngine(config, spec, models_dir=ctx.settings.models_dir).run(df)
            rows.append({"symbol": spec.name, "strategy": strategy, **result.metrics})
            reports.append(result)
            if args.trades:
                for t in result.trades:
                    print(f"   {t.entry_time[:16]} {t.side:4} {t.volume:5.2f} @ {t.entry_price} -> {t.exit_price} "
                          f"[{t.exit_reason}] {t.net_profit:+.2f} ({t.r_multiple:+.2f}R)")

    print()
    _print_table(sorted(rows, key=lambda r: (r["profit_factor"], r["net_profit"]), reverse=True))

    if args.save:
        out_dir = ctx.settings.reports_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = out_dir / f"backtest_{stamp}.json"
        out.write_text(json.dumps([r.to_dict() for r in reports], indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nInforme guardado en {out}")
    return 0


def _print_table(rows: list[dict]) -> None:
    print("  ".join(f"{title:>{w}}" for _, title, w in COLUMNS))
    for r in rows:
        print("  ".join(f"{_fmt(r.get(key)):>{w}}" for key, _, w in COLUMNS))


def _fmt(v) -> str:
    return f"{v:.2f}" if isinstance(v, float) else str(v)


if __name__ == "__main__":
    sys.exit(main())
