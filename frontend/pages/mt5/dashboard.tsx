"use client"

import React, { useState } from 'react'
import { usePlatform } from '../../context/PlatformContext'
import { getStrategiesForPlatform } from '../../types/strategies'
import PlatformChrome from '../../components/platform/PlatformChrome'
import MetaServerBotPanel from '../../components/platform/mt/MetaServerBotPanel'

type TabId = 'live' | 'backtest' | 'strategies' | 'config' | 'history'

export default function MT5Dashboard() {
  const { connectionStatus, connectionInfo } = usePlatform()
  const [activeTab, setActiveTab] = useState<TabId>('live')
  const strategies = getStrategiesForPlatform('mt5')

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'live', label: 'Trading en Vivo', icon: '📊' },
    { id: 'backtest', label: 'Backtesting', icon: '📋' },
    { id: 'strategies', label: 'Estrategias', icon: '🧠' },
    { id: 'config', label: 'Configuración', icon: '⚙️' },
    { id: 'history', label: 'Historial', icon: '📜' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PlatformChrome platformId="mt5" />

      {/* Tabs */}
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

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'live' && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Trading en vivo — MT5</h2>
            <p className="text-sm text-gray-400 mb-6 max-w-3xl">
              Motor compartido con el backend (<code className="text-gray-300">platform=mt5</code> en{' '}
              <code className="text-gray-300">/api/live/start</code>). Manual o automático en el panel lateral.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800">
                <div className="flex items-center justify-center h-80 text-gray-500">
                  📈 Gráfico MT5 en tiempo real (próximamente)
                </div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-4">Motor y riesgo</h3>
                <MetaServerBotPanel
                  uiPlatform="mt5"
                  connectionStatus={connectionStatus}
                  connectionInfo={connectionInfo}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'strategies' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Estrategias - MT5</h2>
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
            <h2 className="text-2xl font-bold mb-6">Backtesting - MT5</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center justify-center h-60 text-gray-500">
                📋 Backtesting MT5 (próximamente)
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Configuración - MT5</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-4">Conexión MT5</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-sm text-gray-400">Estado</span>
                    <span
                      className={`text-sm font-medium ${
                        connectionStatus === 'connected' ? 'text-green-400' : 'text-yellow-400'
                      }`}
                    >
                      {connectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-sm text-gray-400">Cuenta</span>
                    <span className="text-sm">{connectionInfo?.account_type ?? '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-sm text-gray-400">Balance</span>
                    <span className="text-sm text-green-400">
                      {connectionInfo?.balance != null
                        ? `${Number(connectionInfo.balance).toFixed(2)} ${connectionInfo.currency ?? ''}`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-4">Gestión de Riesgo</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400">Stop Loss fijo (pips)</label>
                    <input type="number" defaultValue={20} className="w-full bg-gray-800 rounded p-2 text-sm mt-1 border border-gray-700" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Take Profit fijo (pips)</label>
                    <input type="number" defaultValue={50} className="w-full bg-gray-800 rounded p-2 text-sm mt-1 border border-gray-700" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Historial - MT5</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center justify-center h-60 text-gray-500">
                📜 Historial de posiciones MT5 (próximamente)
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
