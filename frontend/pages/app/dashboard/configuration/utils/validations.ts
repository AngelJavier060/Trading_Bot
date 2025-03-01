import { TradingConfig } from '@/types/trading';

export const validateTradingConfig = (config: TradingConfig) => {
    const errors: Record<string, string> = {};

    if (config.risk < 1 || config.risk > 100) {
        errors.risk = 'El riesgo debe estar entre 1% y 100%';
    }

    if (config.timeframes.length === 0) {
        errors.timeframes = 'Debe seleccionar al menos una temporalidad';
    }

    if (config.strategies.length === 0) {
        errors.strategies = 'Debe seleccionar al menos una estrategia';
    }

    return errors;
}; 