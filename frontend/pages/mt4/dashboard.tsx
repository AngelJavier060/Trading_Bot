"use client"

import React, { useState } from 'react'
import { usePlatform } from '../../context/PlatformContext'
import { getStrategiesForPlatform } from '../../types/strategies'
import PlatformChrome from '../../components/platform/PlatformChrome'
import MetaServerBotPanel from '../../components/platform/mt/MetaServerBotPanel'

type TabId = 'live' | 'backtest' | 'strategies' | 'config' | 'history'

export default function MT4Dashboard() {
  const { connectionStatus, connectionInfo } = usePlatform()
  const [activeTab, setActiveTab] = useState<TabId>('live')
  const strategies = getStrategiesForPlatform('mt4')

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'live', label: 'Trading en Vivo', icon: '📊' },
    { id: 'backtest', label: 'Backtesting', icon: '📋' },
    { id: 'strategies', label: 'Estrategias', icon: '🧠' },
    { id: 'config', label: 'Configuración', icon: '⚙️' },
    { id: 'history', label: 'Historial', icon: '📜' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PlatformChrome platformId="mt4" />

      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'live' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Trading en Vivo - MT4</h2>
            <p className="text-sm text-gray-400 mb-6 max-w-3xl">
              La conexión usa el mismo endpoint MT5 del backend (terminal Windows). El motor en vivo también envía{' '}
              <code className="text-gray-300">platform=mt5</code> unificado. Revisa el modal &quot;Conectar&quot; si tu
              cuenta es solo MT4.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800">
                <div className="flex items-center justify-center h-80 text-gray-500">
                  💹 Gráfico MT4 en tiempo real (próximamente)
                </div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-4">Motor y riesgo</h3>
                <MetaServerBotPanel
                  uiPlatform="mt4"
                  connectionStatus={connectionStatus}
                  connectionInfo={connectionInfo}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategies' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Estrategias - MT4</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {strategies.map(s => (
                <div key={s.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-green-600 transition-colors">
                  <h3 className="font-bold text-lg mb-2">{s.name}</h3>
                  <p className="text-sm text-gray-400 mb-3">{s.description}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {s.timeframes.map(tf => (
                      <span key={tf} className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-300">{tf}</span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500">
                    Tipo: <span className="text-gray-300">{s.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'backtest' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Backtesting - MT4</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center justify-center h-60 text-gray-500">
                📋 Backtesting MT4 (próximamente)
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Configuración - MT4</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 max-w-xl">
              <h3 className="font-semibold mb-4">Conexión</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-gray-800 py-2">
                  <span className="text-gray-400">Estado</span>
                  <span className={connectionStatus === 'connected' ? 'text-green-400' : 'text-yellow-400'}>
                    {connectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-800 py-2">
                  <span className="text-gray-400">Cuenta</span>
                  <span>{connectionInfo?.account_type ?? '—'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-400">Balance</span>
                  <span className="text-green-400">
                    {connectionInfo?.balance != null
                      ? `${Number(connectionInfo.balance).toFixed(2)} ${connectionInfo.currency ?? ''}`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Historial - MT4</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center justify-center h-60 text-gray-500">
                📜 Historial de posiciones MT4 (próximamente)
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
