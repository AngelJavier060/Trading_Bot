"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import toast from "react-hot-toast"
import { getStrategiesForPlatform } from "../../../types/strategies"
import type { PlatformConnectionInfo } from "../../../context/PlatformContext"
import { fetchLiveBotStatus, postLiveStart, postLiveStop } from "../../../lib/liveTradingApi"

const STORAGE_KEY_MT = "mt_server_bot_panel_v1"

const DEFAULT_FX = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "EURJPY", "XAUUSD"]

type Props = {
  /** UI: mt5 | mt4 — la API del backend usa siempre `mt5` para el motor unificado. */
  uiPlatform: "mt5" | "mt4"
  connectionStatus: "disconnected" | "connecting" | "connected" | "error"
  connectionInfo: PlatformConnectionInfo | null
}

function metaAccountType(raw?: string | null): "PRACTICE" | "REAL" {
  const u = String(raw ?? "REAL").toUpperCase()
  if (u === "PRACTICE" || u === "DEMO") return "PRACTICE"
  return "REAL"
}

export default function MetaServerBotPanel({ uiPlatform, connectionStatus, connectionInfo }: Props) {
  const strategyIds = useMemo(
    () => getStrategiesForPlatform(uiPlatform).map((s) => s.id),
    [uiPlatform]
  )
  const [symbols, setSymbols] = useState<string[]>(["EURUSD", "GBPUSD", "USDJPY"])
  const [strategies, setStrategies] = useState<string[]>(() =>
    uiPlatform === "mt4" ? ["trend_following"] : ["ema_rsi"]
  )
  const [mode, setMode] = useState<"manual" | "auto">("manual")
  const [minConfidence, setMinConfidence] = useState(68)
  const [amount, setAmount] = useState(10)
  const [expiration, setExpiration] = useState(5)
  const [maxConcurrent, setMaxConcurrent] = useState(2)
  const [maxDailyTrades, setMaxDailyTrades] = useState(50)
  const [botSnapshot, setBotSnapshot] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const connected = connectionStatus === "connected"
  const accountType = metaAccountType(connectionInfo?.account_type)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_MT + uiPlatform)
      if (!raw) return
      const s = JSON.parse(raw)
      if (Array.isArray(s.symbols)) setSymbols(s.symbols)
      if (Array.isArray(s.strategies)) setStrategies(s.strategies)
      if (s.mode === "manual" || s.mode === "auto") setMode(s.mode)
      if (typeof s.minConfidence === "number") setMinConfidence(s.minConfidence)
      if (typeof s.amount === "number") setAmount(s.amount)
      if (typeof s.expiration === "number") setExpiration(s.expiration)
      if (typeof s.maxConcurrent === "number") setMaxConcurrent(s.maxConcurrent)
      if (typeof s.maxDailyTrades === "number") setMaxDailyTrades(s.maxDailyTrades)
    } catch {
      /* ignore */
    }
  }, [uiPlatform])

  const persist = () => {
    localStorage.setItem(
      STORAGE_KEY_MT + uiPlatform,
      JSON.stringify({
        symbols,
        strategies,
        mode,
        minConfidence,
        amount,
        expiration,
        maxConcurrent,
        maxDailyTrades,
      })
    )
  }

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

  const toggleSym = (x: string) =>
    setSymbols((prev) => (prev.includes(x) ? prev.filter((a) => a !== x) : [...prev, x]))
  const toggleStrat = (x: string) =>
    setStrategies((prev) => (prev.includes(x) ? prev.filter((a) => a !== x) : [...prev, x]))

  const handleStart = async () => {
    if (!connected) {
      toast.error("Conecta MetaTrader primero")
      return
    }
    if (!symbols.length || !strategies.length) {
      toast.error("Selecciona símbolos y estrategias")
      return
    }
    setBusy(true)
    try {
      persist()
      const { ok, data } = await postLiveStart({
        platform: "mt5",
        account_type: accountType,
        mode,
        symbols,
        strategies,
        amount,
        min_confidence: minConfidence,
        expiration,
        max_concurrent: maxConcurrent,
        max_daily_trades: maxDailyTrades,
        use_ml: false,
        ml_weight: 0,
        ml_min_probability: 0.55,
      })
      if (ok && data.status === "success") {
        toast.success(data.message || "Motor MT iniciado")
        await refreshStatus()
      } else {
        toast.error(data.message || "No se pudo iniciar")
      }
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async () => {
    setBusy(true)
    try {
      const { ok, data } = await postLiveStop()
      if (ok && data.status === "success") {
        toast.success("Motor detenido")
        await refreshStatus()
      } else {
        toast.error(data.message || "Error al detener")
      }
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setBusy(false)
    }
  }

  const running = Boolean(botSnapshot?.is_running)
  const catalog = getStrategiesForPlatform(uiPlatform)

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-100/90">
        <strong className="text-amber-200">MT4 / MT5 en este proyecto:</strong> el motor compartido del backend usa la
        integración <code className="text-amber-50">platform=mt5</code>. Aquí configuras símbolos, estrategias y modo
        manual o automático; las órdenes las ejecuta el motor conectado al terminal.
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Motor servidor (MetaTrader)</h3>
          <p className="text-xs text-gray-500 mt-1">Estado: {running ? "en ejecución" : "detenido"}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !connected}
            onClick={handleStart}
            className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm"
          >
            Iniciar motor
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleStop}
            className="px-4 py-2 rounded-lg bg-red-900/70 hover:bg-red-800 disabled:opacity-40 text-white text-sm"
          >
            Detener motor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-800 p-4">
          <h4 className="text-sm font-medium text-white mb-2">Pares</h4>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {DEFAULT_FX.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={symbols.includes(s)}
                  onChange={() => toggleSym(s)}
                  className="rounded border-gray-600"
                />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-800 p-4">
          <h4 className="text-sm font-medium text-white mb-2">Estrategias</h4>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {catalog.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={strategies.includes(s.id)}
                  onChange={() => toggleStrat(s.id)}
                  className="rounded border-gray-600"
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <label className="text-xs text-gray-400">Modo</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "manual" | "auto")}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2"
          >
            <option value="manual">Manual</option>
            <option value="auto">Automático</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Conf. mín.</label>
          <input
            type="number"
            min={60}
            max={95}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Volumen / monto</label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Expiración (min)</label>
          <input
            type="number"
            min={1}
            value={expiration}
            onChange={(e) => setExpiration(Number(e.target.value))}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        IDs de estrategia válidos en el motor: {strategyIds.join(", ")} — el backend ignora las no implementadas para
        MT.
      </p>
    </div>
  )
}
