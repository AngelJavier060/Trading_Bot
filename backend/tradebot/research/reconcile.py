"""Vivo contra backtest: ¿el bot hizo en tiempo real lo que dice el backtest?

Para el periodo indicado:
- Señales: cada señal registrada por el bot (incluidas las de dry run y las
  bloqueadas) se compara con la que da la estrategia en el backtest para la misma
  vela. Si no coinciden, hay diferencias de datos o de lógica.
- Operaciones: las operaciones reales se emparejan con las del backtest por
  símbolo, vela de entrada y dirección. Se comparan en R (unidades de riesgo),
  porque el tamaño en lotes depende del balance de cada momento.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from ..backtest import BacktestConfig, BacktestEngine, load_history
from ..backtest.engine import compute_signals
from ..broker import timeframes
from ..context import Context
from ..live.engine import BotConfig
from ..storage import Store


def reconcile(ctx: Context, store: Store, config: BotConfig, date_from: datetime, date_to: datetime,
              initial_balance: float = 10_000.0) -> dict:
    params = config.params
    tf_s = timeframes.minutes(params.timeframe) * 60
    warmup_days = max(3, int(params.lookback * tf_s / 86400) + 2)
    signals_live = pd.DataFrame(store.signals(limit=100_000, since=date_from.isoformat()))
    trades_live = pd.DataFrame(store.trades(limit=100_000, since=date_from.isoformat()))

    per_symbol = {}
    for symbol in config.symbols:
        spec = ctx.resolver.spec(symbol)
        df = load_history(ctx.market, symbol, params.timeframe, date_from - timedelta(days=warmup_days), date_to,
                          ctx.settings.cache_dir)
        df = df.sort_values("time").reset_index(drop=True)
        sigs = compute_signals(params.build_strategy(), df, params, spec.name)
        bar_index = {t: i for i, t in enumerate(df["time"])}

        # ── señales ─────────────────────────────────────────────────────
        sig_rows = []
        live_s = signals_live[signals_live["symbol"] == spec.name] if len(signals_live) else signals_live
        for s in live_s.itertuples() if len(live_s) else []:
            entry_bar = pd.Timestamp(s.bar_time) + pd.Timedelta(seconds=tf_s)
            i = bar_index.get(entry_bar)
            bt = sigs[i] if i is not None else None
            bt_side = bt.signal.value if bt is not None else None
            sig_rows.append({"bar_time": s.bar_time, "live": s.side, "backtest": bt_side,
                             "match": bt_side == s.side, "decision": s.decision})

        # ── operaciones ─────────────────────────────────────────────────
        cfg = BacktestConfig(symbol=spec.name, params=params, limits=config.limits,
                             initial_balance=initial_balance, trade_from=date_from, trade_to=date_to)
        bt = BacktestEngine(cfg, spec, models_dir=ctx.settings.models_dir).run(df, signals=sigs)
        bt_by_key = {(pd.Timestamp(t.entry_time), t.side): t for t in bt.trades}
        live_t = trades_live[trades_live["symbol"] == spec.name] if len(trades_live) else trades_live
        trade_rows, used = [], set()
        for t in live_t.itertuples() if len(live_t) else []:
            if not isinstance(t.bar_time, str) or not t.bar_time:
                continue  # posición adoptada sin vela de señal
            key = (pd.Timestamp(t.bar_time) + pd.Timedelta(seconds=tf_s), t.side)
            b = bt_by_key.get(key)
            if b is not None:
                used.add(key)
            trade_rows.append({
                "ticket": t.ticket, "entry_bar": key[0].isoformat(), "side": t.side,
                "live_price": t.open_price, "backtest_price": b.entry_price if b else None,
                "slippage_points": round((t.open_price - b.entry_price) / spec.point * (1 if t.side == "buy" else -1), 1)
                if b and t.open_price else None,
                "live_r": t.r_multiple, "backtest_r": b.r_multiple if b else None,
                "live_reason": t.reason, "backtest_reason": b.exit_reason if b else None,
            })
        only_backtest = [{"entry_time": k[0].isoformat(), "side": k[1]} for k in bt_by_key if k not in used]

        matched = [r for r in trade_rows if r["backtest_r"] is not None and r["live_r"] is not None]
        per_symbol[spec.name] = {
            "signals": {
                "live": len(sig_rows),
                "agreement_pct": round(100 * np.mean([r["match"] for r in sig_rows]), 2) if sig_rows else None,
                "mismatches": [r for r in sig_rows if not r["match"]][:20],
            },
            "trades": {
                "live": len(trade_rows),
                "backtest": len(bt.trades),
                "matched": len(matched),
                "only_live": sum(1 for r in trade_rows if r["backtest_price"] is None),
                "only_backtest": len(only_backtest),
                "avg_slippage_points": round(float(np.mean([r["slippage_points"] for r in trade_rows
                                                            if r["slippage_points"] is not None])), 2)
                if any(r["slippage_points"] is not None for r in trade_rows) else None,
                "live_avg_r": round(float(np.mean([r["live_r"] for r in matched])), 3) if matched else None,
                "backtest_avg_r": round(float(np.mean([r["backtest_r"] for r in matched])), 3) if matched else None,
                "same_outcome_pct": round(100 * np.mean([np.sign(r["live_r"]) == np.sign(r["backtest_r"])
                                                         for r in matched]), 2) if matched else None,
                "rows": trade_rows,
                "only_backtest_rows": only_backtest[:20],
            },
            "backtest_metrics": bt.metrics,
        }
    return {"period": [date_from.isoformat(), date_to.isoformat()], "config": config.to_dict(), "symbols": per_symbol}
