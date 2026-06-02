"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import toast from "react-hot-toast"
import { getStrategiesForPlatform } from "../../../types/strategies"
import type { PlatformConnectionInfo } from "../../../context/PlatformContext"
import {
  normalizeIqAccountType,
  fetchLiveBotStatus,
  postLiveStart,
  postLiveStop,
  postTradingOrder,
  postLiveScan,
  fetchTradingAssets,
  isLiveBrokerOrderSuccess,
} from "../../../lib/liveTradingApi"
import { loadPersistedLiveConfig } from "../../../types/liveTrading"

const STORAGE_KEY = "iqoption_trading_panel_v1"

const FALLBACK_SYMBOLS = [
  "EURUSD-OTC",
  "GBPUSD-OTC",
  "USDJPY-OTC",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "BTCUSD",
  "ETHUSD",
]

type Mode = "manual" | "auto"

type Props = {
  connectionStatus: "disconnected" | "connecting" | "connected" | "error"
  connectionInfo: PlatformConnectionInfo | null
}

export default function IQTradingPanel({ connectionStatus, connectionInfo }: Props) {
  const strategiesCatalog = useMemo(() => getStrategiesForPlatform("iqoption"), [])
  const [assetNames, setAssetNames] = useState<string[]>(FALLBACK_SYMBOLS)
  const [symbols, setSymbols] = useState<string[]>(["EURUSD-OTC", "GBPUSD-OTC"])
  const [strategyIds, setStrategyIds] = useState<string[]>(["ema_rsi"])
  const [mode, setMode] = useState<Mode>("manual")
  const [minConfidence, setMinConfidence] = useState(68)
  const [amount, setAmount] = useState(10)
  const [expiration, setExpiration] = useState(5)
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [maxDailyTrades, setMaxDailyTrades] = useState(50)
  const [useMl, setUseMl] = useState(true)
  const [mlWeight, setMlWeight] = useState(0.2)
  const [mlMinProb, setMlMinProb] = useState(0.55)
  const [timeframe, setTimeframe] = useState("5m")
  const [manualSymbol, setManualSymbol] = useState("EURUSD-OTC")
  const [botSnapshot, setBotSnapshot] = useState<any>(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [engineBusy, setEngineBusy] = useState(false)

  const connected = connectionStatus === "connected"
  const accountType = normalizeIqAccountType(connectionInfo?.account_type)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (Array.isArray(s.symbols)) setSymbols(s.symbols)
        if (Array.isArray(s.strategyIds)) setStrategyIds(s.strategyIds)
        if (s.mode === "manual" || s.mode === "auto") setMode(s.mode)
        if (typeof s.minConfidence === "number") setMinConfidence(s.minConfidence)
        if (typeof s.amount === "number") setAmount(s.amount)
        if (typeof s.expiration === "number") setExpiration(s.expiration)
        if (typeof s.maxConcurrent === "number") setMaxConcurrent(s.maxConcurrent)
        if (typeof s.maxDailyTrades === "number") setMaxDailyTrades(s.maxDailyTrades)
        if (typeof s.useMl === "boolean") setUseMl(s.useMl)
        if (typeof s.mlWeight === "number") setMlWeight(s.mlWeight)
        if (typeof s.mlMinProb === "number") setMlMinProb(s.mlMinProb)
        if (typeof s.timeframe === "string") setTimeframe(s.timeframe)
        if (typeof s.manualSymbol === "string") setManualSymbol(s.manualSymbol)
      }
    } catch {
      /* ignore */
    }
    const live = loadPersistedLiveConfig()
    if (live?.symbols?.length) setSymbols(live.symbols)
    if (live?.strategies?.length) setStrategyIds(live.strategies)
    const sm = live?.serverMotor
    if (sm && typeof sm === "object") {
      if (typeof sm.min_confidence === "number") setMinConfidence(sm.min_confidence)
      if (typeof sm.max_concurrent === "number") setMaxConcurrent(sm.max_concurrent)
      if (typeof sm.max_daily_trades === "number") setMaxDailyTrades(sm.max_daily_trades)
      if (typeof sm.use_ml === "boolean") setUseMl(sm.use_ml)
      if (typeof sm.ml_weight === "number") setMlWeight(sm.ml_weight)
      if (typeof sm.ml_min_probability === "number") setMlMinProb(sm.ml_min_probability)
    }
  }, [])

  const persist = useCallback(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        symbols,
        strategyIds,
        mode,
        minConfidence,
        amount,
        expiration,
        maxConcurrent,
        maxDailyTrades,
        useMl,
        mlWeight,
        mlMinProb,
        timeframe,
        manualSymbol,
      })
    )
  }, [
    symbols,
    strategyIds,
    mode,
    minConfidence,
    amount,
    expiration,
    maxConcurrent,
    maxDailyTrades,
    useMl,
    mlWeight,
    mlMinProb,
    timeframe,
    manualSymbol,
  ])

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    ;(async () => {
      const { names } = await fetchTradingAssets()
      if (cancelled) return
      if (names.length > 0) {
        setAssetNames(names)
        setManualSymbol((prev) => (names.includes(prev) ? prev : names[0]))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connected])

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchLiveBotStatus()
      if (data.status === "success") setBotSnapshot(data.bot_status)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const t = setInterval(refreshStatus, 8000)
    return () => clearInterval(t)
  }, [refreshStatus])

  const toggleSymbol = (sym: string) => {
    setSymbols((prev) =>
      prev.includes(sym) ? prev.filter((x) => x !== sym) : [...prev, sym]
    )
  }

  const toggleStrategy = (id: string) => {
    setStrategyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const buildStartPayload = () => {
    const live = loadPersistedLiveConfig()
    const po = live?.strategyParamOverrides
    return {
      platform: "iqoption",
      account_type: accountType,
      mode,
      symbols: symbols.length ? symbols : ["EURUSD-OTC"],
      strategies: strategyIds.length ? strategyIds : ["ema_rsi"],
      iq_market_type: live?.iqMarketType === "binary" ? "binary" : "otc",
      amount,
      min_confidence: minConfidence,
      expiration,
      max_concurrent: maxConcurrent,
      max_daily_trades: maxDailyTrades,
      use_ml: useMl,
      ml_weight: mlWeight,
      ml_min_probability: mlMinProb,
      strategy_param_overrides: po && typeof po === "object" ? po : {},
    }
  }

  const handleStartEngine = async () => {
    if (!connected) {
      toast.error("Conecta IQ Option primero (arriba: Conectar)")
      return
    }
    if (symbols.length === 0) {
      toast.error("Selecciona al menos un símbolo")
      return
    }
    if (strategyIds.length === 0) {
      toast.error("Selecciona al menos una estrategia")
      return
    }
    setEngineBusy(true)
    try {
      persist()
      const { ok, data } = await postLiveStart(buildStartPayload())
      if (ok && data.status === "success") {
        toast.success(data.message || "Motor del servidor iniciado")
        await refreshStatus()
      } else {
        toast.error(data.message || "No se pudo iniciar el motor")
      }
    } catch (e: any) {
      toast.error(e.message || "Error de red")
    } finally {
      setEngineBusy(false)
    }
  }

  const handleStopEngine = async () => {
    setEngineBusy(true)
    try {
      const { ok, data } = await postLiveStop()
      if (ok && data.status === "success") {
        toast.success("Motor detenido")
        await refreshStatus()
      } else {
        toast.error(data.message || "No se pudo detener")
      }
    } catch (e: any) {
      toast.error(e.message || "Error de red")
    } finally {
      setEngineBusy(false)
    }
  }

  const handleManualOrder = async (direction: "call" | "put") => {
    if (!connected) {
      toast.error("Conecta IQ Option para operar")
      return
    }
    setOrderBusy(true)
    try {
      const strat = strategyIds[0] || "ema_rsi"
      const { ok, data } = await postTradingOrder({
        symbol: manualSymbol,
        direction,
        amount,
        expiration,
        strategy: strat,
      })
      if (isLiveBrokerOrderSuccess(data, ok)) {
        toast.success(`Orden ${direction.toUpperCase()} enviada (${manualSymbol})`)
      } else {
        toast.error(data.message || data.code || "La orden no se ejecutó en el bróker")
      }
    } catch (e: any) {
      toast.error(e.message || "Error al enviar orden")
    } finally {
      setOrderBusy(false)
    }
  }

  const handleQuickScan = async () => {
    if (symbols.length === 0 || strategyIds.length === 0) {
      toast.error("Elige símbolos y estrategias")
      return
    }
    try {
      const { ok, data } = await postLiveScan({
        symbols: symbols.slice(0, 8),
        strategies: strategyIds,
        timeframe,
        platform: "iqoption",
      })
      if (ok && data.status === "success") {
        const n = data.signals_found ?? 0
        const top = (data.signals || [])[0]
        if (top) {
          toast.success(
            `Escaneo: ${n} señal(es). Mejor: ${top.symbol} ${top.direction?.toUpperCase()} ${top.confidence}%`
          )
        } else {
          toast(`Escaneo listo: sin señales CALL/PUT por encima del umbral`, { icon: "📡" })
        }
      } else {
        toast.error(data.message || "Error en escaneo")
      }
    } catch (e: any) {
      toast.error(e.message || "Error de red")
    }
  }

  const running = Boolean(botSnapshot?.is_running)

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Motor en servidor (`/api/live`)</h3>
            <p className="text-xs text-gray-500 mt-1">
              Un solo proceso escanea los símbolos y estrategias elegidos. Cuenta: {accountType}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-xs px-3 py-1 rounded-full border ${
                running
                  ? "bg-green-900/40 text-green-300 border-green-700"
                  : "bg-gray-800 text-gray-400 border-gray-700"
              }`}
            >
              {running ? "En ejecución" : "Detenido"}
            </span>
            {botSnapshot?.current_symbol && (
              <span className="text-xs text-gray-400">
                Actual: {String(botSnapshot.current_symbol)}
              </span>
            )}
            <button
              type="button"
              onClick={refreshStatus}
              className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Actualizar estado
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={engineBusy || !connected}
            onClick={handleStartEngine}
            className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium"
          >
            Iniciar motor
          </button>
          <button
            type="button"
            disabled={engineBusy}
            onClick={handleStopEngine}
            className="px-4 py-2 rounded-lg bg-red-900/70 hover:bg-red-800 disabled:opacity-40 text-white text-sm font-medium"
          >
            Detener motor
          </button>
          <button
            type="button"
            onClick={handleQuickScan}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
          >
            Escanear ahora (sin auto-ejecutar)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
          <h4 className="font-medium text-white mb-2">Símbolos / activos</h4>
          <p className="text-xs text-gray-500 mb-3">
            {connected
              ? "Lista desde el bróker (abiertos). Marca los que quieres en el motor."
              : "Conecta para cargar activos IQ; mientras tanto usa la lista base."}
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-800 rounded-lg p-2">
            {assetNames.map((sym) => (
              <label key={sym} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={symbols.includes(sym)}
                  onChange={() => toggleSymbol(sym)}
                  className="rounded border-gray-600"
                />
                {sym}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
          <h4 className="font-medium text-white mb-2">Estrategias (IQ Option)</h4>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-800 rounded-lg p-2">
            {strategiesCatalog.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={strategyIds.includes(s.id)}
                  onChange={() => toggleStrategy(s.id)}
                  className="rounded border-gray-600"
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-gray-400">Modo motor</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          >
            <option value="manual">Manual (solo señales / tú ejecutas)</option>
            <option value="auto">Automático (ejecuta si cumple confianza)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Confianza mínima (60–95)</label>
          <input
            type="number"
            min={60}
            max={95}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Timeframe escaneo</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          >
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Monto ($)</label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Expiración (min)</label>
          <select
            value={expiration}
            onChange={(e) => setExpiration(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          >
            <option value={1}>1</option>
            <option value={5}>5</option>
            <option value={15}>15</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Máx. operaciones concurrentes</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Máx. operaciones por día</label>
          <input
            type="number"
            min={1}
            value={maxDailyTrades}
            onChange={(e) => setMaxDailyTrades(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 mt-6">
          <input
            id="use-ml-iq"
            type="checkbox"
            checked={useMl}
            onChange={(e) => setUseMl(e.target.checked)}
            className="rounded border-gray-600"
          />
          <label htmlFor="use-ml-iq" className="text-sm text-gray-300">
            Usar ML como filtro en motor automático
          </label>
        </div>
        <div>
          <label className="text-xs text-gray-400">Peso ML (0–0.5)</label>
          <input
            type="number"
            step={0.05}
            min={0}
            max={0.5}
            value={mlWeight}
            onChange={(e) => setMlWeight(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Prob. mín. ML (0.5–0.95)</label>
          <input
            type="number"
            step={0.05}
            min={0.5}
            max={0.95}
            value={mlMinProb}
            onChange={(e) => setMlMinProb(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
        <h4 className="font-medium text-white mb-3">Operación manual (API `POST /api/trading/order`)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs text-gray-400">Activo</label>
            <select
              value={manualSymbol}
              onChange={(e) => setManualSymbol(e.target.value)}
              className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm"
            >
              {(assetNames.length ? assetNames : FALLBACK_SYMBOLS).map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="button"
              disabled={!connected || orderBusy}
              onClick={() => handleManualOrder("call")}
              className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 font-bold text-sm"
            >
              CALL ▲
            </button>
            <button
              type="button"
              disabled={!connected || orderBusy}
              onClick={() => handleManualOrder("put")}
              className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 font-bold text-sm"
            >
              PUT ▼
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Usa el mismo endpoint que el panel profesional. En cuenta REAL sin conexión, el backend bloquea.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            persist()
            toast.success("Configuración guardada en este navegador")
          }}
          className="text-sm px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800"
        >
          Guardar preferencias localmente
        </button>
      </div>
    </div>
  )
}
