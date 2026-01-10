import React, { useEffect, useState, useCallback } from "react";
import api from "../../../services/api";

interface ScanResult {
    status: string;
    decision?: {
        signal: string | null;
        confidence: number;
        indicators: {
            rsi: number | null;
            ema_fast: number;
            ema_slow: number;
        };
        reasons: { rule: string; detail: string }[];
    };
    message?: string;
}

const Signals: React.FC = () => {
    const [scanData, setScanResult] = useState<{ [key: string]: ScanResult } | null>(null);
    const [availableAssets, setAvailableAssets] = useState<string[]>([]);
    const [watchlist, setWatchlist] = useState<string[]>(["EURUSD", "GBPUSD", "USDJPY"]);
    const [loading, setLoading] = useState<boolean>(true);
    const [scanning, setScanning] = useState<boolean>(false);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [showSelector, setShowSelector] = useState(false);

    // Cargar watchlist de localStorage al iniciar
    useEffect(() => {
        const saved = localStorage.getItem("trading_watchlist");
        if (saved) {
            try {
                setWatchlist(JSON.parse(saved));
            } catch (e) {
                console.error("Error al cargar watchlist:", e);
            }
        }
    }, []);

    // Guardar watchlist cuando cambie
    useEffect(() => {
        localStorage.setItem("trading_watchlist", JSON.stringify(watchlist));
    }, [watchlist]);

    const fetchAvailable = useCallback(async () => {
        try {
            const data = await api.getAssets();
            if (data.activos) {
                setAvailableAssets(Object.keys(data.activos).sort());
            }
        } catch (error) {
            console.error("Error al obtener activos disponibles:", error);
        }
    }, []);

    const performScan = useCallback(async () => {
        if (watchlist.length === 0) return;
        
        setScanning(true);
        try {
            const assetsToScan = watchlist.join(",");
            const data = await api.scanAssets(assetsToScan, 60);
            setScanResult(data.scan);
            setLastUpdate(new Date());
        } catch (error) {
            console.error("Error al escanear activos:", error);
        } finally {
            setScanning(false);
            setLoading(false);
        }
    }, [watchlist]);

    useEffect(() => {
        fetchAvailable();
        performScan();
        const interval = setInterval(performScan, 30000); // Escanear cada 30 segundos
        return () => clearInterval(interval);
    }, [performScan, fetchAvailable]);

    const toggleAsset = (asset: string) => {
        setWatchlist(prev => 
            prev.includes(asset) 
                ? prev.filter(a => a !== asset) 
                : [...prev, asset]
        );
    };

    if (loading && !scanData) {
        return (
            <div className="bg-white shadow-xl p-6 rounded-xl border border-gray-100 flex flex-col items-center justify-center min-h-[300px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-500 font-medium">Analizando mercado y conectando...</p>
            </div>
        );
    }

    return (
        <div className="bg-white shadow-xl p-6 rounded-xl border border-gray-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        Escáner de Señales IA
                        {scanning && <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                        Última actualización: {lastUpdate.toLocaleTimeString()}
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowSelector(!showSelector)}
                        className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium flex items-center gap-2"
                    >
                        ⚙️ Configurar Watchlist
                    </button>
                    <button 
                        onClick={performScan}
                        disabled={scanning}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors font-medium shadow-sm"
                    >
                        {scanning ? "Escaneando..." : "🔄 Refrescar"}
                    </button>
                </div>
            </div>

            {showSelector && (
                <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">Selecciona activos para monitorear:</h3>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                        {availableAssets.length > 0 ? (
                            availableAssets.map(asset => (
                                <button
                                    key={asset}
                                    onClick={() => toggleAsset(asset)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                        watchlist.includes(asset)
                                            ? "bg-blue-600 text-white shadow-md scale-105"
                                            : "bg-white text-gray-600 border border-gray-300 hover:border-blue-400"
                                    }`}
                                >
                                    {asset}
                                </button>
                            ))
                        ) : (
                            <p className="text-xs text-gray-400 italic">Conecta IQ Option para ver activos disponibles...</p>
                        )}
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button 
                            onClick={() => setShowSelector(false)}
                            className="text-xs font-bold text-blue-600 hover:underline"
                        >
                            Finalizar selección
                        </button>
                    </div>
                </div>
            )}

            {watchlist.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-400 mb-4 font-medium text-sm">Tu watchlist está vacía</p>
                    <button 
                        onClick={() => setShowSelector(true)}
                        className="text-blue-600 font-bold hover:underline text-sm"
                    >
                        + Agregar activos para analizar
                    </button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-gray-400 text-sm uppercase tracking-wider border-b">
                                <th className="pb-3 font-semibold">Activo</th>
                                <th className="pb-3 font-semibold text-center">Señal</th>
                                <th className="pb-3 font-semibold text-center">Confianza</th>
                                <th className="pb-3 font-semibold text-center">RSI</th>
                                <th className="pb-3 font-semibold text-center">Tendencia EMA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {scanData && Object.entries(scanData)
                                .filter(([asset]) => watchlist.includes(asset))
                                .map(([asset, result]) => {
                                const decision = result.decision;
                                const signalColor = decision?.signal === 'call' 
                                    ? 'text-green-600 bg-green-50' 
                                    : decision?.signal === 'put' 
                                    ? 'text-red-600 bg-red-50' 
                                    : 'text-gray-400 bg-gray-50';

                                return (
                                    <tr key={asset} className="hover:bg-gray-50 transition-colors group">
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-700">{asset}</span>
                                                <button 
                                                    onClick={() => toggleAsset(asset)}
                                                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                                                    title="Quitar de watchlist"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${signalColor}`}>
                                                {decision?.signal || 'NEUTRAL'}
                                            </span>
                                        </td>
                                        <td className="py-4 text-center">
                                            {decision ? (
                                                <div className="w-full bg-gray-100 rounded-full h-1.5 max-w-[80px] mx-auto">
                                                    <div 
                                                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" 
                                                        style={{ width: `${(decision.confidence || 0) * 100}%` }}
                                                    ></div>
                                                    <span className="text-[9px] font-bold text-gray-500 mt-1 block">
                                                        {Math.round(decision.confidence * 100)}%
                                                    </span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="py-4 text-center font-mono text-sm text-gray-600">
                                            {decision?.indicators.rsi?.toFixed(2) || 'N/A'}
                                        </td>
                                        <td className="py-4 text-center">
                                            {decision ? (
                                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${decision.indicators.ema_fast > decision.indicators.ema_slow ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                                                    {decision.indicators.ema_fast > decision.indicators.ema_slow ? '▲ Alcista' : '▼ Bajista'}
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div className="flex items-start gap-3">
                    <span className="text-xl">💡</span>
                    <p className="text-xs text-blue-800 leading-relaxed font-medium">
                        Usa el botón de configuración para elegir tus activos favoritos. El sistema analizará solo los que selecciones cada 30 segundos usando EMA (9/21) y RSI (14).
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Signals;
