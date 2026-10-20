// Tipos de los datos que devuelve el backend.

export interface Account {
  login: number;
  server: string;
  name: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  leverage: number;
  mode: "demo" | "contest" | "real";
  trade_allowed: boolean;
  is_demo: boolean;
}

export interface Position {
  ticket: number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  profit: number;
  time_open: string;
  magic: number;
  comment: string;
}

export interface StrategyParams {
  strategy: string;
  strategy_params: Record<string, number | boolean>;
  timeframe: string;
  htf_timeframe: string | null;
  min_confidence: number;
  atr_period: number;
  sl_atr_mult: number;
  tp_atr_mult: number;
  min_sl_spread_mult: number;
  max_bars_in_trade: number;
  lookback: number;
  ml_model: string;
  ml_threshold: number;
}

export interface RiskLimits {
  risk_per_trade_pct: number;
  max_daily_loss_pct: number;
  max_open_positions: number;
  max_trades_per_day: number;
  max_spread_points: number;
  one_position_per_symbol: boolean;
}

export interface BotConfig {
  symbols: string[];
  params: StrategyParams;
  limits: RiskLimits;
  poll_seconds: number;
  dry_run: boolean;
}

export interface SymbolState {
  last_bar: string | null;
  last_signal: { bar: string; signal: string; confidence: number } | null;
  last_decision: string;
  error: string;
}

export interface BotStatus {
  running: boolean;
  wants_to_run: boolean;
  started_at: string | null;
  heartbeat_age_s: number | null;
  last_error: string;
  errors_in_a_row: number;
  config: BotConfig | null;
  day: string | null;
  day_start_equity: number;
  trades_today: number;
  symbols: Record<string, SymbolState>;
  open_positions: Position[];
}

export interface LiveStatus {
  health: { ok: boolean; reason: string };
  mt5: { connected: boolean; account: Account | null; last_error?: (string | number)[] | null };
  bot: BotStatus;
}

export interface Signal {
  id: number;
  ts: string;
  bar_time: string;
  symbol: string;
  side: "buy" | "sell";
  confidence: number | null;
  strategy: string | null;
  decision: "opened" | "dry_run" | "blocked" | "rejected" | "ml_filtered";
  reason: string | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  volume: number | null;
  ml_prob: number | null;
  ticket: number | null;
  account: number | null;
}

export interface Trade {
  ticket: number;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  strategy: string | null;
  bar_time: string | null;
  open_time: string;
  open_price: number | null;
  sl: number | null;
  tp: number | null;
  risk_money: number | null;
  ml_prob: number | null;
  close_time: string | null;
  close_price: number | null;
  net_profit: number | null;
  reason: string | null;
  result: string | null;
  r_multiple: number | null;
}

export interface TradeStats {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  net_profit: number;
  profit_factor: number;
  avg_r: number;
}

export interface Metrics {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  net_profit: number;
  return_pct: number;
  profit_factor: number;
  expectancy: number;
  avg_r: number;
  max_drawdown_pct: number;
  max_consecutive_losses: number;
  bootstrap?: { prob_edge: number; mean_r: number; ci95_low: number | null; ci95_high: number | null };
}

export interface Experiment {
  id: number;
  created: string;
  name: string;
  kind: string;
  status: "candidate" | "promoted" | "rejected" | "info";
  config: Record<string, unknown>;
  period_start: string | null;
  period_end: string | null;
  metrics: { candidate?: Metrics; baseline?: Metrics; folds?: unknown[] } & Record<string, unknown>;
  verdict: { passed: boolean; checks: { check: string; passed: boolean; detail: string }[] } | null;
  code_version: string | null;
}

export interface StrategyInfo {
  id: string;
  name: string;
  description: string;
  params: Record<string, number | boolean>;
  min_candles: number;
  catalog: {
    nombre: string;
    tipo: string;
    como_funciona: string;
    timeframes: string[];
    params: Record<string, string>;
  };
  last_evaluation: {
    experiment: number;
    passed: boolean | null;
    profit_factor: number | null;
    avg_r: number | null;
    trades: number | null;
  } | null;
}

export interface SavedAccount {
  key: string;
  login: number;
  server: string;
  label: string;
  kind: "demo" | "real";
  path: string;
  has_password: boolean;
  last_used: string;
  name: string;
  currency: string;
}

export interface ModelInfo {
  id: string;
  strategy?: string;
  timeframe?: string;
  samples?: number;
  validation?: { auc?: number };
}

export interface User {
  id: number;
  username: string;
  role: string;
  created?: string;
  last_login?: string | null;
}
