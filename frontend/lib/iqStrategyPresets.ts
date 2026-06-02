/**
 * Nombres visibles y preset alineado con `backend/services/strategies/ema_trend_continuation.py`
 */
export const IQ_STRATEGY_DISPLAY_NAME: Record<string, string> = {
  ema_rsi: "EMA + RSI",
  ema_trend_continuation: "EMA Trend Continuation + RSI + ADX",
  macd: "MACD",
  bollinger: "Bollinger Bands",
  rsi_divergence: "RSI Divergence",
  ichimoku: "Ichimoku",
  price_action_key_levels: "Price Action Reversal at Key Levels",
}

/** Parámetros numéricos predeterminados (mismo criterio que el backend). */
export const EMA_TREND_CONTINUATION_PRESET: Record<string, number> = {
  ema_fast: 20,
  ema_slow: 50,
  rsi_period: 14,
  adx_period: 14,
  adx_threshold: 20,
}

export const PRICE_ACTION_KEY_LEVELS_PRESET: Record<string, number> = {
  lookback_15m: 200,
  zone_tolerance_pct: 0.1,
  min_touches: 2,
  max_wait_5m_bars: 6,
  strength_body_ratio: 0.7,
  doji_max_body_pct: 0.05,
  doji_min_wick_pct: 0.1,
  session_start_ec: 8,
  session_end_ec: 12,
}

/** Velas 5m → expiración 3× = 15 min. Timeframe de análisis en vivo (panel). */
export const EMA_TREND_LIVE_PRESET = {
  timeframe: "5m" as const,
  expirationTime: 15,
  /** Segundos entre escaneos (5 min = una vela nueva aprox.) */
  analysisInterval: 300,
}

/** Misma cadencia operativa: 5m + expiración 15m (documento técnico). */
export const PRICE_ACTION_LIVE_PRESET = {
  timeframe: "5m" as const,
  expirationTime: 15,
  analysisInterval: 300,
}
