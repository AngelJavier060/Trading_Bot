import React from 'react';
import { Strategy } from '@/types/strategies';

interface IQOptionConfigProps {
    strategies: Strategy[];
    selectedTimeframes: string[];
    onTimeframeChange: (timeframes: string[]) => void;
    // ... otros props específicos
}

export const IQOptionConfig: React.FC<IQOptionConfigProps> = ({
    strategies,
    selectedTimeframes,
    onTimeframeChange
}) => {
    return (
        <div className="space-y-4">
            <h3>Configuración IQ Option</h3>
            {/* Configuraciones específicas para IQ Option */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h4>Timeframes Cortos</h4>
                    {/* Opciones de timeframes cortos */}
                </div>
                <div>
                    <h4>Estrategias Binarias</h4>
                    {/* Lista de estrategias para binarias */}
                </div>
            </div>
        </div>
    );
}; 