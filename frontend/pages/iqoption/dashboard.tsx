"use client"

import React, { useState, useEffect, Suspense, lazy } from "react"
import { useRouter } from "next/router"
import PlatformChrome from "../../components/platform/PlatformChrome"

const ConfigurationPage = lazy(() => import("../app/dashboard/configuration/index"))
const BacktestingPage = lazy(() => import("../app/dashboard/backtesting/index"))
const LiveTradingPage = lazy(() => import("../app/dashboard/trading/live"))
const IQStrategiesPanel = lazy(() => import("../../components/platform/iq/IQStrategiesPanel"))

type TabId = "config" | "strategies" | "backtest" | "live"

function tabFromQuery(q: string | string[] | undefined): TabId {
  const v = Array.isArray(q) ? q[0] : q
  if (v === "strategies") return "strategies"
  if (v === "backtest") return "backtest"
  if (v === "live") return "live"
  if (v === "config") return "config"
  return "config"
}

export default function IQOptionDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>("config")

  useEffect(() => {
    if (!router.isReady) return
    setActiveTab(tabFromQuery(router.query.tab))
  }, [router.isReady, router.query.tab])

  const goTab = (id: TabId) => {
    setActiveTab(id)
    router.replace({ pathname: "/iqoption/dashboard", query: { tab: id } }, undefined, { shallow: true })
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "config", label: "Configuración", icon: "⚙️" },
    { id: "strategies", label: "Estrategias", icon: "🧠" },
    { id: "backtest", label: "Backtesting", icon: "📋" },
    { id: "live", label: "Trading en vivo", icon: "📊" },
  ]

  const fallback = (
    <div className="flex items-center justify-center min-h-[40vh] text-gray-500 text-sm">Cargando…</div>
  )

  const isLive = activeTab === "live"

  return (
    <div
      className={
        isLive
          ? "flex h-screen min-h-0 flex-col overflow-hidden bg-[#e4e9ef]"
          : "min-h-screen bg-gray-950 text-white"
      }
    >
      {!isLive && <PlatformChrome platformId="iqoption" />}

      {!isLive && (
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-xs text-gray-500 py-2">
            Flujo: <strong className="text-gray-300">Configuración</strong> (operativa) →{" "}
            <strong className="text-gray-300">Estrategias</strong> (una sola estrategia y sus parámetros) →{" "}
            <strong className="text-gray-300">Trading en vivo</strong> / <strong className="text-gray-300">Backtesting</strong>.
          </p>
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => goTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      <main
        className={
          isLive
            ? "min-h-0 flex-1 overflow-hidden px-0 py-0"
            : "max-w-7xl mx-auto px-0 sm:px-6 py-4"
        }
      >
        <Suspense fallback={fallback}>
          {activeTab === "config" && <ConfigurationPage />}
          {activeTab === "strategies" && <IQStrategiesPanel />}
          {activeTab === "backtest" && <BacktestingPage />}
          {activeTab === "live" && <LiveTradingPage />}
        </Suspense>
      </main>
    </div>
  )
}
