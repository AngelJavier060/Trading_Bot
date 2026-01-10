import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '@/services/api';
import Signals from './Signals';

interface AccountInfo {
    account_type: string;
    balance: number;
    currency?: string;
    email?: string;
}

interface DashboardState {
    accountInfo: AccountInfo | null;
    isConnected: boolean;
    assets: string[];
    loading: boolean;
    error: string | null;
}

export default function Dashboard() {
    const [state, setState] = useState<DashboardState>({
        accountInfo: null,
        isConnected: false,
        assets: [],
        loading: true,
        error: null,
    });
    const router = useRouter();

    const checkConnection = useCallback(async () => {
        try {
            const response = await api.checkConnection();
            if (response.status === 'connected') {
                setState((prev) => ({ ...prev, isConnected: true }));
                
                // Obtener info de cuenta
                try {
                    const accountInfo = await api.getAccountInfo();
                    setState((prev) => ({ ...prev, accountInfo }));
                } catch (e) {
                    console.log('No se pudo obtener info de cuenta');
                }

                // Obtener activos disponibles
                try {
                    const assetsData = await api.getAssets();
                    if (assetsData.activos) {
                        setState((prev) => ({ 
                            ...prev, 
                            assets: Object.keys(assetsData.activos).filter(
                                (a) => assetsData.activos[a].open
                            )
                        }));
                    }
                } catch (e) {
                    console.log('No se pudieron obtener activos');
                }
            } else {
                setState((prev) => ({ ...prev, isConnected: false }));
            }
        } catch (error) {
            setState((prev) => ({ ...prev, isConnected: false }));
        } finally {
            setState((prev) => ({ ...prev, loading: false }));
        }
    }, []);

    useEffect(() => {
        checkConnection();
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, [checkConnection]);

    const handleDisconnect = async () => {
        try {
            await api.disconnect();
            setState((prev) => ({ 
                ...prev, 
                isConnected: false, 
                accountInfo: null,
                assets: []
            }));
        } catch (error) {
            console.error('Error al desconectar:', error);
        }
    };

    const navigateTo = (path: string) => {
        router.push(path);
    };

    if (state.loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Cargando dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold text-gray-800">🤖 Trading Bot IA</h1>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            state.isConnected 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                        }`}>
                            {state.isConnected ? '● Conectado' : '○ Desconectado'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        {state.isConnected && (
                            <button
                                onClick={handleDisconnect}
                                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                Desconectar
                            </button>
                        )}
                        <button
                            onClick={() => navigateTo('/app/dashboard/configuration')}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            ⚙️ Configuración
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-6">
                {/* Account Info Card */}
                {state.accountInfo && (
                    <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="text-center p-4 bg-blue-50 rounded-lg">
                                <p className="text-xs text-gray-500 uppercase mb-1">Tipo de Cuenta</p>
                                <p className={`text-xl font-bold ${
                                    state.accountInfo.account_type === 'REAL' 
                                        ? 'text-green-600' 
                                        : 'text-blue-600'
                                }`}>
                                    {state.accountInfo.account_type}
                                </p>
                            </div>
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <p className="text-xs text-gray-500 uppercase mb-1">Balance</p>
                                <p className="text-xl font-bold text-green-600">
                                    ${state.accountInfo.balance?.toFixed(2) || '0.00'}
                                </p>
                            </div>
                            <div className="text-center p-4 bg-purple-50 rounded-lg">
                                <p className="text-xs text-gray-500 uppercase mb-1">Moneda</p>
                                <p className="text-xl font-bold text-purple-600">
                                    {state.accountInfo.currency || 'USD'}
                                </p>
                            </div>
                            <div className="text-center p-4 bg-orange-50 rounded-lg">
                                <p className="text-xs text-gray-500 uppercase mb-1">Activos Disponibles</p>
                                <p className="text-xl font-bold text-orange-600">
                                    {state.assets.length}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quick Actions - First Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <button
                        onClick={() => navigateTo('/app/dashboard/trading/demo')}
                        className="p-6 bg-gradient-to-br from-green-400 to-green-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all group"
                    >
                        <span className="text-3xl mb-2 block">🎮</span>
                        <span className="font-bold">Trading Demo</span>
                        <p className="text-xs text-green-100 mt-1">Practica sin riesgo</p>
                    </button>
                    
                    <button
                        onClick={() => navigateTo('/app/dashboard/trading/live')}
                        className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all group"
                    >
                        <span className="text-3xl mb-2 block">📊</span>
                        <span className="font-bold">Trading en Vivo</span>
                        <p className="text-xs text-blue-100 mt-1">Bot en tiempo real</p>
                    </button>
                    
                    <button
                        onClick={() => navigateTo('/app/dashboard/trading/history')}
                        className="p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                        <span className="text-3xl mb-2 block">📜</span>
                        <span className="font-bold">Historial</span>
                        <p className="text-xs text-purple-100 mt-1">Ver operaciones pasadas</p>
                    </button>
                    
                    <button
                        onClick={() => navigateTo('/app/dashboard/backtesting')}
                        className="p-6 bg-gradient-to-br from-yellow-500 to-yellow-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                        <span className="text-3xl mb-2 block">🧪</span>
                        <span className="font-bold">Backtesting</span>
                        <p className="text-xs text-yellow-100 mt-1">Probar estrategias</p>
                    </button>
                </div>

                {/* Quick Actions - Second Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <button
                        onClick={() => navigateTo('/app/dashboard/ml')}
                        className="p-6 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                        <span className="text-3xl mb-2 block">🤖</span>
                        <span className="font-bold">Machine Learning</span>
                        <p className="text-xs text-indigo-100 mt-1">IA y predicciones XAI</p>
                    </button>
                    
                    <button
                        onClick={() => navigateTo('/app/dashboard/reports')}
                        className="p-6 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                        <span className="text-3xl mb-2 block">📈</span>
                        <span className="font-bold">Reportes</span>
                        <p className="text-xs text-orange-100 mt-1">Estadísticas y métricas</p>
                    </button>
                    
                    <button
                        onClick={() => navigateTo('/app/dashboard/configuration')}
                        className="p-6 bg-gradient-to-br from-gray-500 to-gray-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                        <span className="text-3xl mb-2 block">⚙️</span>
                        <span className="font-bold">Configuración</span>
                        <p className="text-xs text-gray-100 mt-1">Ajustes del sistema</p>
                    </button>
                    
                    <button
                        onClick={() => window.open('https://www.tradingview.com', '_blank')}
                        className="p-6 bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                        <span className="text-3xl mb-2 block">📺</span>
                        <span className="font-bold">TradingView</span>
                        <p className="text-xs text-teal-100 mt-1">Gráficos avanzados</p>
                    </button>
                </div>

                {/* Signals Section */}
                {state.isConnected ? (
                    <Signals />
                ) : (
                    <div className="bg-white rounded-xl shadow-md p-12 text-center">
                        <span className="text-6xl mb-4 block">🔌</span>
                        <h2 className="text-xl font-bold text-gray-700 mb-2">No hay conexión activa</h2>
                        <p className="text-gray-500 mb-6">
                            Conecta tu cuenta de trading para ver señales y operar
                        </p>
                        <button
                            onClick={() => navigateTo('/app/dashboard/configuration')}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            Ir a Configuración
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}