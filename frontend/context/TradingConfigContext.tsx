import React, { createContext, useContext, useReducer } from 'react';

interface TradingState {
    marketType: string;
    risk: number;
    timeframes: string[];
    strategies: string[];
    profitTarget: number;
    lossLimit: number;
    tradingMode: string;
}

const TradingConfigContext = createContext<{
    state: TradingState;
    dispatch: React.Dispatch<any>;
} | undefined>(undefined);

export const useTradingConfig = () => {
    const context = useContext(TradingConfigContext);
    if (!context) {
        throw new Error('useTradingConfig debe usarse dentro de TradingConfigProvider');
    }
    return context;
}; 