/**
 * Custom datafeed for the TradingView Advanced Charts library.
 *
 * Implements the minimum surface area the widget needs (`onReady`,
 * `searchSymbols`, `resolveSymbol`, `getBars`, `subscribeBars`,
 * `unsubscribeBars`) on top of our Flask UDF endpoints in
 * `backend/api/routes/tv_datafeed_routes.py`.
 *
 * The library expects a particular shape for each callback; we mirror those
 * shapes verbatim because the Charting Library is loaded as a non-typed UMD
 * global from `/charting_library/`. We declare the bits we need locally for types.
 */

import { getPublicApiBaseUrl } from '../services/api';

const API_BASE = getPublicApiBaseUrl();
const TV_API = `${API_BASE}/api/tv`;

/**
 * Broker the datafeed should target (set from the dashboard so the backend
 * uses the right `unified_data_service` provider when fetching candles).
 */
let preferredPlatform: 'iqoption' | 'mt5' | 'demo' | undefined;
export function setTvDatafeedPlatform(platform: 'iqoption' | 'mt5' | 'demo' | undefined) {
  preferredPlatform = platform;
}
function platformQuery(): string {
  return preferredPlatform ? `&platform=${preferredPlatform}` : '';
}

export type TvResolution =
  | '1' | '3' | '5' | '15' | '30' | '60' | '120' | '240' | '720' | 'D' | '1D' | 'W' | '1W';

interface TvBar {
  time: number;   // ms (TradingView wants milliseconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface TvSymbolInfo {
  name: string;
  ticker?: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_no_volume: boolean;
  supported_resolutions: TvResolution[];
}

type ResolveCb = (info: TvSymbolInfo) => void;
type ErrorCb = (msg: string) => void;
type HistoryCb = (bars: TvBar[], meta: { noData: boolean }) => void;
type TickCb = (bar: TvBar) => void;

interface PeriodParams {
  from: number;
  to: number;
  countBack?: number;
  firstDataRequest: boolean;
}

interface Subscription {
  symbol: string;
  resolution: TvResolution;
  uid: string;
  lastBarTime: number;
  cb: TickCb;
  intervalId: number;
}

const subscriptions = new Map<string, Subscription>();

/** Translate a TV resolution into the polling period (ms). */
function pollIntervalFor(resolution: TvResolution): number {
  switch (resolution) {
    case '1':
    case '3':
      return 5_000;
    case '5':
    case '15':
      return 10_000;
    case '30':
    case '60':
      return 20_000;
    default:
      return 30_000;
  }
}

async function fetchJSON<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return (await res.json()) as T;
}

export const tvDatafeed = {
  onReady(callback: (config: any) => void) {
    fetchJSON(`${TV_API}/config`)
      .then(cfg => setTimeout(() => callback(cfg), 0))
      .catch(() =>
        setTimeout(
          () => callback({
            supported_resolutions: ['1', '5', '15', '30', '60', '240', 'D'],
            supports_search: true,
            supports_group_request: false,
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
          }),
          0,
        ),
      );
  },

  searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResultReadyCallback: (results: any[]) => void,
  ) {
    const q = encodeURIComponent(userInput || '');
    fetchJSON<any[]>(`${TV_API}/search?query=${q}`)
      .then(results => onResultReadyCallback(results || []))
      .catch(() => onResultReadyCallback([]));
  },

  resolveSymbol(
    symbolName: string,
    onSymbolResolvedCallback: ResolveCb,
    onResolveErrorCallback: ErrorCb,
  ) {
    const q = encodeURIComponent(symbolName);
    fetchJSON<TvSymbolInfo>(`${TV_API}/symbols?symbol=${q}`)
      .then(info => setTimeout(() => onSymbolResolvedCallback(info), 0))
      .catch(err => onResolveErrorCallback(err?.message || 'unknown error'));
  },

  getBars(
    symbolInfo: TvSymbolInfo,
    resolution: TvResolution,
    periodParams: PeriodParams,
    onHistoryCallback: HistoryCb,
    onErrorCallback: ErrorCb,
  ) {
    const params = new URLSearchParams({
      symbol: symbolInfo.name,
      resolution,
      from: String(periodParams.from),
      to: String(periodParams.to),
    });
    if (periodParams.countBack) params.set('countback', String(periodParams.countBack));
    if (preferredPlatform) params.set('platform', preferredPlatform);
    fetchJSON<any>(`${TV_API}/history?${params.toString()}`)
      .then(json => {
        if (json && json.s === 'ok') {
          const bars: TvBar[] = (json.t || []).map((t: number, i: number) => ({
            time: t * 1000,
            open: json.o[i],
            high: json.h[i],
            low: json.l[i],
            close: json.c[i],
            volume: json.v?.[i] ?? 0,
          }));
          onHistoryCallback(bars, { noData: bars.length === 0 });
        } else {
          onHistoryCallback([], { noData: true });
        }
      })
      .catch(err => onErrorCallback(err?.message || 'history fetch failed'));
  },

  subscribeBars(
    symbolInfo: TvSymbolInfo,
    resolution: TvResolution,
    onRealtimeCallback: TickCb,
    listenerGuid: string,
  ) {
    if (subscriptions.has(listenerGuid)) {
      tvDatafeed.unsubscribeBars(listenerGuid);
    }

    const period = pollIntervalFor(resolution);

    const tick = async () => {
      try {
        const sub = subscriptions.get(listenerGuid);
        if (!sub) return;
        const now = Math.floor(Date.now() / 1000);
        const params = new URLSearchParams({
          symbol: symbolInfo.name,
          resolution,
          from: String(now - 600),
          to: String(now),
          countback: '3',
        });
        if (preferredPlatform) params.set('platform', preferredPlatform);
        const json = await fetchJSON<any>(`${TV_API}/history?${params.toString()}`);
        if (!json || json.s !== 'ok' || !Array.isArray(json.t) || json.t.length === 0) return;
        const lastIdx = json.t.length - 1;
        const lastBar: TvBar = {
          time: json.t[lastIdx] * 1000,
          open: json.o[lastIdx],
          high: json.h[lastIdx],
          low: json.l[lastIdx],
          close: json.c[lastIdx],
          volume: json.v?.[lastIdx] ?? 0,
        };
        if (lastBar.time >= sub.lastBarTime) {
          sub.lastBarTime = lastBar.time;
          sub.cb(lastBar);
        }
      } catch {
        /* swallow polling errors */
      }
    };

    const id = window.setInterval(tick, period);
    subscriptions.set(listenerGuid, {
      symbol: symbolInfo.name,
      resolution,
      uid: listenerGuid,
      lastBarTime: 0,
      cb: onRealtimeCallback,
      intervalId: id,
    });
    // Kick off the first poll immediately so the chart updates promptly
    tick();
  },

  unsubscribeBars(listenerGuid: string) {
    const sub = subscriptions.get(listenerGuid);
    if (!sub) return;
    window.clearInterval(sub.intervalId);
    subscriptions.delete(listenerGuid);
  },

  getServerTime(callback: (epochSec: number) => void) {
    fetch(`${TV_API}/time`)
      .then(r => r.text())
      .then(txt => callback(Number(txt) || Math.floor(Date.now() / 1000)))
      .catch(() => callback(Math.floor(Date.now() / 1000)));
  },
};

export default tvDatafeed;
