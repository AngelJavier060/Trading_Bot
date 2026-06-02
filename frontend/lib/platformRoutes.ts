import type { PlatformId } from '../context/PlatformContext'

/**
 * Única entrada de operativa en vivo alineada con el backend:
 * motor `/api/live/*`, órdenes `/api/trading/order`, activos `/api/trading/assets`.
 * Manual y automático se configuran en la pestaña "Trading en vivo" de cada plataforma.
 */
export function getPrimaryTradingHubPath(platform: PlatformId): string {
  return `/${platform}/dashboard`
}

/** Alias de getPrimaryTradingHubPath (misma URL del dashboard de plataforma). */
export function getAdvancedPanelPath(platform: PlatformId): string {
  return getPrimaryTradingHubPath(platform)
}

export function getAutoConnectSettingsPath(): string {
  return '/auto-connect'
}
