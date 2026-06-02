"use client"

import React, { useState, useCallback } from 'react'
import Link from 'next/link'
import { usePlatform, type PlatformId } from '../../context/PlatformContext'
import ConnectionModal from '../dashboard/ConnectionModal'
import { getAutoConnectSettingsPath } from '../../lib/platformRoutes'

type Props = {
  platformId: PlatformId
}

export default function PlatformChrome({ platformId }: Props) {
  const {
    platformConfig,
    connectionStatus,
    connectionInfo,
    isPlatformConnected,
    refreshConnection,
    disconnectBroker,
    switchPlatform,
    disconnect,
  } = usePlatform()

  const [connectOpen, setConnectOpen] = useState(false)

  const onConnectSuccess = useCallback(() => {
    void refreshConnection()
  }, [refreshConnection])

  const handleDisconnectBroker = useCallback(async () => {
    if (!window.confirm('¿Desconectar la cuenta del bróker en este servidor?')) return
    await disconnectBroker()
  }, [disconnectBroker])

  const modalPlatform: 'iqoption' | 'mt5' | 'mt4' =
    platformId === 'iqoption' ? 'iqoption' : platformId === 'mt4' ? 'mt4' : 'mt5'

  const balanceLine =
    connectionInfo?.balance != null
      ? `${Number(connectionInfo.balance).toFixed(2)} ${connectionInfo.currency || 'USD'}`
      : null

  return (
    <>
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-3xl shrink-0">
              {platformId === 'iqoption' ? '📊' : platformId === 'mt5' ? '📈' : '💹'}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">{platformConfig?.name ?? platformId}</h1>
              <p className="text-xs text-gray-400 truncate">
                {platformConfig?.description?.split('.')[0]}
              </p>
            </div>
            <span
              className={`ml-1 sm:ml-3 px-3 py-1 rounded-full text-xs font-medium shrink-0 ${
                connectionStatus === 'connected'
                  ? 'bg-green-900/50 text-green-400 border border-green-700'
                  : connectionStatus === 'connecting'
                    ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                    : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
              }`}
            >
              {connectionStatus === 'connected'
                ? 'Conectado'
                : connectionStatus === 'connecting'
                  ? 'Conectando…'
                  : 'Desconectado'}
            </span>
            {isPlatformConnected && balanceLine && (
              <span className="hidden md:inline text-sm text-gray-300 shrink-0">{balanceLine}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {!isPlatformConnected ? (
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                Conectar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnectBroker}
                className="text-sm px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-300 border border-gray-700 transition-colors"
              >
                Desconectar cuenta
              </button>
            )}
            <Link
              href={getAutoConnectSettingsPath()}
              className="text-sm px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
            >
              Auto-conexión
            </Link>
            <button
              type="button"
              onClick={switchPlatform}
              className="text-sm text-gray-400 hover:text-white transition-colors px-2"
            >
              Cambiar plataforma
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="text-sm text-red-400 hover:text-red-300 transition-colors px-2"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {!isPlatformConnected && (
        <div className="bg-amber-950/40 border-b border-amber-800/50 px-6 py-3">
          <div className="max-w-7xl mx-auto text-sm text-amber-200/95">
            <strong className="text-amber-100">Sin conexión al bróker.</strong> Pulsa <em>Conectar</em> e
            introduce tus credenciales de {platformConfig?.name ?? 'esta plataforma'}. También puedes usar{' '}
            <Link href={getAutoConnectSettingsPath()} className="underline text-amber-100">
              credenciales guardadas (auto-conexión)
            </Link>
            .
          </div>
        </div>
      )}

      <ConnectionModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        platform={modalPlatform}
        onSuccess={onConnectSuccess}
      />
    </>
  )
}
