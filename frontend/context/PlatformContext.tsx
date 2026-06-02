"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { clearTradingSession } from '../lib/sessionAuth'
import api from '../services/api'

export type PlatformId = 'iqoption' | 'mt5' | 'mt4'

export interface PlatformConfig {
  id: PlatformId
  name: string
  icon: string
  description: string
  features: string[]
  accountTypes: string[]
}

export interface PlatformConnectionInfo {
  balance?: number
  currency?: string
  account_type?: string
}

export const AVAILABLE_PLATFORMS: PlatformConfig[] = [
  {
    id: 'iqoption',
    name: 'IQ Option',
    icon: '/icons/iqoption.png',
    description: 'Trading de opciones binarias y digitales. Ideal para corto plazo (1-5 min).',
    features: ['Opciones binarias', 'Trading OTC', 'Corto plazo (1m-15m)', 'Estrategias basadas en velas'],
    accountTypes: ['DEMO', 'REAL'],
  },
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    icon: '/icons/mt5.png',
    description: 'Trading de Forex y CFDs. Ideal para mediano/largo plazo.',
    features: ['Forex & CFDs', 'Órdenes de mercado', 'Take Profit / Stop Loss', 'Estrategias de tendencia'],
    accountTypes: ['DEMO', 'REAL'],
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    icon: '/icons/mt4.png',
    description: 'Trading clásico de Forex. Ideal para análisis técnico avanzado.',
    features: ['Forex', 'Indicadores personalizados', 'EAs (Expert Advisors)', 'Alto grado de personalización'],
    accountTypes: ['DEMO', 'REAL'],
  },
]

interface PlatformContextType {
  activePlatform: PlatformId | null
  setPlatform: (platform: PlatformId) => void
  platformConfig: PlatformConfig | null
  isPlatformConnected: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  connectionInfo: PlatformConnectionInfo | null
  refreshConnection: () => Promise<void>
  disconnectBroker: () => Promise<void>
  switchPlatform: () => void
  disconnect: () => void
}

const PlatformContext = createContext<PlatformContextType>({
  activePlatform: null,
  setPlatform: () => {},
  platformConfig: null,
  isPlatformConnected: false,
  connectionStatus: 'disconnected',
  connectionInfo: null,
  refreshConnection: async () => {},
  disconnectBroker: async () => {},
  switchPlatform: () => {},
  disconnect: () => {},
})

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [activePlatform, setActivePlatform] = useState<PlatformId | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected')
  const [connectionInfo, setConnectionInfo] = useState<PlatformConnectionInfo | null>(null)
  const router = useRouter()

  const platformConfig = activePlatform
    ? AVAILABLE_PLATFORMS.find(p => p.id === activePlatform) || null
    : null

  const refreshConnection = useCallback(async () => {
    if (!activePlatform) {
      setConnectionStatus('disconnected')
      setConnectionInfo(null)
      return
    }

    try {
      if (activePlatform === 'iqoption') {
        const r = await api.checkConnection()
        if (r.status === 'connected') {
          setConnectionStatus('connected')
          const ai = r.accountInfo || {}
          setConnectionInfo({
            balance: typeof ai.balance === 'number' ? ai.balance : undefined,
            currency: ai.currency,
            account_type: ai.account_type,
          })
        } else {
          setConnectionStatus('disconnected')
          setConnectionInfo(null)
        }
        return
      }

      if (activePlatform === 'mt5' || activePlatform === 'mt4') {
        const r = await api.getMT5Status()
        const ok = r.connected === true || r.status === 'connected'
        if (ok) {
          const ai = (r as { accountInfo?: PlatformConnectionInfo & { balance?: number } }).accountInfo || r
          setConnectionStatus('connected')
          setConnectionInfo({
            balance: typeof ai.balance === 'number' ? ai.balance : undefined,
            currency: (ai as { currency?: string }).currency,
            account_type: (ai as { account_type?: string }).account_type,
          })
        } else {
          setConnectionStatus(r.status === 'unavailable' ? 'error' : 'disconnected')
          setConnectionInfo(null)
        }
      }
    } catch {
      setConnectionStatus('error')
      setConnectionInfo(null)
    }
  }, [activePlatform])

  const setPlatform = useCallback(
    (platform: PlatformId) => {
      setActivePlatform(platform)
      localStorage.setItem('activePlatform', platform)
      router.push(`/${platform}/dashboard`)
    },
    [router]
  )

  const disconnectBroker = useCallback(async () => {
    if (!activePlatform) return
    try {
      if (activePlatform === 'iqoption') {
        await api.disconnect()
      } else if (activePlatform === 'mt5' || activePlatform === 'mt4') {
        await api.disconnectMT5()
      }
    } catch {
      /* aun así refrescamos estado */
    }
    await refreshConnection()
  }, [activePlatform, refreshConnection])

  const switchPlatform = useCallback(() => {
    setActivePlatform(null)
    setConnectionStatus('disconnected')
    setConnectionInfo(null)
    localStorage.removeItem('activePlatform')
    router.push('/platform-select')
  }, [router])

  const disconnect = useCallback(() => {
    setActivePlatform(null)
    setConnectionStatus('disconnected')
    setConnectionInfo(null)
    localStorage.removeItem('activePlatform')
    clearTradingSession()
    router.push('/login')
  }, [router])

  useEffect(() => {
    const saved = localStorage.getItem('activePlatform') as PlatformId | null
    if (saved && AVAILABLE_PLATFORMS.some(p => p.id === saved)) {
      setActivePlatform(saved)
    }
  }, [])

  useEffect(() => {
    if (!activePlatform) return
    void refreshConnection()
    const id = window.setInterval(() => {
      void refreshConnection()
    }, 12000)
    return () => window.clearInterval(id)
  }, [activePlatform, refreshConnection])

  return (
    <PlatformContext.Provider
      value={{
        activePlatform,
        setPlatform,
        platformConfig,
        isPlatformConnected: connectionStatus === 'connected',
        connectionStatus,
        connectionInfo,
        refreshConnection,
        disconnectBroker,
        switchPlatform,
        disconnect,
      }}
    >
      {children}
    </PlatformContext.Provider>
  )
}

export const usePlatform = () => useContext(PlatformContext)
