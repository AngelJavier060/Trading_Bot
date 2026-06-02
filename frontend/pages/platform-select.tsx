"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePlatform, AVAILABLE_PLATFORMS, type PlatformId } from '../context/PlatformContext'
import { isTradingSessionActive, setTradingSessionActive } from '../lib/sessionAuth'
import ConnectionModal from '../components/dashboard/ConnectionModal'

function toModalPlatform(id: PlatformId): 'iqoption' | 'mt5' | 'mt4' {
  if (id === 'iqoption') return 'iqoption'
  if (id === 'mt4') return 'mt4'
  return 'mt5'
}

export default function PlatformSelectPage() {
  const { setPlatform } = usePlatform()
  const [hasSession, setHasSession] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [pendingPlatform, setPendingPlatform] = useState<PlatformId | null>(null)
  const pendingRef = useRef<PlatformId | null>(null)

  useEffect(() => {
    setHasSession(isTradingSessionActive())
  }, [])

  const openCredentials = (id: PlatformId) => {
    pendingRef.current = id
    setPendingPlatform(id)
    setConnectOpen(true)
  }

  const closeModal = () => {
    setConnectOpen(false)
    setPendingPlatform(null)
    pendingRef.current = null
  }

  const handleConnectSuccess = useCallback(() => {
    setTradingSessionActive()
    const p = pendingRef.current
    if (p) setPlatform(p)
    pendingRef.current = null
    setConnectOpen(false)
    setPendingPlatform(null)
  }, [setPlatform])

  const skipToDashboard = (id: PlatformId) => {
    setTradingSessionActive()
    setPlatform(id)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="max-w-4xl w-full px-6 py-12">
        <div className="text-center mb-12">
          <p className="mb-4">
            <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
              ← Volver al inicio (Nexus)
            </Link>
          </p>
          <h1 className="text-4xl font-bold mb-3">🤖 Trading Bot</h1>
          <p className="text-gray-400 text-lg">
            Elige tu plataforma: se abrirá el formulario para usuario y contraseña del bróker
          </p>
          <p className="text-gray-500 text-sm mt-2 max-w-xl mx-auto">
            La conexión usa la misma API que el panel clásico (IQ Option o MetaTrader según elijas).
          </p>
          {!hasSession ? (
            <p className="text-amber-200/90 text-sm mt-4 max-w-lg mx-auto">
              Acceso institucional opcional:{' '}
              <Link href="/login" className="underline text-amber-100">
                iniciar sesión en Nexus
              </Link>
              .
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AVAILABLE_PLATFORMS.map((platform) => (
            <div
              key={platform.id}
              className="bg-gray-900 rounded-xl p-6 text-left border border-gray-800 
                         hover:border-blue-500 transition-all duration-200
                         hover:shadow-lg hover:shadow-blue-500/10
                         group flex flex-col"
            >
              <button
                type="button"
                onClick={() => openCredentials(platform.id)}
                className="text-left w-full flex flex-col flex-1"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">
                  {platform.id === 'iqoption' ? '📊' : platform.id === 'mt5' ? '📈' : '💹'}
                </div>
                <h2 className="text-2xl font-bold mb-2">{platform.name}</h2>
                <p className="text-gray-400 text-sm mb-4">{platform.description}</p>
                <div className="space-y-1.5 mb-4">
                  {platform.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mb-4">
                  {platform.accountTypes.map((type) => (
                    <span
                      key={type}
                      className={`text-xs px-3 py-1 rounded-full font-medium
                        ${type === 'DEMO'
                          ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
                          : 'bg-green-900/50 text-green-400 border border-green-700'}`}
                    >
                      {type}
                    </span>
                  ))}
                </div>
                <div className="mt-auto pt-4 border-t border-gray-800">
                  <span className="text-blue-400 font-medium group-hover:text-blue-300 transition-colors">
                    Conectar con usuario y contraseña →
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => skipToDashboard(platform.id)}
                className="mt-3 w-full text-xs text-gray-500 hover:text-gray-300 py-2 border border-transparent hover:border-gray-700 rounded-lg transition-colors"
              >
                Ir al panel sin conectar ahora
              </button>
            </div>
          ))}
        </div>

        {pendingPlatform && (
          <ConnectionModal
            key={pendingPlatform}
            isOpen={connectOpen}
            onClose={closeModal}
            platform={toModalPlatform(pendingPlatform)}
            onSuccess={handleConnectSuccess}
          />
        )}

        <div className="text-center mt-12 text-gray-500 text-sm space-y-3 max-w-xl mx-auto">
          <p>
            Tras elegir plataforma, la operativa en vivo (manual o automático) vive en{' '}
            <strong className="text-gray-300">/iqoption/dashboard</strong>, <strong className="text-gray-300">/mt5/dashboard</strong> o{' '}
            <strong className="text-gray-300">/mt4/dashboard</strong>, usando las mismas rutas del backend{' '}
            <code className="text-gray-400">/api/live/*</code> y <code className="text-gray-400">/api/trading/*</code>.
          </p>
          <p className="text-xs text-gray-600">
            Auto-conexión del servidor: <Link href="/auto-connect" className="text-blue-400 hover:text-blue-300 underline">/auto-connect</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
