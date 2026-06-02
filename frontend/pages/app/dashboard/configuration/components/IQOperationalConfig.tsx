"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/router"
import { toast } from "react-hot-toast"
import { getPublicApiBaseUrl } from "@/services/api"
import { getStrategiesForPlatform } from "@/types/strategies"
import type { PlatformConnectionInfo } from "@/context/PlatformContext"
import {
  DEFAULT_LIVE_UI,
  DEFAULT_SERVER_MOTOR,
  type IqMarketType,
  type LiveServerMotorConfig,
  type LiveTradingUiConfig,
  type PersistedLiveTradingConfig,
  loadPersistedLiveConfig,
  savePersistedLiveConfig,
} from "@/types/liveTrading"

const BASE_URL = getPublicApiBaseUrl()

const SYMBOLS_IQ_OTC = [
  "EURUSD-OTC",
  "GBPUSD-OTC",
  "USDJPY-OTC",
  "AUDUSD-OTC",
  "USDCAD-OTC",
  "EURGBP-OTC",
  "EURJPY-OTC",
  "GBPJPY-OTC",
  "NZDUSD-OTC",
  "USDCHF-OTC",
  "BTCUSD-OTC",
  "ETHUSD-OTC",
]

const SYMBOLS_IQ_BINARY = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "NZDUSD",
  "USDCHF",
  "BTCUSD",
  "ETHUSD",
  "LTCUSD",
  "XRPUSD",
]

function candidatesForMarket(m: IqMarketType): string[] {
  return m === "otc" ? SYMBOLS_IQ_OTC : SYMBOLS_IQ_BINARY
}

function remapSymbolsForMarket(symbols: string[], m: IqMarketType): string[] {
  const pool = new Set(candidatesForMarket(m))
  const mapped = symbols
    .map((s) => {
      const base = s.replace(/-OTC$/i, "")
      if (m === "otc") {
        const otc = `${base}-OTC`
        if (pool.has(otc)) return otc
        if (pool.has(s)) return s
        return null
      }
      if (pool.has(base)) return base
      if (pool.has(s)) return s
      return null
    })
    .filter((x): x is string => Boolean(x))
  const uniq = Array.from(new Set(mapped))
  if (!uniq.length) {
    return m === "otc" ? ["EURUSD-OTC", "GBPUSD-OTC"] : ["EURUSD", "GBPUSD"]
  }
  return uniq
}

const TIMEFRAMES = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 min" },
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 h" },
]

/** Campos numéricos/select: siempre legibles sobre fondo del dashboard oscuro */
const FIELD =
  "w-full rounded-lg border-2 border-slate-600 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
const FIELD_MT = `${FIELD} mt-1`
const LABEL = "mb-1 block text-sm font-semibold text-slate-800"
const MOTOR_LABEL = "mb-0.5 block text-xs font-bold text-slate-900"
const MOTOR_HINT = "mb-1.5 block text-[10px] leading-snug text-indigo-950/85"

/** Textos cortos en español para el panel del motor (POST /api/live/start). */
const MOTOR_HELP: Record<string, string> = {
  min_confidence:
    "Confianza mínima (%) de la señal para que el bot considere operar. Subirlo = menos trades, más filtro.",
  max_concurrent: "Máximo de posiciones abiertas a la vez en el motor del servidor.",
  max_daily_trades: "Tope de operaciones en el día; al llegar, el motor deja de abrir nuevas hasta el día siguiente.",
  use_ml: "Si está activo, el modelo ML puede reforzar o frenar la decisión según probabilidad y peso.",
  ml_weight:
    "Cuánto pesa el ML frente a la señal de estrategia (0–0,5). 0,2 = la estrategia manda y el ML ajusta.",
  ml_min_probability:
    "Probabilidad mínima del ML (0,5–0,95) para que su voto cuente; si no la alcanza, se ignora el ML.",
  max_consecutive_losses: "Cuántas pérdidas seguidas permites antes de pausar el trading automático.",
  loss_streak_pause_minutes: "Minutos de pausa obligatoria tras alcanzar el máximo de pérdidas seguidas.",
  reset_streak_on_win: "Si al ganar una operación se pone a cero el contador de pérdidas seguidas.",
  daily_profit_target_type: "Si el objetivo de beneficio diario es en % del saldo o en cantidad fija (USD).",
  daily_profit_target: "Meta de beneficio del día según el tipo (% o fijo). Al cumplirse suele detenerse el auto.",
  daily_loss_limit_type: "Si el límite de pérdida diaria es en % del saldo o cantidad fija (USD).",
  daily_loss_limit: "Pérdida máxima permitida en el día según el tipo. Al superarla se detiene el riesgo.",
  volatility_filter_enabled: "Filtra mercados con poco movimiento (ATR bajo) para no operar en rango muerto.",
  atr_min_threshold: "ATR mínimo (como fracción del precio, p. ej. 0,03 = 3 %) para pasar el filtro de volatilidad.",
  news_filter_enabled: "Evita operar cerca de noticias de alto impacto del calendario económico.",
}

