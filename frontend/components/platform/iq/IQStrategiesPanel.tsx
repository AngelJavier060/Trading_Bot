"use client"

import React, { useMemo, useState, useEffect, useCallback } from "react"
import { toast } from "react-hot-toast"
import { getStrategiesForPlatform, type Strategy } from "../../../types/strategies"
import {
  loadPersistedLiveConfig,
  savePersistedLiveConfig,
  DEFAULT_LIVE_UI,
  type PersistedLiveTradingConfig,
} from "../../../types/liveTrading"
import {
  IQ_STRATEGY_DISPLAY_NAME,
  EMA_TREND_CONTINUATION_PRESET,
  EMA_TREND_LIVE_PRESET,
  PRICE_ACTION_KEY_LEVELS_PRESET,
  PRICE_ACTION_LIVE_PRESET,
} from "../../../lib/iqStrategyPresets"

function defaultsForStrategy(s: Strategy): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of s.parameters) {
    const v = p.default
    out[p.name] = typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0
  }
  return out
}

function displayNameFor(id: string, fallbackName?: string): string {
  return IQ_STRATEGY_DISPLAY_NAME[id] ?? fallbackName ?? id
}

export default function IQStrategiesPanel() {
  const catalog = useMemo(() => getStrategiesForPlatform("iqoption"), [])

  /** Estrategia guardada en `live_trading_config` (la que usa en vivo). */
  const [savedStrategyId, setSavedStrategyId] = useState<string>(catalog[0]?.id ?? "ema_rsi")
  /** Fila con panel de parámetros abierto; `null` = todo colapsado hasta que pulses una estrategia. */
  const [openPanelId, setOpenPanelId] = useState<string | null>(null)
  const [paramsByStrategy, setParamsByStrategy] = useState<Record<string, Record<string, number>>>({})
  const [showAdvancedParams, setShowAdvancedParams] = useState(false)

  const hydrate = useCallback(() => {
    const raw = loadPersistedLiveConfig()
    const sid =
      (raw?.strategyId && catalog.some((c) => c.id === raw.strategyId) && raw.strategyId) ||
      (raw?.strategies?.[0] && catalog.some((c) => c.id === raw.strategies![0]) && raw.strategies![0]) ||
      catalog[0]?.id ||
      "ema_rsi"

    setSavedStrategyId(sid)

    const merged: Record<string, Record<string, number>> = {}
    for (const s of catalog) {
      const base =
        s.id === "ema_trend_continuation"
          ? { ...defaultsForStrategy(s), ...EMA_TREND_CONTINUATION_PRESET }
          : s.id === "price_action_key_levels"
            ? { ...defaultsForStrategy(s), ...PRICE_ACTION_KEY_LEVELS_PRESET }
            : defaultsForStrategy(s)
      const ov = raw?.strategyParamOverrides?.[s.id] ?? {}
      merged[s.id] = { ...base, ...ov }
    }
    setParamsByStrategy(merged)
  }, [catalog])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    setShowAdvancedParams(false)
  }, [openPanelId])

  const persistStrategyBundle = (overrides: Partial<PersistedLiveTradingConfig> = {}) => {
    const sid = openPanelId
    if (!sid) return
    const strat = catalog.find((c) => c.id === sid)
    const currentParams = strat ? paramsByStrategy[sid] ?? defaultsForStrategy(strat) : {}
    const prev = loadPersistedLiveConfig()
    const base = prev ? { ...DEFAULT_LIVE_UI, ...prev } : { ...DEFAULT_LIVE_UI }
    const next: PersistedLiveTradingConfig = {
      ...base,
      ...overrides,
      strategyId: sid,
      strategies: [sid],
      strategyParamOverrides: {
        ...base.strategyParamOverrides,
        ...paramsByStrategy,
        [sid]: { ...paramsByStrategy[sid], ...currentParams },
      },
    }
    savePersistedLiveConfig(next)
    setSavedStrategyId(sid)
  }

  const applyEmaTrendRecommended = () => {
    setOpenPanelId("ema_trend_continuation")
    setParamsByStrategy((prev) => ({
      ...prev,
      ema_trend_continuation: { ...EMA_TREND_CONTINUATION_PRESET },
    }))
    const prev = loadPersistedLiveConfig()
    const base = prev ? { ...DEFAULT_LIVE_UI, ...prev } : { ...DEFAULT_LIVE_UI }
    const next: PersistedLiveTradingConfig = {
      ...base,
      strategyId: "ema_trend_continuation",
      strategies: ["ema_trend_continuation"],
      timeframe: EMA_TREND_LIVE_PRESET.timeframe,
      expirationTime: EMA_TREND_LIVE_PRESET.expirationTime,
      analysisInterval: EMA_TREND_LIVE_PRESET.analysisInterval,
      strategyParamOverrides: {
        ...base.strategyParamOverrides,
        ...prev?.strategyParamOverrides,
        ema_trend_continuation: { ...EMA_TREND_CONTINUATION_PRESET },
      },
    }
    savePersistedLiveConfig(next)
    hydrate()
    toast.success("Preset aplicado: 5m, expiración 15 min y parámetros recomendados")
  }

  const applyPriceActionRecommended = () => {
    setOpenPanelId("price_action_key_levels")
    setParamsByStrategy((prev) => ({
      ...prev,
      price_action_key_levels: { ...PRICE_ACTION_KEY_LEVELS_PRESET },
    }))
    const prev = loadPersistedLiveConfig()
    const base = prev ? { ...DEFAULT_LIVE_UI, ...prev } : { ...DEFAULT_LIVE_UI }
    const next: PersistedLiveTradingConfig = {
      ...base,
      strategyId: "price_action_key_levels",
      strategies: ["price_action_key_levels"],
      timeframe: PRICE_ACTION_LIVE_PRESET.timeframe,
      expirationTime: PRICE_ACTION_LIVE_PRESET.expirationTime,
      analysisInterval: PRICE_ACTION_LIVE_PRESET.analysisInterval,
      strategyParamOverrides: {
        ...base.strategyParamOverrides,
        ...prev?.strategyParamOverrides,
        price_action_key_levels: { ...PRICE_ACTION_KEY_LEVELS_PRESET },
      },
    }
    savePersistedLiveConfig(next)
    hydrate()
    toast.success("Preset Price Action: 5m + 15m niveles, expiración 15 min")
  }

  const handleSaveAndRefresh = () => {
    if (!openPanelId) {
      toast.error("Abre primero una estrategia para guardar")
      return
    }
    persistStrategyBundle()
    hydrate()
    setOpenPanelId(null)
    toast.success("Estrategia guardada.")
  }

  const paramsForStrategy = (s: Strategy) => paramsByStrategy[s.id] ?? defaultsForStrategy(s)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-slate-900">
      <div className="rounded-2xl border border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Estrategias IQ Option</h2>
        <p className="mt-2 text-sm text-slate-600">
          Las estrategias empiezan <strong>colapsadas</strong>. Pulsa una fila para configurar y pulsa{" "}
          <strong>Guardar estrategia</strong>: al guardar, la lista vuelve a verse <strong>así, colapsada</strong> (como
          un acordeón); la que quedó guardada muestra <strong>Activa (guardada)</strong>. Solo configuración, sin ir a
          Trading en vivo. Datos en <code className="rounded bg-white px-1 text-xs">live_trading_config</code>.
        </p>

        <div className="mt-6 space-y-3">
          {catalog.map((s) => {
            const isOpen = openPanelId === s.id
            const rowParams = paramsForStrategy(s)
            const isEma = s.id === "ema_trend_continuation"
            const isPA = s.id === "price_action_key_levels"
            const isSavedActive = savedStrategyId === s.id

            return (
              <div
                key={s.id}
                className={`overflow-hidden rounded-xl border-2 transition-colors ${
                  isOpen ? "border-blue-600 bg-white shadow-md ring-2 ring-blue-200" : "border-slate-200 bg-white/80"
                }`}
              >
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-start gap-3 p-4 text-left hover:bg-slate-50/80"
                  onClick={() => setOpenPanelId((cur) => (cur === s.id ? null : s.id))}
                >
                  <span
                    className={`mt-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${
                      isOpen ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-500"
                    }`}
                    aria-hidden
                  >
                    {isOpen ? "−" : "+"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-slate-900">{displayNameFor(s.id, s.name)}</span>
                      {isSavedActive && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Activa (guardada)
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Código: <code className="rounded bg-slate-100 px-1.5 py-0.5">{s.id}</code>
                      {isOpen ? " · pulsa de nuevo para ocultar" : " · pulsa para configurar"}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.timeframes.map((tf) => (
                        <span
                          key={tf}
                          className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800"
                        >
                          {tf}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-slate-200 bg-slate-50/90 px-4 pb-5 pt-4">
                    {isEma ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                          <div>
                            <h3 className="font-bold text-amber-950">Configuración recomendada</h3>
                            <p className="mt-1 text-sm text-amber-900/90">
                              Timeframe <strong>5 minutos</strong>. Expiración <strong>15 minutos</strong> (3× la vela).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={applyEmaTrendRecommended}
                            className="shrink-0 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-700"
                          >
                            Aplicar preset recomendado
                          </button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h4 className="font-bold text-slate-900">Los 5 pasos (criterios)</h4>
                            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-slate-700">
                              <li>
                                <strong>Tendencia (EMA 20 y 50):</strong> solo en la dirección de las EMAs; si cruzan o
                                están muy juntas, no hay señal clara.
                              </li>
                              <li>
                                <strong>Pullback a EMA 20:</strong> tocar o rozar la EMA 20 (±0,1 %).
                              </li>
                              <li>
                                <strong>ADX &gt; 20:</strong> sin tendencia real la estrategia no aplica.
                              </li>
                              <li>
                                <strong>RSI como fuerza:</strong> CALL con rebote del RSI desde debajo de 50; PUT con
                                caída desde encima de 50.
                              </li>
                              <li>
                                <strong>Vela confirmadora:</strong> engulfing, rechazo, momentum o ruptura de rango.
                              </li>
                            </ol>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h4 className="font-bold text-slate-900">Horario Ecuador (alta liquidez)</h4>
                            <ul className="mt-3 space-y-2 text-sm text-slate-700">
                              <li>
                                <span className="font-semibold text-slate-900">Londres:</span> 03:00 – 07:00
                              </li>
                              <li>
                                <span className="font-semibold text-slate-900">Nueva York:</span> 08:00 – 12:00
                              </li>
                              <li>
                                <span className="font-semibold text-emerald-800">Cruce Londres–NY:</span> 08:00 – 11:00
                              </li>
                            </ul>
                            <p className="mt-3 text-xs text-slate-500">
                              El motor filtra por estas sesiones.
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <h4 className="font-semibold text-slate-900">Parámetros (valores actuales / guardados)</h4>
                          <p className="mt-1 text-xs text-slate-600">
                            Tras <strong>Guardar</strong>, al volver a elegir esta estrategia se muestran estos números.
                          </p>
                          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            {Object.keys(EMA_TREND_CONTINUATION_PRESET).map((k) => (
                              <div key={k} className="flex justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <dt className="text-slate-600">{k}</dt>
                                <dd className="font-mono font-bold text-slate-900">{rowParams[k] ?? "—"}</dd>
                              </div>
                            ))}
                          </dl>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedParams((x) => !x)}
                            className="mt-3 text-sm font-medium text-blue-700 underline hover:text-blue-900"
                          >
                            {showAdvancedParams ? "Ocultar ajuste fino" : "Ajuste fino (opcional)"}
                          </button>
                          {showAdvancedParams && (
                            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                              {s.parameters.map((p) => (
                                <div key={p.name}>
                                  <label className="mb-1 block text-sm font-medium text-slate-800">{p.description}</label>
                                  <span className="mb-1 block text-xs text-slate-500">{p.name}</span>
                                  <input
                                    type="number"
                                    value={rowParams[p.name] ?? p.default}
                                    onChange={(e) => {
                                      const v = Number(e.target.value)
                                      setParamsByStrategy((prev) => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] ?? defaultsForStrategy(s)), [p.name]: v },
                                      }))
                                    }}
                                    className="w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : isPA ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4">
                          <div>
                            <h3 className="font-bold text-indigo-950">Preset documento técnico</h3>
                            <p className="mt-1 text-sm text-indigo-900/90">
                              15m solo niveles · 5m patrones · expiración <strong>15 min</strong> · Ecuador{" "}
                              <strong>08:00–12:00</strong>.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={applyPriceActionRecommended}
                            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                          >
                            Aplicar preset recomendado
                          </button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h4 className="font-bold text-slate-900">Patrones 5m (en zona 15m)</h4>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                              <li>Martillo → CALL en soporte</li>
                              <li>Estrella fugaz → PUT en resistencia</li>
                              <li>Engulfing alcista / bajista</li>
                              <li>Doji + confirmación en la vela siguiente</li>
                            </ul>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h4 className="font-bold text-slate-900">Filtros (motor)</h4>
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                              <li>Horario Ecuador 08–12 para señal ejecutable</li>
                              <li>Nivel con ≥ 2 toques en 15m</li>
                              <li>Niveles rotos por vela de fuerza se excluyen</li>
                              <li>Máx. 2 operaciones simultáneas: ajusta en Trading en vivo</li>
                            </ul>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <h4 className="font-semibold text-slate-900">Parámetros (valores actuales / guardados)</h4>
                          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            {Object.keys(PRICE_ACTION_KEY_LEVELS_PRESET).map((k) => (
                              <div key={k} className="flex justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <dt className="text-slate-600">{k}</dt>
                                <dd className="font-mono font-bold text-slate-900">{rowParams[k] ?? "—"}</dd>
                              </div>
                            ))}
                          </dl>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedParams((x) => !x)}
                            className="mt-3 text-sm font-medium text-blue-700 underline hover:text-blue-900"
                          >
                            {showAdvancedParams ? "Ocultar ajuste fino" : "Ajuste fino (opcional)"}
                          </button>
                          {showAdvancedParams && (
                            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                              {s.parameters.map((p) => (
                                <div key={p.name}>
                                  <label className="mb-1 block text-sm font-medium text-slate-800">{p.description}</label>
                                  <span className="mb-1 block text-xs text-slate-500">{p.name}</span>
                                  <input
                                    type="number"
                                    value={rowParams[p.name] ?? p.default}
                                    onChange={(e) => {
                                      const v = Number(e.target.value)
                                      setParamsByStrategy((prev) => ({
                                        ...prev,
                                        [s.id]: { ...(prev[s.id] ?? defaultsForStrategy(s)), [p.name]: v },
                                      }))
                                    }}
                                    className="w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900">
                          Parámetros — {displayNameFor(s.id, s.name)}
                        </h3>
                        <p className="mb-4 text-xs text-slate-500">Mismos nombres que en el backend Python.</p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {s.parameters.map((p) => (
                            <div key={p.name}>
                              <label className="mb-1 block text-sm font-medium text-slate-800">{p.description}</label>
                              <span className="mb-1 block text-xs text-slate-500">{p.name}</span>
                              <input
                                type="number"
                                value={rowParams[p.name] ?? p.default}
                                onChange={(e) => {
                                  const v = Number(e.target.value)
                                  setParamsByStrategy((prev) => ({
                                    ...prev,
                                    [s.id]: { ...(prev[s.id] ?? defaultsForStrategy(s)), [p.name]: v },
                                  }))
                                }}
                                className="w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-4">
                      <button
                        type="button"
                        onClick={handleSaveAndRefresh}
                        className="rounded-xl bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700"
                      >
                        Guardar estrategia
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
