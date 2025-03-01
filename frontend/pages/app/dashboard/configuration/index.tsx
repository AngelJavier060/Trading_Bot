import React, { useState } from "react";
import { useRouter } from "next/router"; // Para redirección de páginas
import AccountConfig from "./components/AccountConfig";
import TradingConfig from "./components/TradingConfig";
import api from "@/services/api"; // Volvemos a la importación original
import { TradingPlatform } from '@/types/platforms';
import { toast } from 'react-hot-toast';
import { useApi } from '@/hooks/useApi';

const Configuration = () => {
    const router = useRouter();
    const api = useApi();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [accountType, setAccountType] = useState("Demo");
    const [accountInfo, setAccountInfo] = useState<{
        account_type: string;
        balance: number;
        currency?: string;
    } | null>(null);

    // Configuración de trading
    const [marketType, setMarketType] = useState("Binarias");
    const [risk, setRisk] = useState<number>(10); // Porcentaje de riesgo
    const [timeframes, setTimeframes] = useState<string[]>([]); // Temporalidades seleccionadas
    const [strategies, setStrategies] = useState<string[]>([]); // Estrategias seleccionadas
    const [profitTarget, setProfitTarget] = useState<number>(50); // Objetivo de ganancias
    const [lossLimit, setLossLimit] = useState<number>(20); // Límite de pérdidas
    const [tradingMode, setTradingMode] = useState("Backtesting"); // Modo de operación

    const [platformConnection, setPlatformConnection] = useState<{
        platform: string;
        status: 'connected' | 'disconnected' | 'error';
        lastSync?: Date;
    } | null>(null);

    const handleLogin = async () => {
        try {
            await api.login({ username, password, accountType });
            const info = await api.getAccountInfo();
            setAccountInfo(info);
            alert("Inicio de sesión exitoso");
        } catch (error: any) {
            alert(error.message || "Error al iniciar sesión");
        }
    };

    const handlePlatformLogin = async (platform: string, credentials: Record<string, string>, accountType: string) => {
        try {
            const response = await api.connectTradingPlatform(platform, credentials, accountType);
            
            setPlatformConnection({
                platform,
                status: 'connected',
                lastSync: new Date()
            });
            
            setAccountInfo(response.accountInfo);
            
            toast.success(`Conexión exitosa con ${platform}`);
        } catch (error: any) {
            setPlatformConnection({
                platform,
                status: 'error'
            });
            toast.error(error.message || `Error al conectar con ${platform}`);
        }
    };

    const handleAccountTypeChange = async (newAccountType: string) => {
        try {
            const response = await api.switchAccountType(newAccountType);
            setAccountInfo(response.accountInfo);
            toast.success(`Cambiado a cuenta ${response.accountInfo.account_type}`);
        } catch (error: any) {
            toast.error(error.message || 'Error al cambiar tipo de cuenta');
        }
    };

    const handleSaveConfig = async () => {
        try {
            if (!platformConnection?.platform) {
                toast.error('Debes seleccionar una plataforma');
                return;
            }

            const configToSave = {
                platform: platformConnection.platform,
                marketType: marketType || 'Binarias',
                risk: risk || 10,
                timeframes: timeframes.length > 0 ? timeframes : ['1m'],
                strategies: strategies.length > 0 ? strategies : ['RSI'],
                profitTarget: profitTarget || 50,
                lossLimit: lossLimit || 20,
                tradingMode: tradingMode || 'Demo',
                accountType: accountInfo?.account_type || 'PRACTICE'
            };

            await api.saveConfig(configToSave);
            
            toast.success('Configuración guardada exitosamente');
            
            // Redirigir según el modo seleccionado
            if (tradingMode === "Real") {
                router.push("/app/dashboard/trading/live");
            } else if (tradingMode === "Demo") {
                router.push("/app/dashboard/trading/demo");
            } else {
                router.push("/app/dashboard/backtesting");
            }
        } catch (error: any) {
            toast.error(error.message || "Error al guardar la configuración");
        }
    };

    const toggleOption = (option: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
        if (list.includes(option)) {
            setList(list.filter((item) => item !== option));
        } else {
            setList([...list, option]);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold text-center text-blue-900 mb-8">
                    Configurar mi Trading
                </h1>

                {/* Status de conexión */}
                {platformConnection && (
                    <div className={`mb-6 p-4 rounded-lg ${
                        platformConnection.status === 'connected' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                        <p className="font-semibold">
                            Estado de conexión con {platformConnection.platform}:
                            {platformConnection.status === 'connected' ? ' Conectado' : ' Error'}
                        </p>
                        {platformConnection.lastSync && (
                            <p className="text-sm">
                                Última sincronización: {platformConnection.lastSync.toLocaleString()}
                            </p>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <AccountConfig 
                        onLogin={handlePlatformLogin}
                        onAccountTypeChange={handleAccountTypeChange}
                        initialAccountType={accountInfo?.account_type}
                    />
                    
                    {accountInfo && (
                        <div className="bg-white shadow-md rounded-lg p-6">
                            <h3 className="text-xl font-semibold mb-4">
                                Información de la Cuenta
                            </h3>
                            <p><strong>Tipo de cuenta:</strong> {accountInfo.account_type}</p>
                            <p><strong>Balance:</strong> ${accountInfo.balance.toFixed(2)}</p>
                            <p><strong>Moneda:</strong> {accountInfo.currency}</p>
                            <p><strong>Última actualización:</strong> {accountInfo.server_time}</p>
                        </div>
                    )}
                </div>

                {platformConnection?.status === 'connected' && (
                    <TradingConfig 
                        platform={platformConnection.platform}
                        marketType={marketType}
                        risk={risk}
                        timeframes={timeframes}
                        strategies={strategies}
                        profitTarget={profitTarget}
                        lossLimit={lossLimit}
                        tradingMode={tradingMode}
                        setMarketType={setMarketType}
                        setRisk={setRisk}
                        setTimeframes={setTimeframes}
                        setStrategies={setStrategies}
                        setProfitTarget={setProfitTarget}
                        setLossLimit={setLossLimit}
                        setTradingMode={setTradingMode}
                        handleSaveConfig={handleSaveConfig}
                    />
                )}
            </div>
        </div>
    );
};

export default Configuration;
