export interface Strategy {
    id: string
    name: string
    description: string
    timeframes: string[]
    platform: string[]
    type: 'scalping' | 'short' | 'medium' | 'long'
    parameters: {
        name: string
        type: string
        default: any
        description: string
    }[]
}

export const PLATFORM_STRATEGIES: Record<string, Strategy[]> = {
    iqoption: [
        {
            id: 'ema_rsi',
            name: 'EMA + RSI',
            description: 'Cruce de medias (EMA20/50) + RSI. Ideal para tendencias claras en 5m.',
            timeframes: ['1m', '5m', '15m', '30m'],
            platform: ['iqoption'],
            type: 'short',
            parameters: [
                { name: 'ema_fast', type: 'number', default: 20, description: 'EMA rápida' },
                { name: 'ema_slow', type: 'number', default: 50, description: 'EMA lenta' },
                { name: 'rsi_period', type: 'number', default: 14, description: 'Período RSI' },
                { name: 'rsi_oversold', type: 'number', default: 30, description: 'Sobreventa' },
                { name: 'rsi_overbought', type: 'number', default: 70, description: 'Sobrecompra' },
            ],
        },
        {
            id: 'ema_trend_continuation',
            name: 'Seguimiento de tendencia EMA + RSI + ADX',
            description: 'Continuación de tendencia: 5 pasos (EMA 20/50, pullback, ADX>20, RSI fuerza, vela confirmadora). Recomendado solo en 5m.',
            timeframes: ['5m'],
            platform: ['iqoption'],
            type: 'short',
            parameters: [
                { name: 'ema_fast', type: 'number', default: 20, description: 'EMA rápida (tendencia)' },
                { name: 'ema_slow', type: 'number', default: 50, description: 'EMA lenta (tendencia)' },
                { name: 'rsi_period', type: 'number', default: 14, description: 'Período RSI (fuerza, no 70/30)' },
                { name: 'adx_period', type: 'number', default: 14, description: 'Período ADX' },
                { name: 'adx_threshold', type: 'number', default: 20, description: 'ADX mínimo (debajo = lateral)' },
            ],
        },
        {
            id: 'price_action_key_levels',
            name: 'Reversión por price action en niveles clave',
            description:
                '15m traza niveles S/R; 5m confirma con martillo, estrella fugaz, engulfing o doji+confirmación. Expiración 15m. Ecuador 08:00–12:00.',
            timeframes: ['5m', '15m'],
            platform: ['iqoption'],
            type: 'short',
            parameters: [
                { name: 'lookback_15m', type: 'number', default: 200, description: 'Velas 15m para niveles' },
                { name: 'zone_tolerance_pct', type: 'number', default: 0.1, description: 'Tolerancia zona ±%' },
                { name: 'min_touches', type: 'number', default: 2, description: 'Toques mínimos en nivel' },
                { name: 'max_wait_5m_bars', type: 'number', default: 6, description: 'Máx. velas 5m en espera en zona' },
                { name: 'strength_body_ratio', type: 'number', default: 0.7, description: 'Cuerpo/rango vela de fuerza' },
                { name: 'doji_max_body_pct', type: 'number', default: 0.05, description: 'Doji: cuerpo máx. % precio' },
                { name: 'doji_min_wick_pct', type: 'number', default: 0.1, description: 'Doji: mecha mín. % precio' },
                { name: 'session_start_ec', type: 'number', default: 8, description: 'Inicio sesión Ecuador (h)' },
                { name: 'session_end_ec', type: 'number', default: 12, description: 'Fin sesión Ecuador (h)' },
            ],
        },
        {
            id: 'macd',
            name: 'MACD',
            description: 'Convergencia/Divergencia. Cruce de líneas MACD y señal.',
            timeframes: ['1m', '5m', '15m', '30m'],
            platform: ['iqoption'],
            type: 'short',
            parameters: [
                { name: 'fastPeriod', type: 'number', default: 12, description: 'Período rápido' },
                { name: 'slowPeriod', type: 'number', default: 26, description: 'Período lento' },
                { name: 'signalPeriod', type: 'number', default: 9, description: 'Período señal' },
            ],
        },
        {
            id: 'bollinger',
            name: 'Bandas de Bollinger',
            description: 'Reversión a la media usando Bandas de Bollinger.',
            timeframes: ['1m', '5m', '15m', '30m'],
            platform: ['iqoption'],
            type: 'short',
            parameters: [
                { name: 'period', type: 'number', default: 20, description: 'Período' },
                { name: 'std_dev', type: 'number', default: 2, description: 'Desviaciones estándar' },
            ],
        },
        {
            id: 'rsi_divergence',
            name: 'Divergencias RSI',
            description: 'Detección de divergencias precio-RSI. Agotamiento de tendencia.',
            timeframes: ['5m', '15m', '30m'],
            platform: ['iqoption'],
            type: 'short',
            parameters: [
                { name: 'rsi_period', type: 'number', default: 14, description: 'Período RSI' },
                { name: 'divergence_lookback', type: 'number', default: 10, description: 'Velas atrás' },
            ],
        },
        {
            id: 'ichimoku',
            name: 'Ichimoku',
            description: 'Sistema de nubes. Solo disponible en mercados REAL (no OTC).',
            timeframes: ['5m', '15m', '30m', '1h'],
            platform: ['iqoption'],
            type: 'medium',
            parameters: [
                { name: 'tenkan_period', type: 'number', default: 9, description: 'Tenkan' },
                { name: 'kijun_period', type: 'number', default: 26, description: 'Kijun' },
                { name: 'senkou_period', type: 'number', default: 52, description: 'Senkou' },
            ],
        },
    ],
    mt5: [
        {
            id: 'trend_following',
            name: 'Trend Following',
            description: 'Seguimiento de tendencia con EMA200 + RSI + ADX. Forex 1h+.',
            timeframes: ['1h', '4h', '1d'],
            platform: ['mt5'],
            type: 'long',
            parameters: [
                { name: 'ma_period', type: 'number', default: 200, description: 'EMA principal' },
                { name: 'rsi_period', type: 'number', default: 14, description: 'Período RSI' },
                { name: 'adx_threshold', type: 'number', default: 25, description: 'Mínimo ADX' },
            ],
        },
        {
            id: 'ema_rsi',
            name: 'EMA + RSI',
            description: 'Cruce EMA20/50 + RSI. Adaptado para MT5.',
            timeframes: ['15m', '30m', '1h', '4h'],
            platform: ['mt5'],
            type: 'medium',
            parameters: [
                { name: 'ema_fast', type: 'number', default: 20, description: 'EMA rápida' },
                { name: 'ema_slow', type: 'number', default: 50, description: 'EMA lenta' },
                { name: 'rsi_period', type: 'number', default: 14, description: 'Período RSI' },
            ],
        },
        {
            id: 'macd',
            name: 'MACD',
            description: 'MACD para Forex. Señales en temporalidades altas.',
            timeframes: ['1h', '4h', '1d'],
            platform: ['mt5'],
            type: 'long',
            parameters: [
                { name: 'fastPeriod', type: 'number', default: 12, description: 'Período rápido' },
                { name: 'slowPeriod', type: 'number', default: 26, description: 'Período lento' },
                { name: 'signalPeriod', type: 'number', default: 9, description: 'Período señal' },
            ],
        },
    ],
    mt4: [
        {
            id: 'trend_following',
            name: 'Trend Following',
            description: 'Seguimiento de tendencia clásico para MT4.',
            timeframes: ['1h', '4h', '1d', '1w'],
            platform: ['mt4'],
            type: 'long',
            parameters: [
                { name: 'ma_period', type: 'number', default: 200, description: 'Período EMA' },
                { name: 'rsi_period', type: 'number', default: 14, description: 'Período RSI' },
            ],
        },
    ],
}

export function getStrategiesForPlatform(platform: string): Strategy[] {
    return PLATFORM_STRATEGIES[platform] || []
}

export function getStrategyById(platform: string, id: string): Strategy | undefined {
    return PLATFORM_STRATEGIES[platform]?.find(s => s.id === id)
} 