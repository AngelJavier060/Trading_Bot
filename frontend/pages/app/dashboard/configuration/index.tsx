"use client"

import React, { useState } from "react"
import { useRouter } from "next/router"
import AccountConfig from "./components/AccountConfig"
import TradingConfig from "./components/TradingConfig"
import IQOperationalConfig from "./components/IQOperationalConfig"
import { toast } from "react-hot-toast"
import { useApi } from "@/hooks/useApi"
import { usePlatform } from "@/context/PlatformContext"

const Configuration = () => {
  const router = useRouter()
  const api = useApi()
  const { connectionStatus, connectionInfo, isPlatformConnected } = usePlatform()
  const iqHub = router.pathname.startsWith("/iqoption")

  const [accountInfo, setAccountInfo] = useState<{
    account_type: string
    balance: number
    currency?: string
  } | null>(null)

  const [marketType, setMarketType] = useState("Binarias")
  const [risk, setRisk] = useState<number>(10)
  const [timeframes, setTimeframes] = useState<string[]>([])
  const [strategies, setStrategies] = useState<string[]>([])
  const [profitTarget, setProfitTarget] = useState<number>(50)
  const [lossLimit, setLossLimit] = useState<number>(20)
  const [tradingMode, setTradingMode] = useState("Backtesting")

  const [platformConnection, setPlatformConnection] = useState<{
    platform: string
    status: "connected" | "disconnected" | "error"
    lastSync?: Date
  } | null>(null)

  const handlePlatformLogin = async (platform: string, credentials: Record<string, string>, accountType: string) => {
    try {
      const response = await api.connectTradingPlatform(platform, credentials, accountType)

      setPlatformConnection({
        platform,
        status: "connected",
        lastSync: new Date(),
      })

      setAccountInfo(response.accountInfo)

      toast.success(`Conexión exitosa con ${platform}`)
    } catch (error: any) {
      setPlatformConnection({
        platform,
        status: "error",
      })
      toast.error(error.message || `Error al conectar con ${platform}`)
    }
  }

  const handleAccountTypeChange = async (newAccountType: string) => {
    try {
      const response = await api.switchAccountType(newAccountType)
      setAccountInfo(response.accountInfo)
      toast.success(`Cambiado a cuenta ${response.accountInfo.account_type}`)
    } catch (error: any) {
      toast.error(error.message || "Error al cambiar tipo de cuenta")
    }
  }

  const handleSaveConfig = async () => {
    try {
      if (!platformConnection?.platform) {
        toast.error("Debes seleccionar una plataforma")
        return
      }

      const configToSave = {
        platform: platformConnection.platform,
        marketType: marketType || "Binarias",
        risk: risk || 10,
        timeframes: timeframes.length > 0 ? timeframes : ["1m"],
        strategies: strategies.length > 0 ? strategies : ["RSI"],
        profitTarget: profitTarget || 50,
        lossLimit: lossLimit || 20,
        tradingMode: tradingMode || "Demo",
        accountType: accountInfo?.account_type || "PRACTICE",
      }

      await api.saveConfig(configToSave)

      toast.success("Configuración guardada exitosamente")

      if (iqHub) {
        if (tradingMode === "Backtesting") {
          router.push("/iqoption/dashboard?tab=backtest")
        } else {
          router.push("/iqoption/dashboard?tab=live")
        }
      } else {
        if (tradingMode === "Backtesting") {
          router.push("/app/dashboard/backtesting")
        } else {
          router.push("/app/dashboard/trading/live")
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Error al guardar la configuración")
    }
  }

  const mergedAccountInfo =
    iqHub && isPlatformConnected && connectionInfo
      ? {
          account_type: connectionInfo.account_type || "PRACTICE",
          balance: typeof connectionInfo.balance === "number" ? connectionInfo.balance : 0,
          currency: connectionInfo.currency,
        }
      : accountInfo

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-center text-blue-900 mb-4">Configurar mi Trading</h1>

        {iqHub && (
          <>
            {connectionStatus !== "connected" && (
              <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-sm">
                <strong>Sin conexión al bróker.</strong> Usa <strong>Conectar</strong> en la barra superior (ya elegiste
                IQ Option al entrar). Aquí solo ajustas parámetros; no hace falta volver a poner correo y contraseña.
              </div>
            )}
            <IQOperationalConfig connectionInfo={connectionInfo} />
          </>
        )}

        {!iqHub && (
          <>
            {platformConnection && (
              <div
                className={`mb-6 p-4 rounded-lg ${
                  platformConnection.status === "connected"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                <p className="font-semibold">
                  Estado de conexión con {platformConnection.platform}:
                  {platformConnection.status === "connected" ? " Conectado" : " Error"}
                </p>
                {platformConnection.lastSync && (
                  <p className="text-sm">Última sincronización: {platformConnection.lastSync.toLocaleString()}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <AccountConfig
                onLogin={handlePlatformLogin}
                onAccountTypeChange={handleAccountTypeChange}
                initialAccountType={mergedAccountInfo?.account_type}
              />

              {mergedAccountInfo && (
                <div className="bg-white shadow-md rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4">Información de la Cuenta</h3>
                  <p>
                    <strong>Tipo de cuenta:</strong> {mergedAccountInfo.account_type}
                  </p>
                  <p>
                    <strong>Balance:</strong> ${mergedAccountInfo.balance.toFixed(2)}
                  </p>
                  <p>
                    <strong>Moneda:</strong> {mergedAccountInfo.currency}
                  </p>
                  <p>
                    <strong>Última actualización:</strong> {new Date().toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {platformConnection?.status === "connected" && (
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
          </>
        )}
      </div>
    </div>
  )
}

export default Configuration
