"""Utilidades compartidas por los scripts de línea de comandos."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def utf8_console() -> None:
    sys.stdout.reconfigure(encoding="utf-8")


def period(args) -> tuple[datetime, datetime]:
    """(desde, hasta) en UTC a partir de --from/--to/--days."""
    date_to = (datetime.strptime(args.date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc)
               if getattr(args, "date_to", None) else datetime.now(timezone.utc))
    date_from = (datetime.strptime(args.date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                 if getattr(args, "date_from", None) else date_to - timedelta(days=args.days))
    return date_from, date_to


def add_period_args(p, days: int = 365) -> None:
    p.add_argument("--days", type=int, default=days, help="Días hacia atrás (si no se da --from)")
    p.add_argument("--from", dest="date_from", help="YYYY-MM-DD")
    p.add_argument("--to", dest="date_to", help="YYYY-MM-DD (por defecto hoy)")


def add_trading_args(p) -> None:
    p.add_argument("--symbol", default="EURUSD", help="Uno o varios separados por coma")
    p.add_argument("--timeframe", default="M15")
    p.add_argument("--strategy", default="macd")
    p.add_argument("--risk", type=float, default=0.5, help="%% de riesgo por operación")
    p.add_argument("--sl-atr", type=float, default=1.5)
    p.add_argument("--tp-atr", type=float, default=2.5, help="0 = sin TP")
    p.add_argument("--max-bars", type=int, default=0, help="Cierre por tiempo en velas (0 = no)")
    p.add_argument("--min-sl-spread", type=float, default=5.0)
    p.add_argument("--min-conf", type=float, default=0.0)
    p.add_argument("--balance", type=float, default=10_000)
    p.add_argument("--spread", type=int, default=None, help="Spread fijo en puntos (por defecto el histórico)")
    p.add_argument("--commission", type=float, default=0.0)


def build_config(args, symbol: str, strategy: str | None = None):
    from tradebot.backtest import BacktestConfig
    from tradebot.planner import StrategyParams
    from tradebot.risk import RiskLimits

    return BacktestConfig(
        symbol=symbol,
        params=StrategyParams(
            strategy=strategy or args.strategy, timeframe=args.timeframe, min_confidence=args.min_conf,
            sl_atr_mult=args.sl_atr, tp_atr_mult=args.tp_atr, max_bars_in_trade=args.max_bars,
            min_sl_spread_mult=args.min_sl_spread,
            ml_model=getattr(args, "ml_model", "") or "", ml_threshold=getattr(args, "ml_threshold", 0.5),
        ),
        limits=RiskLimits(risk_per_trade_pct=args.risk, max_daily_loss_pct=getattr(args, "max_daily_loss", 3.0),
                          max_trades_per_day=getattr(args, "max_trades_day", 10)),
        initial_balance=args.balance,
        spread_points=args.spread,
        commission_per_lot=args.commission,
    )


def fmt_metrics(m: dict) -> str:
    return (f"ops {m['total_trades']:4} · win {m['win_rate']:5.1f}% · PF {m['profit_factor']:5.2f} · "
            f"R medio {m['avg_r']:+.3f} · neto {m['net_profit']:+10.2f} · DD {m['max_drawdown_pct']:5.1f}%")
