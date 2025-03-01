import React from 'react';
import { Strategy } from '@/types/strategies';

interface TradingConfigProps {
    platform: string;
    marketType: string;
    risk: number;
    timeframes: string[];
    strategies: string[];
    profitTarget: number;
    lossLimit: number;
    tradingMode: string;
    setMarketType: (value: string) => void;
    setRisk: (value: number) => void;
    setTimeframes: (value: string[]) => void;
    setStrategies: (value: string[]) => void;
    setProfitTarget: (value: number) => void;
    setLossLimit: (value: number) => void;
    setTradingMode: (value: string) => void;
    handleSaveConfig: () => void;
}

const TradingConfig: React.FC<TradingConfigProps> = ({
    platform,
    marketType,
    risk,
    timeframes,
    strategies,
    profitTarget,
    lossLimit,
    tradingMode,
    setMarketType,
    setRisk,
    setTimeframes,
    setStrategies,
    setProfitTarget,
    setLossLimit,
    setTradingMode,
    handleSaveConfig
}) => {
    const handleTimeframeToggle = (timeframe: string) => {
        if (timeframes.includes(timeframe)) {
            setTimeframes(timeframes.filter(t => t !== timeframe));
        } else {
            setTimeframes([...timeframes, timeframe]);
        }
    };

    const handleStrategyToggle = (strategy: string) => {
        if (strategies.includes(strategy)) {
            setStrategies(strategies.filter(s => s !== strategy));
        } else {
            setStrategies([...strategies, strategy]);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-bold mb-6">Configuración de Trading - {platform}</h2>

            {/* Tipo de Mercado */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Tipo de Mercado</h3>
                <select
                    value={marketType}
                    onChange={(e) => setMarketType(e.target.value)}
                    className="w-full p-2 border rounded"
                >
                    <option value="Binarias">Opciones Binarias</option>
                    <option value="Digital">Opciones Digitales</option>
                    <option value="Forex">Forex</option>
                </select>
            </div>

            {/* Gestión de Riesgo */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-semibold mb-2">Riesgo por Operación</h3>
                    <input
                        type="number"
                        value={risk}
                        onChange={(e) => setRisk(Number(e.target.value))}
                        className="w-full p-2 border rounded"
                        min="1"
                        max="100"
                    />
                    <p className="text-sm text-gray-500 mt-1">Porcentaje del balance (%)</p>
                </div>
                <div>
                    <h3 className="text-lg font-semibold mb-2">Modo de Trading</h3>
                    <select
                        value={tradingMode}
                        onChange={(e) => setTradingMode(e.target.value)}
                        className="w-full p-2 border rounded"
                    >
                        <option value="Backtesting">Backtesting</option>
                        <option value="Demo">Demo</option>
                        <option value="Real">Real</option>
                    </select>
                </div>
            </div>

            {/* Timeframes */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Timeframes</h3>
                <div className="grid grid-cols-4 gap-2">
                    {['1m', '5m', '15m', '30m', '1h'].map(tf => (
                        <button
                            key={tf}
                            onClick={() => handleTimeframeToggle(tf)}
                            className={`p-2 border rounded ${
                                timeframes.includes(tf) ? 'bg-blue-500 text-white' : 'bg-white'
                            }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            {/* Estrategias */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Estrategias</h3>
                <div className="grid grid-cols-3 gap-2">
                    {['RSI', 'MACD', 'Bollinger', 'Tendencia', 'Martingala'].map(strat => (
                        <button
                            key={strat}
                            onClick={() => handleStrategyToggle(strat)}
                            className={`p-2 border rounded ${
                                strategies.includes(strat) ? 'bg-blue-500 text-white' : 'bg-white'
                            }`}
                        >
                            {strat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Objetivos */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-semibold mb-2">Take Profit</h3>
                    <input
                        type="number"
                        value={profitTarget}
                        onChange={(e) => setProfitTarget(Number(e.target.value))}
                        className="w-full p-2 border rounded"
                        min="0"
                    />
                    <p className="text-sm text-gray-500 mt-1">USD</p>
                </div>
                <div>
                    <h3 className="text-lg font-semibold mb-2">Stop Loss</h3>
                    <input
                        type="number"
                        value={lossLimit}
                        onChange={(e) => setLossLimit(Number(e.target.value))}
                        className="w-full p-2 border rounded"
                        min="0"
                    />
                    <p className="text-sm text-gray-500 mt-1">USD</p>
                </div>
            </div>

            <button
                onClick={handleSaveConfig}
                className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
            >
                Guardar Configuración
            </button>
        </div>
    );
};

export default TradingConfig; 