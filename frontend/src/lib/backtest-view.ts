import type { Metrics } from "./types";

export const LAST_BACKTEST_KEY = "tradebot_last_backtest";

export interface BacktestTradeView {
  side: "buy" | "sell";
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  net_profit: number;
  exit_reason: string;
  volume: number;
}

export interface LastBacktest {
  symbol: string;
  timeframe: string;
  days: number;
  metrics: Metrics;
  trades: BacktestTradeView[];
  equity_curve: { time: string; equity: number }[];
}

export function saveLastBacktest(data: LastBacktest) {
  try { sessionStorage.setItem(LAST_BACKTEST_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function loadLastBacktest(): LastBacktest | null {
  try {
    const raw = sessionStorage.getItem(LAST_BACKTEST_KEY);
    return raw ? JSON.parse(raw) as LastBacktest : null;
  } catch {
    return null;
  }
}
