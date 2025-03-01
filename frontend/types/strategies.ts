export interface Strategy {
    id: string;
    name: string;
    description: string;
    timeframes: string[];
    platform: string[];
    type: 'short' | 'medium' | 'long';
    parameters: {
        name: string;
        type: string;
        default: any;
        description: string;
    }[];
}

export const PLATFORM_STRATEGIES: Record<string, Strategy[]> = {
    iqoption: [
        {
            id: 'rsi',
            name: 'RSI',
            description: 'Estrategia basada en el Índice de Fuerza Relativa',
            timeframes: ['1m', '5m', '15m', '30m', '1h'],
            platform: ['iqoption', 'quotex'],
            type: 'short',
            parameters: [
                {
                    name: 'period',
                    type: 'number',
                    default: 14,
                    description: 'Período RSI'
                },
                {
                    name: 'overbought',
                    type: 'number',
                    default: 70,
                    description: 'Nivel de sobrecompra'
                }
            ]
        },
        // ... más estrategias para IQ Option
    ],
    quotex: [
        {
            id: 'macd',
            name: 'MACD',
            description: 'Convergencia/Divergencia de Medias Móviles',
            timeframes: ['1m', '5m', '15m', '30m'],
            platform: ['iqoption', 'quotex'],
            type: 'short',
            parameters: [
                {
                    name: 'fastPeriod',
                    type: 'number',
                    default: 12,
                    description: 'Período rápido'
                }
            ]
        }
    ],
    mt5: [
        {
            id: 'trend_following',
            name: 'Trend Following',
            description: 'Estrategia de seguimiento de tendencia',
            timeframes: ['1h', '4h', '1d', '1w'],
            platform: ['mt5'],
            type: 'long',
            parameters: [
                {
                    name: 'ma_period',
                    type: 'number',
                    default: 200,
                    description: 'Período de Media Móvil'
                }
            ]
        }
    ]
}; 