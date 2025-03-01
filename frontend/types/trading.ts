export interface TradingConfig {
    marketType: string;
    risk: number;
    timeframes: string[];
    strategies: string[];
    profitTarget: number;
    lossLimit: number;
    tradingMode: string;
} 