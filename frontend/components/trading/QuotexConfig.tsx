import React from 'react';
import { Strategy } from '@/types/strategies';

interface QuotexConfigProps {
    strategies: Strategy[];
    selectedTimeframes: string[];
    onTimeframeChange: (timeframes: string[]) => void;
    // ... otros props específicos
}

export const QuotexConfig: React.FC<QuotexConfigProps> = ({
    strategies,
    selectedTimeframes,
    onTimeframeChange
}) => {
    return (
        <div className="space-y-4">
            <h3>Configuración Quotex</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h4>Timeframes</h4>
                    <div className="space-y-2">
                        {['1m', '5m', '15m', '30m'].map(timeframe => (
                            <label key={timeframe} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    checked={selectedTimeframes.includes(timeframe)}
                                    onChange={() => {
                                        const newTimeframes = selectedTimeframes.includes(timeframe)
                                            ? selectedTimeframes.filter(t => t !== timeframe)
                                            : [...selectedTimeframes, timeframe];
                                        onTimeframeChange(newTimeframes);
                                    }}
                                    className="form-checkbox"
                                />
                                <span>{timeframe}</span>
                            </label>
                        ))}
                    </div>
                </div>
                
                <div>
                    <h4>Estrategias Disponibles</h4>
                    <div className="space-y-2">
                        {strategies.map(strategy => (
                            <div key={strategy.id} className="p-2 border rounded">
                                <h5 className="font-semibold">{strategy.name}</h5>
                                <p className="text-sm text-gray-600">{strategy.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Configuraciones específicas de Quotex */}
            <div className="mt-4">
                <h4 className="font-semibold mb-2">Configuraciones Adicionales</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Tipo de Opción
                        </label>
                        <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                            <option>Binaria</option>
                            <option>Digital</option>
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Tiempo de Expiración
                        </label>
                        <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                            <option>1 minuto</option>
                            <option>5 minutos</option>
                            <option>15 minutos</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="mt-4">
                <h4 className="font-semibold mb-2">Gestión de Riesgo</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Stop Loss (%)
                        </label>
                        <input
                            type="number"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            min="0"
                            max="100"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Take Profit (%)
                        </label>
                        <input
                            type="number"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            min="0"
                            max="100"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuotexConfig; 