type Props = {
  connectionInfo: PlatformConnectionInfo | null
}

export default function IQOperationalConfig({ connectionInfo }: Props) {
  const router = useRouter()
  const iqHub = router.pathname.startsWith("/iqoption")
  const strategyCatalog = useMemo(() => getStrategiesForPlatform("iqoption"), [])

  const catalogIds = useMemo(() => new Set(strategyCatalog.map((s) => s.id)), [strategyCatalog])
  const [ui, setUi] = useState<LiveTradingUiConfig>(DEFAULT_LIVE_UI)
  const [motor, setMotor] = useState<LiveServerMotorConfig>(DEFAULT_SERVER_MOTOR)
  const [symbolQuery, setSymbolQuery] = useState("")
  const [strategyQuery, setStrategyQuery] = useState("")

  useEffect(() => {
    const loaded = loadPersistedLiveConfig()
    const allowed = new Set(strategyCatalog.map((s) => s.id))
    const strategiesFromPersist = (): string[] => {
      const fromArr =
        loaded && Array.isArray(loaded.strategies) && loaded.strategies.length
          ? loaded.strategies.filter((id) => allowed.has(id))
          : []
      if (fromArr.length) return Array.from(new Set(fromArr))
      const one =
        loaded && typeof loaded.strategyId === "string" && allowed.has(loaded.strategyId)
          ? [loaded.strategyId]
          : []
      return one.length ? one : [...DEFAULT_LIVE_UI.strategies]
    }

    let nextUi: LiveTradingUiConfig = { ...DEFAULT_LIVE_UI }
    let nextMotor = { ...DEFAULT_SERVER_MOTOR }
    if (loaded) {
      const { serverMotor, ...rest } = loaded
      nextUi = {
        ...DEFAULT_LIVE_UI,
        ...rest,
        platform: "iqoption",
        iqMarketType: loaded.iqMarketType === "binary" ? "binary" : "otc",
        symbols: rest.symbols?.length ? rest.symbols : DEFAULT_LIVE_UI.symbols,
        strategies: strategiesFromPersist(),
      }
      if (serverMotor) {
        nextMotor = { ...DEFAULT_SERVER_MOTOR, ...serverMotor }
      }
    }
    setUi(nextUi)
    setMotor(nextMotor)

    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/trading/config`)
        const j = await response.json()
        if (cancelled || j.status !== "success" || !j.config) return
        const c = j.config as Record<string, unknown>
        const allow = new Set(strategyCatalog.map((s) => s.id))
        const iqRaw = String(c.iq_market_type || c.iqMarketType || "otc").toLowerCase()
        const iqMarketType: IqMarketType = iqRaw === "binary" ? "binary" : "otc"
        const fromServerArr = Array.isArray(c.strategies)
          ? (c.strategies as string[]).filter((id) => allow.has(id))
          : []
        const sidSingle =
          typeof c.strategy_id === "string" && allow.has(c.strategy_id)
            ? (c.strategy_id as string)
            : typeof c.strategyId === "string" && allow.has(c.strategyId)
              ? (c.strategyId as string)
              : null
        const strategiesNorm =
          fromServerArr.length > 0
            ? Array.from(new Set(fromServerArr))
            : sidSingle
              ? [sidSingle]
              : null
        const sym =
          Array.isArray(c.symbols) && (c.symbols as string[]).length
            ? (c.symbols as string[])
            : nextUi.symbols
        const modeRaw = String(c.mode || "").toLowerCase()
        const at = String(c.account_type || "").toUpperCase()
        setUi((prev) => ({
          ...prev,
          iqMarketType,
          symbols: sym,
          strategies: strategiesNorm ?? prev.strategies,
          mode: modeRaw === "automatic" ? "automatic" : "manual",
          accountType: at === "REAL" ? "REAL" : "DEMO",
          timeframe: typeof c.timeframe === "string" ? c.timeframe : prev.timeframe,
          analysisInterval:
            typeof c.analysis_interval === "number" ? c.analysis_interval : prev.analysisInterval,
          maxConcurrentTrades:
            typeof c.max_concurrent_trades === "number" ? c.max_concurrent_trades : prev.maxConcurrentTrades,
          tradeAmount: typeof c.trade_amount === "number" ? c.trade_amount : prev.tradeAmount,
          expirationTime: typeof c.expiration_time === "number" ? c.expiration_time : prev.expirationTime,
          riskLevel:
            c.risk === "low" || c.risk === "high" || c.risk === "medium"
              ? c.risk
              : prev.riskLevel,
        }))
        const sm = c.serverMotor as Partial<LiveServerMotorConfig> | undefined
        if (sm && typeof sm === "object") {
          setMotor((m) => ({ ...m, ...sm }))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [strategyCatalog])

  useEffect(() => {
    if (connectionInfo?.account_type) {
      const t = String(connectionInfo.account_type).toUpperCase()
      setUi((prev) => ({
        ...prev,
        accountType: t === "REAL" ? "REAL" : "DEMO",
      }))
    }
  }, [connectionInfo?.account_type])

  const persistAll = (): PersistedLiveTradingConfig => {
    const prev = loadPersistedLiveConfig()
    const picked = Array.from(new Set(ui.strategies.filter((id) => catalogIds.has(id))))
    const strategies = picked.length ? picked : [...DEFAULT_LIVE_UI.strategies]
    const strategyId = strategies[0]
    const next: PersistedLiveTradingConfig = {
      ...ui,
      platform: "iqoption",
      strategies,
      strategyId,
      serverMotor: { ...motor },
      strategyParamOverrides: prev?.strategyParamOverrides,
    }
    savePersistedLiveConfig(next)
    return next
  }

  const postTradingConfig = async (body: Record<string, unknown>) => {
    const response = await fetch(`${BASE_URL}/api/trading/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return response.json().catch(() => ({}))
  }

  const handleSave = async (): Promise<boolean> => {
    try {
      const picked = ui.strategies.filter((id) => catalogIds.has(id))
      if (picked.length === 0) {
        toast.error("Selecciona al menos una estrategia del listado")
        return false
      }
      const snapshot = persistAll()
      await postTradingConfig({
        mode: snapshot.mode === "automatic" ? "automatic" : "manual",
        platform: "iqoption",
        account_type: snapshot.accountType,
        iq_market_type: snapshot.iqMarketType,
        symbols: snapshot.symbols,
        strategies: snapshot.strategies,
        strategy_id: snapshot.strategyId ?? snapshot.strategies[0],
        strategy_param_overrides: snapshot.strategyParamOverrides ?? {},
        timeframe: snapshot.timeframe,
        analysis_interval: snapshot.analysisInterval,
        max_concurrent_trades: snapshot.maxConcurrentTrades,
        trade_amount: snapshot.tradeAmount,
        expiration_time: snapshot.expirationTime,
        risk: snapshot.riskLevel,
        serverMotor: snapshot.serverMotor,
      })
      toast.success("Configuración guardada (navegador + servidor)")
      return true
    } catch (e: any) {
      persistAll()
      toast.error(e?.message || "Guardado local; falló el servidor")
      return false
    }
  }

  const goNext = async () => {
    const ok = await handleSave()
    if (!ok) return
    if (iqHub) {
      router.push("/iqoption/dashboard?tab=live")
    } else {
      router.push("/app/dashboard/trading/live")
    }
  }

  const activeStrategySummary =
    ui.strategies.length === 1
      ? "1 estrategia activa para el motor."
      : `${ui.strategies.length} estrategias activas (el motor las evalúa en el escaneo).`

  const filteredStrategyCatalog = useMemo(() => {
    const q = strategyQuery.trim().toLowerCase()
    if (!q) return strategyCatalog
    return strategyCatalog.filter(
      (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    )
  }, [strategyCatalog, strategyQuery])

  const toggleStrategyPick = (id: string) => {
    setUi((prev) => {
      const has = prev.strategies.includes(id)
      if (has && prev.strategies.length === 1) {
        toast.error("Debe quedar al menos una estrategia seleccionada")
        return prev
      }
      return {
        ...prev,
        strategies: has ? prev.strategies.filter((x) => x !== id) : [...prev.strategies, id],
      }
    })
  }

  const filteredSymbolCandidates = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase()
    const all = candidatesForMarket(ui.iqMarketType)
    if (!q) return all
    return all.filter((s) => s.toLowerCase().includes(q))
  }, [ui.iqMarketType, symbolQuery])

  const toggleSym = (s: string) => {
    setUi((prev) => ({
      ...prev,
      symbols: prev.symbols.includes(s) ? prev.symbols.filter((x) => x !== s) : [...prev.symbols, s],
    }))
  }

  return (
    <div className="space-y-8 text-slate-900 [&_input]:text-slate-900 [&_select]:text-slate-900 [&_option]:bg-white [&_option]:text-slate-900">
      <div className="bg-white shadow-md rounded-xl p-6 border border-slate-300">
        <h2 className="text-xl font-bold text-slate-900 mb-1">IQ Option — operación en vivo</h2>
        <p className="text-sm text-slate-600 mb-6">
          Define <strong>mercado</strong> (OTC vs binarias), <strong>activos</strong>, modo y cuenta; se guarda en el navegador y en{" "}
          <code className="bg-slate-100 px-1 rounded text-xs">/api/trading/config</code> (archivo <code className="bg-slate-100 px-1 rounded text-xs">data/live_trading_ui_sync.json</code>).
          Abajo: umbrales del motor que usa el mismo cuerpo que <code className="bg-slate-100 px-1 rounded text-xs">POST /api/live/start</code>.
        </p>

        {connectionInfo && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
            <strong>Cuenta conectada:</strong> {connectionInfo.account_type ?? "—"}
            {connectionInfo.balance != null && (
              <>
                {" "}
                · Balance {Number(connectionInfo.balance).toFixed(2)} {connectionInfo.currency ?? "USD"}
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900">Modo, mercado y cuenta</h3>
            <div>
              <label className={`${LABEL}`}>Modo en el panel en vivo</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUi((p) => ({ ...p, mode: "manual" }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    ui.mode === "manual" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setUi((p) => ({ ...p, mode: "automatic" }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    ui.mode === "automatic" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  Automático
                </button>
              </div>
            </div>
            <div>
              <label className={`${LABEL}`}>Mercado IQ (lista de activos distinta)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setUi((p) =>
                      p.iqMarketType === "otc"
                        ? p
                        : { ...p, iqMarketType: "otc", symbols: remapSymbolsForMarket(p.symbols, "otc") }
                    )
                  }
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    ui.iqMarketType === "otc" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  OTC
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setUi((p) =>
                      p.iqMarketType === "binary"
                        ? p
                        : { ...p, iqMarketType: "binary", symbols: remapSymbolsForMarket(p.symbols, "binary") }
                    )
                  }
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    ui.iqMarketType === "binary" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  Binarias
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                OTC usa símbolos con sufijo <code className="rounded bg-slate-100 px-0.5">-OTC</code>; binarias usa los pares sin ese sufijo.
              </p>
            </div>
            <div>
              <label className={`${LABEL}`}>Tipo de cuenta (sincronizado con el bróker)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUi((p) => ({ ...p, accountType: "DEMO" }))}
                  className={`flex-1 py-2 rounded-lg text-sm ${
                    ui.accountType === "DEMO" ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-900"
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setUi((p) => ({ ...p, accountType: "REAL" }))}
                  className={`flex-1 py-2 rounded-lg text-sm ${
                    ui.accountType === "REAL" ? "bg-red-600 text-white" : "bg-slate-200 text-slate-900"
                  }`}
                >
                  Real
                </button>
              </div>
            </div>
            <div>
              <label className={`${LABEL}`}>Nivel de riesgo (referencia)</label>
              <select
                value={ui.riskLevel}
                onChange={(e) =>
                  setUi((p) => ({ ...p, riskLevel: e.target.value as LiveTradingUiConfig["riskLevel"] }))
                }
                className={FIELD}
              >
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border-2 border-slate-400 bg-slate-50 p-4 shadow-inner">
            <h3 className="font-bold text-slate-900">Montos y temporales</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Monto por operación ($)</label>
                <input
                  type="number"
                  min={1}
                  value={ui.tradeAmount}
                  onChange={(e) => setUi((p) => ({ ...p, tradeAmount: Number(e.target.value) }))}
                  className={FIELD}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className={LABEL}>Expiración (min)</label>
                <select
                  value={ui.expirationTime}
                  onChange={(e) => setUi((p) => ({ ...p, expirationTime: Number(e.target.value) }))}
                  className={FIELD}
                >
                  <option value={1}>1</option>
                  <option value={5}>5</option>
                  <option value={15}>15</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Timeframe análisis</label>
                <select
                  value={ui.timeframe}
                  onChange={(e) => setUi((p) => ({ ...p, timeframe: e.target.value }))}
                  className={FIELD}
                >
                  {TIMEFRAMES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Intervalo escaneo (seg)</label>
                <input
                  type="number"
                  min={15}
                  value={ui.analysisInterval}
                  onChange={(e) => setUi((p) => ({ ...p, analysisInterval: Number(e.target.value) }))}
                  className={FIELD}
                  inputMode="numeric"
                />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Máx. operaciones concurrentes</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={ui.maxConcurrentTrades}
                  onChange={(e) => setUi((p) => ({ ...p, maxConcurrentTrades: Number(e.target.value) }))}
                  className={FIELD}
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h3 className="font-semibold text-slate-900 mb-1">Símbolos a escanear</h3>
            <p className="mb-2 text-xs text-slate-600">
              Lista según el mercado elegido (OTC / binarias). Busca y marca los activos para el bot y el panel.
            </p>
            <input
              type="search"
              value={symbolQuery}
              onChange={(e) => setSymbolQuery(e.target.value)}
              placeholder="Buscar símbolo…"
              className={`${FIELD} mb-2`}
              autoComplete="off"
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border-2 border-slate-400 bg-slate-100 p-3 space-y-1.5 shadow-inner">
              {filteredSymbolCandidates.map((s) => (
                <label
                  key={s}
                  className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-semibold cursor-pointer border transition-colors ${
                    ui.symbols.includes(s)
                      ? "bg-blue-600 text-white border-blue-700"
                      : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={ui.symbols.includes(s)}
                    onChange={() => toggleSym(s)}
                    className="h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="tracking-wide">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border-2 border-slate-400 bg-slate-50 p-4 shadow-inner">
            <h3 className="font-semibold text-slate-900 mb-1">Estrategias del catálogo</h3>
            <p className="mb-2 text-xs text-slate-600">
              Marca <strong>una o varias</strong>. Los detalles de indicadores se ajustan en{" "}
              <strong>Estrategias</strong>. {activeStrategySummary}
            </p>
            <input
              type="search"
              value={strategyQuery}
              onChange={(e) => setStrategyQuery(e.target.value)}
              placeholder="Buscar por nombre o id…"
              className={`${FIELD} mb-2`}
              autoComplete="off"
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 space-y-1.5">
              {filteredStrategyCatalog.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-sm transition-colors ${
                    ui.strategies.includes(s.id)
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-slate-50/80 hover:bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={ui.strategies.includes(s.id)}
                    onChange={() => toggleStrategyPick(s.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{s.name}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">{s.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => router.push("/iqoption/dashboard?tab=strategies")}
              className="mt-3 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              Ir a Estrategias (presets)
            </button>
          </div>
        </div>
      </div>

      <div className="bg-indigo-100 border-2 border-indigo-300 rounded-xl p-6 text-slate-900">
        <h2 className="text-lg font-bold text-indigo-950 mb-1">Motor en servidor (riesgo, ML, filtros)</h2>
        <p className="text-sm text-indigo-950 mb-4">
          Mismos campos que <code className="bg-white/80 px-1 rounded">POST /api/live/start</code>. Cada opción incluye una
          explicación breve en español.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className={MOTOR_LABEL}>min_confidence (60–95)</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.min_confidence}</span>
            <input
              type="number"
              min={60}
              max={95}
              value={motor.min_confidence}
              onChange={(e) => setMotor((m) => ({ ...m, min_confidence: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL}>max_concurrent</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.max_concurrent}</span>
            <input
              type="number"
              min={1}
              value={motor.max_concurrent}
              onChange={(e) => setMotor((m) => ({ ...m, max_concurrent: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL}>max_daily_trades</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.max_daily_trades}</span>
            <input
              type="number"
              min={1}
              value={motor.max_daily_trades}
              onChange={(e) => setMotor((m) => ({ ...m, max_daily_trades: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL} htmlFor="use_ml">
              use_ml
            </label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.use_ml}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="use_ml"
                type="checkbox"
                checked={motor.use_ml}
                onChange={(e) => setMotor((m) => ({ ...m, use_ml: e.target.checked }))}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-900">Activar modelo ML</span>
            </div>
          </div>
          <div>
            <label className={MOTOR_LABEL}>ml_weight</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.ml_weight}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={0.5}
              value={motor.ml_weight}
              onChange={(e) => setMotor((m) => ({ ...m, ml_weight: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL}>ml_min_probability</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.ml_min_probability}</span>
            <input
              type="number"
              step={0.05}
              min={0.5}
              max={0.95}
              value={motor.ml_min_probability}
              onChange={(e) => setMotor((m) => ({ ...m, ml_min_probability: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL}>max_consecutive_losses</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.max_consecutive_losses}</span>
            <input
              type="number"
              min={1}
              value={motor.max_consecutive_losses}
              onChange={(e) => setMotor((m) => ({ ...m, max_consecutive_losses: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL}>loss_streak_pause_minutes</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.loss_streak_pause_minutes}</span>
            <input
              type="number"
              min={1}
              value={motor.loss_streak_pause_minutes}
              onChange={(e) => setMotor((m) => ({ ...m, loss_streak_pause_minutes: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL} htmlFor="reset_streak">
              reset_streak_on_win
            </label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.reset_streak_on_win}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="reset_streak"
                type="checkbox"
                checked={motor.reset_streak_on_win}
                onChange={(e) => setMotor((m) => ({ ...m, reset_streak_on_win: e.target.checked }))}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-900">Reiniciar racha al ganar</span>
            </div>
          </div>
          <div>
            <label className={MOTOR_LABEL}>daily_profit_target_type</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.daily_profit_target_type}</span>
            <select
              value={motor.daily_profit_target_type}
              onChange={(e) =>
                setMotor((m) => ({ ...m, daily_profit_target_type: e.target.value as "percent" | "fixed" }))
              }
              className={FIELD_MT}
            >
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
          </div>
          <div>
            <label className={MOTOR_LABEL}>daily_profit_target</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.daily_profit_target}</span>
            <input
              type="number"
              value={motor.daily_profit_target}
              onChange={(e) => setMotor((m) => ({ ...m, daily_profit_target: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL}>daily_loss_limit_type</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.daily_loss_limit_type}</span>
            <select
              value={motor.daily_loss_limit_type}
              onChange={(e) =>
                setMotor((m) => ({ ...m, daily_loss_limit_type: e.target.value as "percent" | "fixed" }))
              }
              className={FIELD_MT}
            >
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
          </div>
          <div>
            <label className={MOTOR_LABEL}>daily_loss_limit</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.daily_loss_limit}</span>
            <input
              type="number"
              value={motor.daily_loss_limit}
              onChange={(e) => setMotor((m) => ({ ...m, daily_loss_limit: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL} htmlFor="vol_f">
              volatility_filter_enabled
            </label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.volatility_filter_enabled}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="vol_f"
                type="checkbox"
                checked={motor.volatility_filter_enabled}
                onChange={(e) => setMotor((m) => ({ ...m, volatility_filter_enabled: e.target.checked }))}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-900">Filtro de volatilidad (ATR)</span>
            </div>
          </div>
          <div>
            <label className={MOTOR_LABEL}>atr_min_threshold</label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.atr_min_threshold}</span>
            <input
              type="number"
              step={0.01}
              value={motor.atr_min_threshold}
              onChange={(e) => setMotor((m) => ({ ...m, atr_min_threshold: Number(e.target.value) }))}
              className={FIELD_MT}
            />
          </div>
          <div>
            <label className={MOTOR_LABEL} htmlFor="news_f">
              news_filter_enabled
            </label>
            <span className={MOTOR_HINT}>{MOTOR_HELP.news_filter_enabled}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="news_f"
                type="checkbox"
                checked={motor.news_filter_enabled}
                onChange={(e) => setMotor((m) => ({ ...m, news_filter_enabled: e.target.checked }))}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-900">Evitar noticias de alto impacto</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium"
        >
          Guardar configuración
        </button>
        <button
          type="button"
          onClick={() => void goNext()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
        >
          Guardar e ir a Trading en vivo
        </button>
      </div>
    </div>
  )
}
