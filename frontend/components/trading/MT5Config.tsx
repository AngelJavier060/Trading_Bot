import React, { useState } from 'react';
import { Strategy } from '@/types/strategies';

interface MT5ConfigProps {
    strategies: Strategy[];
    selectedTimeframes: string[];
    onTimeframeChange: (timeframes: string[]) => void;
    onConnect: (credentials: any) => Promise<void>;
}

export const MT5Config: React.FC<MT5ConfigProps> = ({
    strategies,
    selectedTimeframes,
    onTimeframeChange,
    onConnect
}) => {
    const [credentials, setCredentials] = useState({
        login: '',
        password: '',
        is_demo: true
    });

    const handleConnect = async () => {
        try {
            await onConnect({
                ...credentials,
                login: parseInt(credentials.login)
            });
        } catch (error) {
            console.error('Error al conectar:', error);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configuración Admiral Markets MT5</h3>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">
                        Número de Cuenta
                    </label>
                    <input
                        type="text"
                        value={credentials.login}
                        onChange={(e) => setCredentials({
                            ...credentials,
                            login: e.target.value
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        placeholder="12345678"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">
                        Contraseña
                    </label>
                    <input
                        type="password"
                        value={credentials.password}
                        onChange={(e) => setCredentials({
                            ...credentials,
                            password: e.target.value
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    />
                </div>

                <div>
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            checked={credentials.is_demo}
                            onChange={(e) => setCredentials({
                                ...credentials,
                                is_demo: e.target.checked
                            })}
                            className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="ml-2">Cuenta Demo</span>
                    </label>
                </div>

                <button
                    onClick={handleConnect}
                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                    Conectar con Admiral Markets
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h4>Timeframes Largos</h4>
                    {/* Opciones de timeframes largos */}
                </div>
                <div>
                    <h4>Estrategias Forex</h4>
                    {/* Lista de estrategias para forex */}
                </div>
            </div>
            {/* Configuraciones específicas de MT5 */}
            <div>
                <h4>Configuración de Lotes</h4>
                {/* Configuración de tamaño de lotes */}
            </div>
        </div>
    );
}; 