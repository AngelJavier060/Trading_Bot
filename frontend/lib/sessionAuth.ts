/** Clave de sesión del demo de login (admin / 1234). */
export const TRADING_SESSION_KEY = 'trading_auth'

export function isTradingSessionActive(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(TRADING_SESSION_KEY) === '1'
}

export function setTradingSessionActive(): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(TRADING_SESSION_KEY, '1')
}

export function clearTradingSession(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(TRADING_SESSION_KEY)
}

const VALID_PLATFORMS = ['iqoption', 'mt5', 'mt4'] as const

export function getSavedPlatformPath(): string | null {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem('activePlatform')
  if (saved && VALID_PLATFORMS.includes(saved as (typeof VALID_PLATFORMS)[number])) {
    return `/${saved}/dashboard`
  }
  return null
}
