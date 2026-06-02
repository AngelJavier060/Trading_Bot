import { getPublicApiBaseUrl } from '../services/api';

export const liveApiBase = () => getPublicApiBaseUrl();

/** Misma lógica que en `live.tsx`: orden real en el bróker IQ. */
export function isLiveBrokerOrderSuccess(data: any, responseOk: boolean): boolean {
  if (!responseOk || data?.status !== 'success') return false;
  if (data?.mode === 'simulation' || data?.mode === 'simulation_blocked') return false;
  const brokerId = data?.order_id ?? data?.order?.id;
  if (brokerId == null || brokerId === '') return false;
  const idStr = String(brokerId);
  if (idStr.startsWith('SIM-') || idStr.startsWith('SIM_')) return false;
  return true;
}

export function normalizeIqAccountType(raw?: string | null): 'PRACTICE' | 'REAL' {
  const u = (raw || 'PRACTICE').toUpperCase();
  if (u === 'REAL') return 'REAL';
  return 'PRACTICE';
}

export async function fetchLiveBotStatus() {
  const r = await fetch(`${liveApiBase()}/api/live/status`);
  return r.json();
}

export async function postLiveStart(body: Record<string, unknown>) {
  const r = await fetch(`${liveApiBase()}/api/live/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json() };
}

export async function postLiveStop() {
  const r = await fetch(`${liveApiBase()}/api/live/stop`, { method: 'POST' });
  return { ok: r.ok, data: await r.json() };
}

export async function postTradingOrder(payload: {
  symbol: string;
  direction: 'call' | 'put';
  amount: number;
  expiration: number;
  strategy?: string;
}) {
  const r = await fetch(`${liveApiBase()}/api/trading/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: payload.symbol,
      direction: payload.direction,
      amount: payload.amount,
      expiration: payload.expiration,
      strategy: payload.strategy ?? 'manual_panel',
    }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export async function postLiveScan(body: {
  symbols: string[];
  strategies: string[];
  timeframe?: string;
  platform?: string;
}) {
  const r = await fetch(`${liveApiBase()}/api/live/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: body.symbols,
      strategies: body.strategies,
      timeframe: body.timeframe ?? '5m',
      platform: body.platform ?? 'iqoption',
    }),
  });
  return { ok: r.ok, data: await r.json() };
}

export async function fetchTradingAssets(): Promise<{ names: string[]; source?: string }> {
  try {
    const r = await fetch(`${liveApiBase()}/api/trading/assets`);
    const data = await r.json();
    const activos = data.activos || {};
    let names = Object.keys(activos).filter((k) => activos[k]?.open !== false);
    if (names.length === 0) names = Object.keys(activos);
    names.sort();
    return { names, source: data.source };
  } catch {
    return { names: [] };
  }
}
