/** Mercado IQ Option: OTC (sufijo -OTC) vs binarias (activos sin OTC). */
export type IqMarketType = 'otc' | 'binary'

/** Configuración del panel Live (frontend) — misma forma que `live.tsx`. */
export interface LiveTradingUiConfig {
  mode: 'manual' | 'automatic'
  platform: 'iqoption' | 'mt5'
  accountType: 'DEMO' | 'REAL'
  /** OTC = pares con -OTC; binary = pares estándar u otros sin sufijo OTC. */
  iqMarketType: IqMarketType
  symbols: string[]
  strategies: string[]
  timeframe: string
  analysisInterval: number
  maxConcurrentTrades: number
  riskLevel: 'low' | 'medium' | 'high'
  tradeAmount: number
  expirationTime: number
}

/** Parámetros extra que acepta `POST /api/live/start` (motor en servidor). */
export interface LiveServerMotorConfig {
  min_confidence: number
  max_concurrent: number
  max_daily_trades: number
  use_ml: boolean
  ml_weight: number
  ml_min_probability: number
  max_consecutive_losses: number
  loss_streak_pause_minutes: number
  reset_streak_on_win: boolean
  daily_profit_target_type: 'percent' | 'fixed'
  daily_profit_target: number
  daily_loss_limit_type: 'percent' | 'fixed'
  daily_loss_limit: number
  volatility_filter_enabled: boolean
  atr_min_threshold: number
  news_filter_enabled: boolean
}

export type PersistedLiveTradingConfig = LiveTradingUiConfig & {
  serverMotor?: Partial<LiveServerMotorConfig>
  /** Primera estrategia del listado (compatibilidad); el listado real es `strategies`. */
  strategyId?: string
  /** Overrides por estrategia: { ema_rsi: { ema_fast: 20, ... } } */
  strategyParamOverrides?: Record<string, Record<string, number>>
}

export const LIVE_TRADING_STORAGE_KEY = 'live_trading_config'

export const DEFAULT_LIVE_UI: LiveTradingUiConfig = {
  mode: 'manual',
  platform: 'iqoption',
  accountType: 'DEMO',
  iqMarketType: 'otc',
  symbols: ['EURUSD-OTC', 'GBPUSD-OTC'],
  strategies: ['ema_rsi'],
  timeframe: '5m',
  analysisInterval: 30,
  maxConcurrentTrades: 3,
  riskLevel: 'medium',
  tradeAmount: 10,
  expirationTime: 5,
}

export const DEFAULT_SERVER_MOTOR: LiveServerMotorConfig = {
  min_confidence: 68,
  max_concurrent: 3,
  max_daily_trades: 50,
  use_ml: true,
  ml_weight: 0.2,
  ml_min_probability: 0.55,
  max_consecutive_losses: 3,
  loss_streak_pause_minutes: 30,
  reset_streak_on_win: true,
  daily_profit_target_type: 'percent',
  daily_profit_target: 15,
  daily_loss_limit_type: 'percent',
  daily_loss_limit: 10,
  volatility_filter_enabled: true,
  atr_min_threshold: 0.03,
  news_filter_enabled: true,
}

export function loadPersistedLiveConfig(): PersistedLiveTradingConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LIVE_TRADING_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PersistedLiveTradingConfig>
    return {
      ...DEFAULT_LIVE_UI,
      ...p,
      iqMarketType: p.iqMarketType === 'binary' ? 'binary' : 'otc',
      symbols: Array.isArray(p.symbols) ? p.symbols : DEFAULT_LIVE_UI.symbols,
      strategies: Array.isArray(p.strategies) ? p.strategies : DEFAULT_LIVE_UI.strategies,
      serverMotor: p.serverMotor && typeof p.serverMotor === 'object' ? p.serverMotor : undefined,
      strategyId: typeof p.strategyId === 'string' ? p.strategyId : undefined,
      strategyParamOverrides:
        p.strategyParamOverrides && typeof p.strategyParamOverrides === 'object'
          ? p.strategyParamOverrides
          : undefined,
    }
  } catch {
    return null
  }
}

export function savePersistedLiveConfig(cfg: PersistedLiveTradingConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LIVE_TRADING_STORAGE_KEY, JSON.stringify(cfg))
}
