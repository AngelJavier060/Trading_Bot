"""Métricas de rendimiento de un backtest."""

from __future__ import annotations

import math
from collections import Counter

import pandas as pd

from .models import BacktestTrade


def compute_metrics(trades: list[BacktestTrade], initial_balance: float, equity: pd.Series) -> dict:
    n = len(trades)
    nets = [t.net_profit for t in trades]
    wins = [x for x in nets if x > 0]
    losses = [x for x in nets if x < 0]
    gross_profit = sum(wins)
    gross_loss = -sum(losses)
    net = sum(nets)

    max_dd_money = max_dd_pct = 0.0
    if len(equity):
        peak = equity.cummax()
        dd = peak - equity
        max_dd_money = float(dd.max())
        max_dd_pct = float((dd / peak).max() * 100)

    max_consec_losses = streak = 0
    for x in nets:
        streak = streak + 1 if x < 0 else 0
        max_consec_losses = max(max_consec_losses, streak)

    sharpe = 0.0
    if len(equity) > 2:
        daily = equity.resample("1D").last().dropna().pct_change().dropna()
        if len(daily) > 1 and daily.std() > 0:
            sharpe = float(daily.mean() / daily.std() * math.sqrt(252))

    avg_win = gross_profit / len(wins) if wins else 0.0
    avg_loss = gross_loss / len(losses) if losses else 0.0
    return {
        "total_trades": n,
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / n * 100, 2) if n else 0.0,
        "net_profit": round(net, 2),
        "return_pct": round(net / initial_balance * 100, 2) if initial_balance else 0.0,
        "final_balance": round(initial_balance + net, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
        # Sin pérdidas el factor es infinito; se acota para que el JSON sea válido
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss else (999.99 if gross_profit else 0.0),
        "expectancy": round(net / n, 2) if n else 0.0,
        "avg_r": round(sum(t.r_multiple for t in trades) / n, 3) if n else 0.0,
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "payoff_ratio": round(avg_win / avg_loss, 2) if avg_loss else 0.0,
        "max_drawdown": round(max_dd_money, 2),
        "max_drawdown_pct": round(max_dd_pct, 2),
        "max_consecutive_losses": max_consec_losses,
        "sharpe_daily": round(sharpe, 2),
        "avg_bars_held": round(sum(t.bars_held for t in trades) / n, 1) if n else 0.0,
        "longs": sum(1 for t in trades if t.side == "buy"),
        "shorts": sum(1 for t in trades if t.side == "sell"),
        "exit_reasons": dict(Counter(t.exit_reason for t in trades)),
        "commission_total": round(sum(t.commission for t in trades), 2),
    }
