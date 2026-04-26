import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { 
  Activity, Settings, TrendingUp, BarChart3, Bot, Bell, Clock, 
  AlertTriangle, Play, Pause, DollarSign, TrendingDown, Eye, Zap,
  RefreshCw, X, Check, ChevronDown, Shield, Calendar, Wifi, WifiOff,
  Sun, Moon, Globe, Coins, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LightweightProChart from '../charts/LightweightProChart';
import TradingViewProChart from '../charts/TradingViewProChart';
import { setTvDatafeedPlatform } from '../../utils/tvDatafeed';
import ConnectionModal from './ConnectionModal';
import TradingAssistant from '../assistant/TradingAssistant';
import { useTheme } from '../../context/ThemeContext';
import { computeSessionBands } from '../../utils/sessionBands';
import { getMarketSessions, RECOMMENDED_TIMEFRAME, type MarketSessionStatus } from '../../utils/marketSessions';

// IQ Option available assets by market type
const IQ_OPTION_ASSETS = {
  binary: [
    { symbol: 'EURUSD',  name: 'EUR/USD',  type: 'forex' },
    { symbol: 'GBPUSD',  name: 'GBP/USD',  type: 'forex' },
    { symbol: 'USDJPY',  name: 'USD/JPY',  type: 'forex' },
    { symbol: 'AUDUSD',  name: 'AUD/USD',  type: 'forex' },
    { symbol: 'EURJPY',  name: 'EUR/JPY',  type: 'forex' },
    { symbol: 'GBPJPY',  name: 'GBP/JPY',  type: 'forex' },
    { symbol: 'USDCHF',  name: 'USD/CHF',  type: 'forex' },
    { symbol: 'EURGBP',  name: 'EUR/GBP',  type: 'forex' },
    { symbol: 'USDCAD',  name: 'USD/CAD',  type: 'forex' },
    { symbol: 'NZDUSD',  name: 'NZD/USD',  type: 'forex' },
    { symbol: 'EURCHF',  name: 'EUR/CHF',  type: 'forex' },
    { symbol: 'AUDCAD',  name: 'AUD/CAD',  type: 'forex' },
    { symbol: 'CADJPY',  name: 'CAD/JPY',  type: 'forex' },
    { symbol: 'CHFJPY',  name: 'CHF/JPY',  type: 'forex' },
    { symbol: 'GBPCAD',  name: 'GBP/CAD',  type: 'forex' },
    { symbol: 'GBPAUD',  name: 'GBP/AUD',  type: 'forex' },
    { symbol: 'AUDNZD',  name: 'AUD/NZD',  type: 'forex' },
    { symbol: 'EURCAD',  name: 'EUR/CAD',  type: 'forex' },
  ],
  otc: [
    { symbol: 'EURUSD-OTC',  name: 'EUR/USD OTC',  type: 'otc' },
    { symbol: 'GBPUSD-OTC',  name: 'GBP/USD OTC',  type: 'otc' },
    { symbol: 'USDJPY-OTC',  name: 'USD/JPY OTC',  type: 'otc' },
    { symbol: 'AUDUSD-OTC',  name: 'AUD/USD OTC',  type: 'otc' },
    { symbol: 'EURJPY-OTC',  name: 'EUR/JPY OTC',  type: 'otc' },
    { symbol: 'GBPJPY-OTC',  name: 'GBP/JPY OTC',  type: 'otc' },
    { symbol: 'NZDUSD-OTC',  name: 'NZD/USD OTC',  type: 'otc' },
    { symbol: 'EURGBP-OTC',  name: 'EUR/GBP OTC',  type: 'otc' },
    { symbol: 'USDCAD-OTC',  name: 'USD/CAD OTC',  type: 'otc' },
    { symbol: 'USDCHF-OTC',  name: 'USD/CHF OTC',  type: 'otc' },
    { symbol: 'CADJPY-OTC',  name: 'CAD/JPY OTC',  type: 'otc' },
    { symbol: 'CHFJPY-OTC',  name: 'CHF/JPY OTC',  type: 'otc' },
    { symbol: 'EURCHF-OTC',  name: 'EUR/CHF OTC',  type: 'otc' },
    { symbol: 'GBPAUD-OTC',  name: 'GBP/AUD OTC',  type: 'otc' },
  ]
};

const MT5_ASSETS = [
  // Forex
  { symbol: 'EURUSD',  name: 'EUR/USD',    type: 'forex'     },
  { symbol: 'GBPUSD',  name: 'GBP/USD',    type: 'forex'     },
  { symbol: 'USDJPY',  name: 'USD/JPY',    type: 'forex'     },
  { symbol: 'AUDUSD',  name: 'AUD/USD',    type: 'forex'     },
  { symbol: 'USDCAD',  name: 'USD/CAD',    type: 'forex'     },
  { symbol: 'USDCHF',  name: 'USD/CHF',    type: 'forex'     },
  { symbol: 'NZDUSD',  name: 'NZD/USD',    type: 'forex'     },
  { symbol: 'EURJPY',  name: 'EUR/JPY',    type: 'forex'     },
  { symbol: 'GBPJPY',  name: 'GBP/JPY',    type: 'forex'     },
  { symbol: 'EURGBP',  name: 'EUR/GBP',    type: 'forex'     },
  // Commodities
  { symbol: 'XAUUSD',  name: 'Gold',       type: 'commodity' },
  { symbol: 'XAGUSD',  name: 'Silver',     type: 'commodity' },
  { symbol: 'USOIL',   name: 'WTI Crude',  type: 'commodity' },
  { symbol: 'UKOIL',   name: 'Brent Crude',type: 'commodity' },
  // Indices
  { symbol: 'US30',    name: 'Dow Jones',  type: 'index'     },
  { symbol: 'NAS100',  name: 'NASDAQ',     type: 'index'     },
  { symbol: 'SPX500',  name: 'S&P 500',    type: 'index'     },
  { symbol: 'GER30',   name: 'DAX 30',     type: 'index'     },
  { symbol: 'UK100',   name: 'FTSE 100',   type: 'index'     },
  // Crypto
  { symbol: 'BTCUSD',  name: 'Bitcoin',    type: 'crypto'    },
  { symbol: 'ETHUSD',  name: 'Ethereum',   type: 'crypto'    },
  { symbol: 'LTCUSD',  name: 'Litecoin',   type: 'crypto'    },
  { symbol: 'XRPUSD',  name: 'XRP',        type: 'crypto'    },
];

// Types
interface AccountInfo {
  balance: number;
  currency: string;
  account_type: string;
}

interface Signal {
  symbol: string;
  direction: 'call' | 'put';
  confidence: number;
  strategy: string;
  entry_price?: number;
  expiration?: number;
  reasons?: string[];
  indicators?: Record<string, any>;
}

interface Trade {
  id: string;
  symbol: string;
  direction: string;
  amount: number;
  result?: 'win' | 'loss' | 'pending';
  pnl?: number;
  entry_price?: number;
  exit_price?: number;
  platform?: string;
  strategy_used?: string;
  timestamp: string;
  expiration_time?: string; // ISO timestamp when trade expires
  expiration_minutes?: number; // Expiration duration in minutes
}

/** Unifica resultado para la UI (API puede devolver pending aunque ya haya PnL). */
function normalizeTradeResult(t: Pick<Trade, 'result' | 'pnl'>): 'win' | 'loss' | 'pending' {
  const r = (t.result || '').toString().toLowerCase();
  if (r === 'win') return 'win';
  if (r === 'loss') return 'loss';
  if (typeof t.pnl === 'number' && t.pnl !== 0) {
    return t.pnl > 0 ? 'win' : 'loss';
  }
  return 'pending';
}

// Countdown Timer Component for active trades - client-only to avoid hydration mismatch
const CountdownTimer: React.FC<{ expirationTime?: string; expirationMinutes?: number; timestamp: string }> = ({ 
  expirationTime, expirationMinutes, timestamp 
}) => {
  const [mounted, setMounted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    let endTime: number;
    if (expirationTime) {
      endTime = new Date(expirationTime).getTime();
    } else if (expirationMinutes && timestamp) {
      endTime = new Date(timestamp).getTime() + (expirationMinutes * 60 * 1000);
    } else {
      // Default 5 minutes from timestamp
      endTime = new Date(timestamp).getTime() + (5 * 60 * 1000);
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expirationTime, expirationMinutes, timestamp, mounted]);

  // Show placeholder on server render to avoid hydration mismatch
  if (!mounted) return <span className="text-xs text-slate-400">--:--</span>;
  if (timeLeft <= 0) return <span className="text-xs text-slate-400">Finalizando...</span>;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <span className={`text-xs font-mono ${timeLeft <= 30 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
      ⏱ {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  );
};

interface LiveStatus {
  is_running: boolean;
  is_scanning: boolean;
  mode: string;
  platform: string;
  account_type: string;
  balance: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  current_symbol: string;
  active_trades: Trade[];
  last_signal?: any;
  last_trade?: any;
  errors: string[];
  started_at?: string;
  uptime_seconds: number;
}

interface BacktestMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  total_return: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  profit_factor: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  expectancy: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  best_day_pnl: number;
  worst_day_pnl: number;
  trades_per_day: number;
  avg_win: number;
  avg_loss: number;
  recovery_factor: number;
}

interface BacktestTrade {
  id?: number;
  asset?: string;
  symbol?: string;
  timestamp?: string | number;
  direction?: 'call' | 'put' | 'buy' | 'sell';
  entry_price?: number;
  exit_price?: number;
  amount?: number;
  pnl?: number;
  result?: 'win' | 'loss' | 'tie';
}

interface BacktestResult {
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equity_curve: Array<{ balance: number; timestamp?: string | number }>;
  daily_pnl?: Array<{ date: string; pnl: number }>;
  monthly_pnl?: Array<{ month: string; pnl: number }>;
  start_balance: number;
  end_balance: number;
  execution_time_seconds?: number;
  data_info?: {
    source?: string;
    assets?: string[];
    candles_per_asset?: Record<string, number>;
    timeframe?: string;
    days_back?: number;
  };
}

// ── Per-strategy parameter definitions ─────────────────────────────────────
type ParamDef = { key: string; label: string; min?: number; max?: number; step?: number; defVal: number };

const IQ_STRATEGY_PARAMS: Record<string, ParamDef[]> = {
  'EMA + RSI': [
    { key: 'emaFast',      label: 'EMA Rápida',       min: 2,  max: 50,  defVal: 9  },
    { key: 'emaSlow',      label: 'EMA Lenta',        min: 5,  max: 200, defVal: 21 },
    { key: 'rsiPeriod',    label: 'RSI Período',      min: 2,  max: 50,  defVal: 14 },
    { key: 'rsiOverbought',label: 'RSI Sobrecompra',  min: 50, max: 90,  defVal: 70 },
    { key: 'rsiOversold',  label: 'RSI Sobreventa',   min: 10, max: 50,  defVal: 30 },
    { key: 'minConfidence',label: 'Confianza Mín (%)',min: 60, max: 95,  defVal: 68 },
  ],
  'MACD': [
    { key: 'macdFast',     label: 'MACD Rápido',      min: 5,  max: 50,  defVal: 12 },
    { key: 'macdSlow',     label: 'MACD Lento',       min: 10, max: 200, defVal: 26 },
    { key: 'macdSignal',   label: 'Señal',            min: 3,  max: 50,  defVal: 9  },
    { key: 'minConfidence',label: 'Confianza Mín (%)',min: 60, max: 95,  defVal: 68 },
  ],
  'Bollinger Bands': [
    { key: 'bbPeriod',     label: 'BB Período',       min: 5,  max: 100, defVal: 20 },
    { key: 'bbStd',        label: 'Desv. Estándar',   min: 1,  max: 5,   step: 0.1, defVal: 2 },
    { key: 'minConfidence',label: 'Confianza Mín (%)',min: 60, max: 95,  defVal: 68 },
  ],
  'RSI Divergence': [
    { key: 'rsiPeriod',    label: 'RSI Período',      min: 2,  max: 50,  defVal: 14 },
    { key: 'rsiOverbought',label: 'RSI Sobrecompra',  min: 50, max: 90,  defVal: 70 },
    { key: 'rsiOversold',  label: 'RSI Sobreventa',   min: 10, max: 50,  defVal: 30 },
    { key: 'rsiDivLookback',label: 'Lookback (velas)',min: 20, max: 200, defVal: 80 },
    { key: 'minConfidence',label: 'Confianza Mín (%)',min: 60, max: 95,  defVal: 68 },
  ],
};

const MT5_STRATEGY_PARAMS: Record<string, ParamDef[]> = {
  'Ichimoku Cloud': [
    { key: 'ichimokuTenkan', label: 'Tenkan Sen',       min: 5,  max: 50,  defVal: 9  },
    { key: 'ichimokuKijun',  label: 'Kijun Sen',        min: 10, max: 100, defVal: 26 },
    { key: 'ichimokuSenkou', label: 'Senkou Span B',    min: 20, max: 100, defVal: 52 },
    { key: 'minConfidence',  label: 'Confianza Mín (%)',min: 60, max: 95,  defVal: 68 },
  ],
  'Swing Trading': [
    { key: 'mt5LotSize',   label: 'Lot Size',           min: 0.01, max: 10,  step: 0.01, defVal: 0.1 },
    { key: 'mt5StopLoss',  label: 'Stop Loss (pips)',   min: 5,    max: 500, defVal: 50  },
    { key: 'mt5TakeProfit',label: 'Take Profit (pips)', min: 5,    max: 500, defVal: 100 },
    { key: 'minConfidence',label: 'Confianza Mín (%)',  min: 60,   max: 95,  defVal: 68  },
  ],
  'Grid Trading': [
    { key: 'mt5LotSize',   label: 'Lot Size',           min: 0.01, max: 10,  step: 0.01, defVal: 0.1 },
    { key: 'mt5MaxSpread', label: 'Max Spread (pips)',  min: 1,    max: 50,  defVal: 3   },
    { key: 'gridSpacing',  label: 'Grid Spacing (pips)',min: 5,    max: 200, defVal: 30  },
    { key: 'gridLevels',   label: 'Niveles de Grid',    min: 2,    max: 20,  defVal: 5   },
  ],
  'Trend Following': [
    { key: 'mt5LotSize',   label: 'Lot Size',           min: 0.01, max: 10,  step: 0.01, defVal: 0.1 },
    { key: 'mt5StopLoss',  label: 'Stop Loss (pips)',   min: 5,    max: 500, defVal: 50  },
    { key: 'mt5TakeProfit',label: 'Take Profit (pips)', min: 5,    max: 500, defVal: 150 },
    { key: 'trendAdxPeriod',label: 'ADX Período',       min: 5,    max: 50,  defVal: 14  },
    { key: 'trendAdxMin',  label: 'ADX Mínimo',         min: 15,   max: 50,  defVal: 25  },
  ],
};

/**
 * Tarjeta de Sesiones de Mercado Internacional
 * Calcula automáticamente el estado abierto/cerrado en hora Ecuador (UTC-5)
 * y permite al usuario activar/desactivar la operativa por sesión.
 */
const MarketSessionsCard: React.FC<{
  activeSessions: string[];
  onToggleSession: (name: string) => void;
}> = ({ activeSessions, onToggleSession }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  const sessions: MarketSessionStatus[] = useMemo(() => getMarketSessions(null, now), [now]);
  return (
    <section className="bg-white p-8 rounded-2xl border border-[#c4c6d0]/30 shadow-sm overflow-hidden relative">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <span className="material-symbols-outlined" style={{ fontSize: '96px' }}>language</span>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold flex items-center text-[#191c1e]">
          <span className="material-symbols-outlined mr-2 text-[#3f5c8c]">public</span>
          Sesiones de Mercado Internacional
        </h3>
        <span className="text-[11px] text-slate-500">Hora local: Ecuador (UTC-5)</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {sessions.map(s => {
          const enabled = activeSessions.length === 0 || activeSessions.includes(s.name);
          return (
            <div key={s.name}
              onClick={() => onToggleSession(s.name)}
              className={`p-5 rounded-xl border relative overflow-hidden cursor-pointer transition-all ${
                !enabled ? 'border-slate-200 bg-slate-50/50 grayscale opacity-50' :
                s.open ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60' :
                         'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              title={enabled ? 'Click para desactivar esta sesión' : 'Click para activar esta sesión'}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                    <span className={`material-symbols-outlined ${s.open && enabled ? 'text-[#3f5c8c]' : 'text-slate-400'}`}>{s.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#191c1e]">{s.name}</h4>
                    <p className="text-[10px] text-slate-500 uppercase font-medium">{s.tz}</p>
                  </div>
                </div>
                {!enabled
                  ? <div className="px-2 py-1 bg-slate-300 rounded text-[9px] text-white font-black uppercase">Off</div>
                  : s.open
                    ? <div className="flex items-center space-x-1 px-2 py-1 bg-emerald-500 rounded text-[9px] text-white font-black uppercase"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /><span>Abierto</span></div>
                    : <div className="px-2 py-1 bg-slate-400 rounded text-[9px] text-white font-black uppercase">Cerrado</div>
                }
              </div>
              <p className="text-base font-medium text-[#191c1e] mb-2">{s.hours}</p>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                {s.open && enabled && <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.pct}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-4">
        El bot opera automáticamente solo durante las sesiones activas. Click en una tarjeta para activar/desactivar.
      </p>
    </section>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// UpcomingNewsPanel — lista scrollable de noticias económicas más impactantes.
// Reemplaza el viejo "Próximo evento: Cargando..." mostrando 5 eventos por
// defecto con scroll para ver más, en hora local de Ecuador.
// ──────────────────────────────────────────────────────────────────────────
type NewsItem = {
  title: string;
  country: string;
  impact: 'high' | 'medium' | 'low' | string;
  utc_iso: string;
  ecuador_iso: string;
  description: string;
};

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', UK: '🇬🇧', JP: '🇯🇵', CH: '🇨🇭', CA: '🇨🇦', AU: '🇦🇺', NZ: '🇳🇿',
};

const formatRelativeFromNow = (iso: string): string => {
  try {
    const target = new Date(iso).getTime();
    const now = Date.now();
    let diff = Math.round((target - now) / 60000);
    const past = diff < 0;
    diff = Math.abs(diff);
    if (diff < 60) return past ? `hace ${diff} min` : `en ${diff} min`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    if (h < 24) return past ? `hace ${h}h ${m}m` : `en ${h}h ${m}m`;
    const d = Math.floor(h / 24);
    return past ? `hace ${d} día${d === 1 ? '' : 's'}` : `en ${d} día${d === 1 ? '' : 's'}`;
  } catch { return ''; }
};

const formatEcuadorDateTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dia} ${mes} · ${hh}:${mm}`;
  } catch { return iso; }
};

const UpcomingNewsPanel: React.FC<{
  pauseEnabled: boolean;
  onTogglePause: (v: boolean) => void;
  filter?: 'all' | 'high';
}> = ({ pauseEnabled, onTogglePause, filter = 'all' }) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [source, setSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'high'>(filter);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getUpcomingNews(activeFilter === 'high' ? 8 : 12,
        activeFilter === 'high' ? 'high' : undefined);
      setItems((res?.items || []) as NewsItem[]);
      setSource((res?.source as string) || '');
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Error cargando noticias');
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    const id = setInterval(() => { if (alive) load(); }, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshNewsCache().catch(() => {});
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const impactBadge = (impact: string) => {
    if (impact === 'high') return { cls: 'bg-red-100 text-red-700 border-red-200', label: 'Alto' };
    if (impact === 'medium') return { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Medio' };
    return { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Bajo' };
  };

  const sourceLabel = source === 'tradingview' ? 'TradingView · LIVE'
    : source === 'forexfactory' ? 'ForexFactory · LIVE'
    : source === 'calendar-heuristic' ? 'Calendario interno (offline)'
    : 'Sin datos';
  const sourceCls = source === 'tradingview' || source === 'forexfactory'
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-[#191c1e]">
          <span className="material-symbols-outlined text-rose-500">campaign</span>
          Noticias Económicas Más Impactantes
        </h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[11px] px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
          title="Refrescar feed"
        >
          <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sourceCls}`}>
            {sourceLabel}
          </span>
          <span className="text-[10px] text-slate-500">· Hora Ecuador (UTC-5)</span>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px]">
          <button onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 ${activeFilter === 'all' ? 'bg-[#3f5c8c] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            Todas
          </button>
          <button onClick={() => setActiveFilter('high')}
            className={`px-2.5 py-1 border-l border-slate-200 ${activeFilter === 'high' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            Alto impacto
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm mb-3">
        <input
          type="checkbox"
          checked={pauseEnabled}
          onChange={e => onTogglePause(e.target.checked)}
          className="w-4 h-4 accent-[#3f5c8c] rounded"
        />
        Pausar bot ante noticias de alto impacto
      </label>

      {loading && (
        <div className="text-xs text-slate-500 py-4 text-center">Cargando próximos eventos…</div>
      )}
      {error && !loading && (
        <div className="text-xs text-rose-600 py-3 text-center">{error}</div>
      )}

      {!loading && !error && (
        <div className="max-h-72 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
          {items.length === 0 && (
            <div className="text-xs text-slate-500 py-4 text-center">Sin eventos próximos relevantes.</div>
          )}
          {items.map((it, idx) => {
            const badge = impactBadge(it.impact);
            const flag = COUNTRY_FLAG[it.country] || '🌐';
            return (
              <div key={`${it.utc_iso}-${idx}`}
                className={`group rounded-lg border p-3 transition-all hover:shadow-sm ${
                  it.impact === 'high'
                    ? 'border-red-200/70 bg-gradient-to-r from-red-50/50 to-white'
                    : it.impact === 'medium'
                      ? 'border-amber-200/70 bg-gradient-to-r from-amber-50/40 to-white'
                      : 'border-slate-200 bg-white'
                }`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg leading-none">{flag}</span>
                    <span className="text-sm font-semibold text-[#191c1e] truncate">{it.title}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug mb-1.5">{it.description}</p>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-700 font-medium">{formatEcuadorDateTime(it.ecuador_iso)}</span>
                  <span className="text-slate-500">{formatRelativeFromNow(it.utc_iso)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-3">
        {source === 'tradingview' && 'Datos en vivo del calendario económico de TradingView (cacheado 1 h).'}
        {source === 'forexfactory' && 'Datos en vivo del calendario económico de ForexFactory (FairEconomy).'}
        {source === 'calendar-heuristic' && 'Calendario interno offline — eventos recurrentes proyectados.'}
        {!source && 'Esperando datos del feed…'}
      </p>
    </div>
  );
};

// Configuration Tab Component
const ConfigurationTab: React.FC<{
  iqConnected: boolean;
  mt5Connected: boolean;
  iqBalance: number;
  mt5Balance: number;
  onConnectIQ: () => void;
  onConnectMT5: () => void;
  config: any;
  onConfigChange: (config: any) => void;
  onSaveConfig: () => void;
  configPlatform: 'iqoption' | 'mt5';
  onConfigPlatformChange: (p: 'iqoption' | 'mt5') => void;
}> = ({ 
  iqConnected, mt5Connected, iqBalance, mt5Balance,
  onConnectIQ, onConnectMT5, config, onConfigChange, onSaveConfig,
  configPlatform, onConfigPlatformChange
}) => {
  const [expandedIQStrategy, setExpandedIQStrategy] = useState<string | null>(null);
  const [expandedMT5Strategy, setExpandedMT5Strategy] = useState<string | null>(null);

  const getIQAssets = () => {
    return config.iqMarketType === 'otc' ? IQ_OPTION_ASSETS.otc : IQ_OPTION_ASSETS.binary;
  };

  const toggleIQParam = (strategy: string) =>
    setExpandedIQStrategy(prev => (prev === strategy ? null : strategy));

  const toggleMT5Param = (strategy: string) =>
    setExpandedMT5Strategy(prev => (prev === strategy ? null : strategy));

  const hasCustomParams = (strategy: string, paramMap: Record<string, ParamDef[]>) =>
    (paramMap[strategy] || []).some(p => config[p.key] != null && config[p.key] !== p.defVal);

  const renderParamPanel = (
    strategy: string,
    paramMap: Record<string, ParamDef[]>,
    onClose: () => void,
    accentClass: string
  ) => {
    const params = paramMap[strategy] || [];
    return (
      <div className="mt-2 ml-6 rounded-lg border border-[#c4c6d0]/40 bg-[#f7f9fb] shadow-sm p-3">
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center justify-between text-[#3F5C8C]">
          <span>⚙️ Parámetros: {strategy}</span>
          <span className="text-[#4e6073] font-normal normal-case">Los cambios se aplican al guardar</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {params.map(p => {
            const isMinConf = p.key === 'minConfidence';
            return (
              <div key={p.key} className={isMinConf ? 'col-span-2' : ''}>
                <label className="text-xs text-[#4e6073] block mb-1">{p.label}</label>
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step ?? 1}
                  value={config[p.key] ?? p.defVal}
                  onChange={e => {
                    let val = p.step ? parseFloat(e.target.value) : parseInt(e.target.value);
                    if (Number.isNaN(val)) val = p.defVal as number;
                    val = Math.max(p.min, Math.min(p.max, val));
                    onConfigChange({ ...config, [p.key]: val });
                  }}
                  className="w-full bg-white border border-[#c4c6d0] rounded px-2 py-1 text-xs text-[#191c1e]"
                />
                {isMinConf && (
                  <p className="text-[10px] text-[#3F5C8C] mt-1 leading-tight">
                    Mayor valor = menos operaciones pero de mayor calidad. Recomendado: 68%. Rango permitido: 60-95.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="mt-3 w-full py-1.5 rounded text-xs font-semibold bg-[#3F5C8C] hover:bg-[#2d4a78] text-white"
        >
          ✓ Listo — cerrar parámetros
        </button>
      </div>
    );
  };

  const tabBtn = (id: 'iqoption' | 'mt5', label: string, dotColor: string, connected?: boolean) => (
    <button
      onClick={() => onConfigPlatformChange(id)}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
        configPlatform === id
          ? id === 'iqoption' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
          : id === 'mt5'      ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                              : 'bg-[#3F5C8C] text-white shadow-sm'
          : 'text-[#4e6073] hover:text-[#191c1e] hover:bg-white'
      }`}
    >
      {connected !== undefined && (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
      )}
      {label}
    </button>
  );

  const inputCls = "w-full bg-[#f2f4f6] border border-[#c4c6d0] rounded-lg px-3 py-2 text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#3F5C8C] focus:border-transparent";
  const cardCls  = "bg-white rounded-xl p-6 border border-[#c4c6d0]/30 shadow-sm";

  return (
    <div className="space-y-5">
      {/* ── Platform Tab Selector ── */}
      <div className="flex gap-2 bg-[#f2f4f6] rounded-xl p-1.5 border border-[#c4c6d0]/30">
        {tabBtn('iqoption', '💙 IQ Option',       'bg-blue-400',   iqConnected)}
        {tabBtn('mt5',      '💜 MetaTrader 5',    'bg-purple-400', mt5Connected)}
      </div>

      {/* ═══════════════════════════════════════
          IQ OPTION TAB
      ═══════════════════════════════════════ */}
      {configPlatform === 'iqoption' && (
        <div className="space-y-8">
          {/* Page Header */}
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-semibold text-[#191c1e]">Configuración IQ Option</h2>
              <p className="text-sm text-[#747780] mt-1">Ajusta los parámetros operativos y estrategias de ejecución automática.</p>
            </div>
            <button onClick={onSaveConfig}
              className="px-6 py-2.5 bg-[#3f5c8c] text-white rounded-full font-bold text-sm shadow-lg shadow-[#3f5c8c]/20 hover:-translate-y-0.5 transition-all active:scale-95">
              Guardar Configuración
            </button>
          </div>

          {/* Connection + Market Type row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white p-5 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${iqConnected ? 'bg-emerald-500 shadow-emerald-400/50 shadow-md' : 'bg-red-500'}`} />
                <div>
                  <p className="font-semibold text-[#191c1e]">IQ Option</p>
                  <p className="text-xs text-[#4e6073]">Opciones Binarias &amp; OTC</p>
                  {iqConnected && <p className="text-sm text-emerald-600 font-semibold mt-0.5">Balance: ${iqBalance.toFixed(2)}</p>}
                </div>
              </div>
              {!iqConnected ? (
                <button onClick={onConnectIQ}
                  className="px-6 py-2 bg-[#3f5c8c] hover:bg-[#2d4a78] rounded-full text-sm font-semibold transition-colors text-white">
                  Conectar
                </button>
              ) : (
                <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-100">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Connected
                </span>
              )}
            </div>
            <div className="bg-white p-5 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
              <h3 className="text-xs font-semibold mb-3 flex items-center gap-2 text-[#3f5c8c] uppercase tracking-wider">
                <span className="material-symbols-outlined text-base">language</span> Tipo de Mercado
              </h3>
              <div className="flex gap-3 mb-2">
                <button onClick={() => onConfigChange({ ...config, iqMarketType: 'binary' })}
                  className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${config.iqMarketType !== 'otc' ? 'bg-[#3f5c8c] text-white shadow-sm' : 'bg-[#f2f4f6] text-[#4e6073] hover:bg-[#eceef0]'}`}>
                  Binarias
                </button>
                <button onClick={() => onConfigChange({ ...config, iqMarketType: 'otc' })}
                  className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${config.iqMarketType === 'otc' ? 'bg-[#7c3aed] text-white shadow-sm' : 'bg-[#f2f4f6] text-[#4e6073] hover:bg-[#eceef0]'}`}>
                  OTC
                </button>
              </div>
              <p className="text-xs text-[#747780]">
                {config.iqMarketType === 'otc' ? '⚠️ OTC: 24/7, mayor volatilidad' : '✓ Binarias: horario de mercado estándar'}
              </p>
            </div>
          </div>

          {/* 4 Bento Param Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_20px_40px_rgba(112,141,192,0.05)] flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-[#3f5c8c]/10 flex items-center justify-center text-[#3f5c8c]">
                  <span className="material-symbols-outlined">payments</span>
                </div>
                <span className="text-xs font-semibold text-[#747780] uppercase tracking-wider">Monto ($)</span>
              </div>
              <input type="number" min="1" step="1" value={config.betAmount || 10}
                onChange={e => onConfigChange({ ...config, betAmount: parseFloat(e.target.value) })}
                className="bg-[#f2f4f6] border-none rounded-lg p-3 text-lg font-medium text-[#191c1e] w-full outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              <p className="text-[10px] text-slate-400 italic">Inversión por operación</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_20px_40px_rgba(112,141,192,0.05)] flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-[#3f5c8c]/10 flex items-center justify-center text-[#3f5c8c]">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <span className="text-xs font-semibold text-[#747780] uppercase tracking-wider">Expiración</span>
              </div>
              <select value={config.expiration || 5}
                onChange={e => onConfigChange({ ...config, expiration: parseInt(e.target.value) })}
                className="bg-[#f2f4f6] border-none rounded-lg p-3 text-base font-medium text-[#191c1e] w-full outline-none focus:ring-2 focus:ring-[#3f5c8c]/20">
                <option value="1">1 Minuto</option>
                <option value="5">5 Minutos</option>
                <option value="15">15 Minutos</option>
                <option value="30">30 Minutos</option>
                <option value="60">1 Hora</option>
              </select>
              <p className="text-[10px] text-slate-400 italic">Tiempo de cierre</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_20px_40px_rgba(112,141,192,0.05)] border-b-4 border-b-emerald-400 flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <span className="material-symbols-outlined">trending_up</span>
                </div>
                <span className="text-xs font-semibold text-[#747780] uppercase tracking-wider">Take Profit (%)</span>
              </div>
              <input type="number" min="1" max="100" value={config.takeProfit || 80}
                onChange={e => onConfigChange({ ...config, takeProfit: parseFloat(e.target.value) })}
                className="bg-[#f2f4f6] border-none rounded-lg p-3 text-lg font-medium text-[#191c1e] w-full outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              <p className="text-[10px] text-slate-400 italic">Meta diaria de ganancia</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_20px_40px_rgba(112,141,192,0.05)] border-b-4 border-b-red-400 flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                  <span className="material-symbols-outlined">trending_down</span>
                </div>
                <span className="text-xs font-semibold text-[#747780] uppercase tracking-wider">Stop Loss (%)</span>
              </div>
              <input type="number" min="1" max="100" value={config.stopLoss || 100}
                onChange={e => onConfigChange({ ...config, stopLoss: parseFloat(e.target.value) })}
                className="bg-[#f2f4f6] border-none rounded-lg p-3 text-lg font-medium text-[#191c1e] w-full outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              <p className="text-[10px] text-slate-400 italic">Máximo riesgo diario</p>
            </div>
          </div>

          {/* Risk Management + Schedules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[#191c1e]">
                <span className="material-symbols-outlined text-orange-500">shield</span>
                Gestión de Riesgo
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[#4e6073] font-medium block mb-2">Riesgo por Trade (%)</label>
                  <input type="range" min="1" max="5"
                    value={config.iqRiskPerTrade || 2}
                    onChange={e => onConfigChange({ ...config, iqRiskPerTrade: parseInt(e.target.value) })}
                    className="w-full accent-[#3f5c8c]" />
                  <div className="flex justify-between text-xs text-[#4e6073] mt-1">
                    <span>1%</span>
                    <span className="text-[#3f5c8c] font-bold">{config.iqRiskPerTrade || 2}%</span>
                    <span>5%</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#4e6073] font-medium block mb-2">Trades Simultáneos</label>
                  <input type="number" value={config.iqMaxConcurrentTrades || 3}
                    onChange={e => onConfigChange({ ...config, iqMaxConcurrentTrades: parseInt(e.target.value) })}
                    className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
                </div>
                <div>
                  <label className="text-sm text-[#4e6073] font-medium block mb-2">Máximo Trades Diarios</label>
                  <input type="number" value={config.iqMaxDailyTrades || 50}
                    onChange={e => onConfigChange({ ...config, iqMaxDailyTrades: parseInt(e.target.value) })}
                    className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={config.iqAutoStopLoss !== false}
                    onChange={e => onConfigChange({ ...config, iqAutoStopLoss: e.target.checked })}
                    className="w-4 h-4 accent-[#3f5c8c] rounded" />
                  Stop Loss Automático
                </label>
              </div>
            </div>
            <UpcomingNewsPanel
              pauseEnabled={config.iqPauseOnNews !== false}
              onTogglePause={v => onConfigChange({ ...config, iqPauseOnNews: v })}
            />
          </div>

          {/* Strategies & Assets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-2xl border border-[#c4c6d0]/30 shadow-sm">
              <h3 className="text-xl font-semibold mb-6 flex items-center text-[#191c1e]">
                <span className="material-symbols-outlined mr-2 text-[#3f5c8c]">psychology</span>
                Estrategias Activas
              </h3>
              <div className="space-y-3">
                {([
                  { name: 'EMA + RSI',       desc: 'Tendencia con confirmación de sobreventa/sobrecompra',    badge: 'Low Risk', badgeCls: 'bg-[#3f5c8c] text-white' },
                  { name: 'MACD',            desc: 'Cruce de medias rápidas para scalping de 1 min',          badge: null,        badgeCls: '' },
                  { name: 'Bollinger Bands', desc: 'Operativa en volatilidad extrema y ruptura de bandas',    badge: 'Volatile',  badgeCls: 'bg-amber-500 text-white' },
                  { name: 'RSI Divergence',  desc: 'Divergencias de RSI para reversiones de precio',          badge: null,        badgeCls: '' },
                ] as Array<{ name: string; desc: string; badge: string | null; badgeCls: string }>).map(({ name, desc, badge, badgeCls }) => {
                  const isChecked = config.iqStrategies?.includes(name) || false;
                  const isExpanded = expandedIQStrategy === name;
                  const recTf = RECOMMENDED_TIMEFRAME[name];
                  const isOTC = config.iqMarketType === 'otc';
                  const isIchimoku = name === 'Ichimoku Cloud';
                  const blockedOTC = isIchimoku && isOTC;
                  return (
                    <div key={name}>
                      <div className={`flex items-center p-4 rounded-xl border transition-colors ${
                        blockedOTC ? 'border-amber-300/40 bg-amber-50/40 opacity-80' :
                        isChecked ? 'border-[#3f5c8c]/20 bg-[#3f5c8c]/5 hover:bg-[#3f5c8c]/10' :
                                    'border-[#c4c6d0]/30 hover:border-[#3f5c8c]/40 cursor-pointer'
                      }`}
                        onClick={(e) => {
                          // Toggle del panel al click en la fila (excepto sobre el checkbox / settings)
                          const tag = (e.target as HTMLElement).tagName.toLowerCase();
                          if (tag === 'input' || tag === 'button' || tag === 'span') return;
                          if (isChecked) toggleIQParam(name);
                        }}
                      >
                        <input type="checkbox" checked={isChecked}
                          disabled={blockedOTC}
                          onChange={e => {
                            const cur = config.iqStrategies || [];
                            const upd = e.target.checked ? [...cur, name] : cur.filter((s: string) => s !== name);
                            onConfigChange({ ...config, iqStrategies: upd });
                            // Auto-expand al activar; colapsar al desactivar
                            if (e.target.checked) setExpandedIQStrategy(name);
                            else if (expandedIQStrategy === name) setExpandedIQStrategy(null);
                          }}
                          className="rounded mr-4 w-4 h-4 accent-[#3f5c8c] flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-bold ${isChecked ? 'text-[#3f5c8c]' : 'text-[#191c1e]'}`}>{name}</p>
                            {recTf && (
                              <span className="px-1.5 py-0.5 bg-[#eef2f8] text-[#3f5c8c] text-[10px] rounded font-bold border border-[#3f5c8c]/15">
                                Recomendado: {recTf}
                              </span>
                            )}
                            {blockedOTC && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-bold border border-amber-300/40">
                                No apto para OTC
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{desc}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          {badge && <span className={`px-2 py-1 ${badgeCls} text-[10px] rounded font-black uppercase`}>{badge}</span>}
                          {isChecked && !blockedOTC && (
                            <button
                              type="button"
                              aria-label={`Configurar parámetros de ${name}`}
                              onClick={e => { e.preventDefault(); e.stopPropagation(); toggleIQParam(name); }}
                              className={`p-1 rounded transition-colors ${isExpanded ? 'text-[#3f5c8c] bg-[#3f5c8c]/10' : 'text-slate-400 hover:text-[#3f5c8c]'}`}>
                              <span className="material-symbols-outlined text-base">settings</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && isChecked && renderParamPanel(name, IQ_STRATEGY_PARAMS, () => setExpandedIQStrategy(null), 'border-[#3f5c8c]')}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="bg-white p-8 rounded-2xl border border-[#c4c6d0]/30 shadow-sm">
              <h3 className="text-xl font-semibold mb-6 flex items-center text-[#191c1e]">
                <span className="material-symbols-outlined mr-2 text-[#3f5c8c]">currency_exchange</span>
                Activos a Operar
                <span className="ml-auto text-xs font-normal text-[#747780]">
                  {config.selectedIQAssets?.length || getIQAssets().length} seleccionados
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {getIQAssets().map(asset => {
                  const isSel = config.selectedIQAssets?.includes(asset.symbol) ?? true;
                  return (
                    <label key={asset.symbol}
                      className={`p-3 border rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                        isSel ? 'border-[#3f5c8c]/20 bg-[#3f5c8c]/5' : 'border-[#c4c6d0]/30 hover:border-[#3f5c8c]/40'
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-600 flex-shrink-0">
                          {asset.symbol.slice(0, 2)}
                        </div>
                        <span className={`text-sm ${isSel ? 'font-bold' : 'font-medium'} text-[#191c1e]`}>{asset.name}</span>
                      </div>
                      <input type="checkbox" checked={isSel}
                        onChange={e => {
                          const cur = config.selectedIQAssets || getIQAssets().map(a => a.symbol);
                          const upd = e.target.checked ? [...cur, asset.symbol] : cur.filter((s: string) => s !== asset.symbol);
                          onConfigChange({ ...config, selectedIQAssets: upd });
                        }}
                        className="w-4 h-4 accent-[#3f5c8c] rounded flex-shrink-0" />
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Market Sessions */}
          <MarketSessionsCard activeSessions={config.activeSessions || []}
            onToggleSession={(s) => {
              const cur = config.activeSessions || [];
              const upd = cur.includes(s) ? cur.filter((x: string) => x !== s) : [...cur, s];
              onConfigChange({ ...config, activeSessions: upd });
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════
          METATRADER 5 TAB
      ═══════════════════════════════════════ */}
      {configPlatform === 'mt5' && (
        <div className="space-y-8">
          {/* Page Header */}
          <div>
            <h2 className="text-2xl font-semibold text-[#191c1e]">Configuración MetaTrader 5</h2>
            <p className="text-sm text-[#43474f] mt-1 max-w-2xl">Ajusta los parámetros operativos y selección de activos para tu terminal MT5. Los cambios se aplicarán en tiempo real.</p>
          </div>

          {/* Connection card */}
          <div className="bg-white p-5 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${mt5Connected ? 'bg-emerald-500 shadow-emerald-400/50 shadow-md' : 'bg-red-500'}`} />
              <div>
                <p className="font-semibold text-[#191c1e]">MetaTrader 5</p>
                <p className="text-xs text-[#4e6073]">Forex &amp; CFDs</p>
                {mt5Connected && <p className="text-sm text-emerald-600 font-semibold mt-0.5">Balance: ${mt5Balance.toFixed(2)}</p>}
              </div>
            </div>
            {!mt5Connected ? (
              <button onClick={onConnectMT5}
                className="px-6 py-2 bg-[#3f5c8c] hover:bg-[#2d4a78] rounded-full text-sm font-semibold transition-colors text-white">
                Conectar
              </button>
            ) : (
              <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />MT5: Connected
              </span>
            )}
          </div>

          {/* Operational Params */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#3f5c8c]">terminal</span>
              <h3 className="text-lg font-semibold text-[#191c1e]">Parámetros Operativos MT5</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-6 bg-white rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#43474f] uppercase tracking-wider block">Lotaje</label>
                <input type="number" min="0.01" max="100" step="0.01" value={config.mt5LotSize || 0.1}
                  onChange={e => onConfigChange({ ...config, mt5LotSize: parseFloat(e.target.value) })}
                  className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#43474f] uppercase tracking-wider block">Stop Loss (pips)</label>
                <input type="number" min="5" max="1000" value={config.mt5StopLoss || 50}
                  onChange={e => onConfigChange({ ...config, mt5StopLoss: parseInt(e.target.value) })}
                  className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#43474f] uppercase tracking-wider block">Take Profit (pips)</label>
                <input type="number" min="5" max="1000" value={config.mt5TakeProfit || 100}
                  onChange={e => onConfigChange({ ...config, mt5TakeProfit: parseInt(e.target.value) })}
                  className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#43474f] uppercase tracking-wider block">Apalancamiento</label>
                <select value={config.mt5Leverage || 100}
                  onChange={e => onConfigChange({ ...config, mt5Leverage: parseInt(e.target.value) })}
                  className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20">
                  <option value="10">1:10</option>
                  <option value="50">1:50</option>
                  <option value="100">1:100</option>
                  <option value="200">1:200</option>
                  <option value="500">1:500</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#43474f] uppercase tracking-wider block">Confianza Mín. (%)</label>
                <input type="number" min="50" max="95" value={config.mt5MinConfidence || 65}
                  onChange={e => onConfigChange({ ...config, mt5MinConfidence: parseInt(e.target.value) })}
                  className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
              </div>
            </div>
          </section>

          {/* Risk Management + Schedules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[#191c1e]">
                <span className="material-symbols-outlined text-orange-500">shield</span>
                Gestión de Riesgo
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[#4e6073] font-medium block mb-2">Riesgo por Trade (%)</label>
                  <input type="range" min="1" max="5"
                    value={config.mt5RiskPerTrade || 2}
                    onChange={e => onConfigChange({ ...config, mt5RiskPerTrade: parseInt(e.target.value) })}
                    className="w-full accent-[#3f5c8c]" />
                  <div className="flex justify-between text-xs text-[#4e6073] mt-1">
                    <span>1%</span>
                    <span className="text-[#3f5c8c] font-bold">{config.mt5RiskPerTrade || 2}%</span>
                    <span>5%</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#4e6073] font-medium block mb-2">Trades Simultáneos</label>
                  <input type="number" value={config.mt5MaxConcurrentTrades || 3}
                    onChange={e => onConfigChange({ ...config, mt5MaxConcurrentTrades: parseInt(e.target.value) })}
                    className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
                </div>
                <div>
                  <label className="text-sm text-[#4e6073] font-medium block mb-2">Máximo Trades Diarios</label>
                  <input type="number" value={config.mt5MaxDailyTrades || 50}
                    onChange={e => onConfigChange({ ...config, mt5MaxDailyTrades: parseInt(e.target.value) })}
                    className="w-full bg-[#f2f4f6] border border-[#c4c6d0]/50 rounded-lg px-3 py-2 text-[#191c1e] outline-none focus:ring-2 focus:ring-[#3f5c8c]/20" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={config.mt5AutoStopLoss !== false}
                    onChange={e => onConfigChange({ ...config, mt5AutoStopLoss: e.target.checked })}
                    className="w-4 h-4 accent-[#3f5c8c] rounded" />
                  Stop Loss Automático
                </label>
              </div>
            </div>
            <UpcomingNewsPanel
              pauseEnabled={config.mt5PauseOnNews !== false}
              onTogglePause={v => onConfigChange({ ...config, mt5PauseOnNews: v })}
            />
          </div>

          {/* Strategies */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#3f5c8c]">psychology</span>
              <h3 className="text-lg font-semibold text-[#191c1e]">Estrategias Activas</h3>
              <span className="ml-auto text-xs text-[#747780]">Timeframes: 1H, 4H, 1D</span>
            </div>
            <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)] space-y-3">
              {([
                { name: 'Ichimoku Cloud',  desc: 'Tendencia multi-timeframe con soporte y resistencia dinámica' },
                { name: 'Swing Trading',   desc: 'Captura de movimientos intermedios con gestión de posición' },
                { name: 'Grid Trading',    desc: 'Sistema de rejilla para mercados laterales y ranging' },
                { name: 'Trend Following', desc: 'Seguimiento de tendencia con múltiples confirmaciones' },
              ] as Array<{ name: string; desc: string }>).map(({ name, desc }) => {
                const isChecked = config.mt5Strategies?.includes(name) || false;
                const isExpanded = expandedMT5Strategy === name;
                const hasCustom = hasCustomParams(name, MT5_STRATEGY_PARAMS);
                return (
                  <div key={name}>
                    <label className={`flex items-center p-4 rounded-xl border cursor-pointer transition-colors ${
                      isChecked ? 'border-[#3f5c8c]/20 bg-[#3f5c8c]/5 hover:bg-[#3f5c8c]/10' : 'border-[#c4c6d0]/30 hover:border-[#3f5c8c]/40'
                    }`}>
                      <input type="checkbox" checked={isChecked}
                        onChange={e => {
                          const cur = config.mt5Strategies || [];
                          const upd = e.target.checked ? [...cur, name] : cur.filter((s: string) => s !== name);
                          onConfigChange({ ...config, mt5Strategies: upd });
                          if (!e.target.checked && expandedMT5Strategy === name) setExpandedMT5Strategy(null);
                        }}
                        className="rounded mr-4 w-4 h-4 accent-[#3f5c8c] flex-shrink-0" />
                      <div className="flex-1">
                        <p className={`font-bold ${isChecked ? 'text-[#3f5c8c]' : 'text-[#191c1e]'}`}>{name}</p>
                        <p className="text-xs text-slate-500">{desc}</p>
                      </div>
                      {hasCustom && isChecked && (
                        <button onClick={e => { e.preventDefault(); toggleMT5Param(name); }}
                          className={`p-1 rounded transition-colors ml-2 ${isExpanded ? 'text-[#3f5c8c] bg-[#3f5c8c]/10' : 'text-slate-400 hover:text-[#3f5c8c]'}`}>
                          <span className="material-symbols-outlined text-base">settings</span>
                        </button>
                      )}
                    </label>
                    {isExpanded && renderParamPanel(name, MT5_STRATEGY_PARAMS, () => setExpandedMT5Strategy(null), 'border-[#3f5c8c]')}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Assets by Category */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#3f5c8c]">account_balance_wallet</span>
              <h3 className="text-lg font-semibold text-[#191c1e]">Activos a Operar</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {([
                { label: 'Divisas (Forex)', types: ['forex'],     icon: 'currency_exchange'  },
                { label: 'Commodities',     types: ['commodity'], icon: 'diamond'            },
                { label: 'Índices',         types: ['index'],     icon: 'trending_up'        },
                { label: 'Cripto',          types: ['crypto'],    icon: 'currency_bitcoin'   },
              ] as Array<{ label: string; types: string[]; icon: string }>).map(({ label, types, icon }) => {
                const catAssets = MT5_ASSETS.filter(a => types.includes(a.type));
                return (
                  <div key={label} className="bg-white p-5 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-[#3f5c8c]">{icon}</span>{label}
                    </h4>
                    <div className="space-y-3">
                      {catAssets.map(asset => (
                        <label key={asset.symbol} className="flex items-center justify-between cursor-pointer group">
                          <span className="text-sm font-medium text-[#191c1e]">{asset.name}</span>
                          <input type="checkbox"
                            checked={config.selectedMT5Assets?.includes(asset.symbol) ?? true}
                            onChange={e => {
                              const cur = config.selectedMT5Assets || MT5_ASSETS.map(a => a.symbol);
                              const upd = e.target.checked ? [...cur, asset.symbol] : cur.filter((s: string) => s !== asset.symbol);
                              onConfigChange({ ...config, selectedMT5Assets: upd });
                            }}
                            className="rounded w-4 h-4 accent-[#3f5c8c] border-slate-300" />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Market Sessions */}
          <MarketSessionsCard activeSessions={config.activeSessions || []}
            onToggleSession={(s) => {
              const cur = config.activeSessions || [];
              const upd = cur.includes(s) ? cur.filter((x: string) => x !== s) : [...cur, s];
              onConfigChange({ ...config, activeSessions: upd });
            }}
          />

          {/* Save Footer */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-[#c4c6d0]/30">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="material-symbols-outlined text-base">info</span>
              Asegúrese de que los pips de Stop Loss sean mayores que el spread del broker.
            </div>
            <button onClick={onSaveConfig}
              className="flex items-center gap-2 bg-[#3f5c8c] text-white px-10 py-3 rounded-full font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 whitespace-nowrap">
              <span className="material-symbols-outlined text-[18px]">save</span>
              Guardar Configuración MetaTrader 5
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Panel de riesgo del día: muestra progreso (P&L día / objetivo), límite de pérdida,
 * estado de pausa, contador de pérdidas consecutivas y permite resetear.
 */
const DailyRiskPanel: React.FC<{ isTrading: boolean }> = ({ isTrading }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.getDailyProgress();
      setData(r.progress || r.data || r);
    } catch (e) {
      // silencioso
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh, isTrading]);

  const handleReset = async () => {
    if (!confirm('¿Reiniciar contadores diarios (P&L, racha, pausas)? Esto NO cierra trades activos.')) return;
    setLoading(true);
    try {
      await api.resetDailyCounters();
      toast.success('Contadores diarios reiniciados');
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Error al reiniciar');
    } finally {
      setLoading(false);
    }
  };

  if (!data) return null;

  const dailyPnL = Number(data.daily_pnl ?? 0);
  const targetAmount = Number(data.profit_target_amount ?? data.daily_profit_target_amount ?? 0);
  const lossAmount = Number(data.loss_limit_amount ?? data.daily_loss_limit_amount ?? 0);
  const consecutiveLosses = Number(data.consecutive_losses ?? 0);
  const maxLosses = Number(data.max_consecutive_losses ?? 3);
  const paused = !!data.paused;
  const pauseReason = data.pause_reason || '';
  const resumeAt = data.pause_until || data.resume_at;

  const pctTarget = targetAmount > 0
    ? Math.max(0, Math.min(100, (Math.max(0, dailyPnL) / targetAmount) * 100))
    : Number(data.progress_target_pct ?? 0);
  const pctLoss = lossAmount > 0
    ? Math.max(0, Math.min(100, (Math.max(0, -dailyPnL) / lossAmount) * 100))
    : Number(data.progress_loss_pct ?? 0);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-base font-bold flex items-center gap-2 text-[#191c1e]">
          <Shield className="w-4 h-4 text-emerald-500" />
          Gestión de Riesgo Diario
        </h3>
        <div className="flex items-center gap-2">
          {paused && (
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold uppercase">
              ⏸ Pausado: {pauseReason}
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            Reiniciar contadores
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">Ganancia hoy</span>
            <span className="font-mono text-slate-700">${dailyPnL.toFixed(2)} / ${targetAmount.toFixed(2)}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${pctTarget}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {pctTarget >= 100 ? '🎯 Objetivo alcanzado — bot detenido hasta mañana' : `${pctTarget.toFixed(0)}% del objetivo diario`}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">Pérdida hoy</span>
            <span className="font-mono text-slate-700">${Math.max(0, -dailyPnL).toFixed(2)} / ${lossAmount.toFixed(2)}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all" style={{ width: `${pctLoss}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {pctLoss >= 100 ? '🛑 Límite diario alcanzado — bot detenido hasta mañana' : `${pctLoss.toFixed(0)}% del límite diario`}
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold">Pérdidas consecutivas</span>
            <span className="font-mono text-slate-700">{consecutiveLosses} / {maxLosses}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all" style={{ width: `${Math.min(100, (consecutiveLosses / Math.max(1, maxLosses)) * 100)}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {paused && resumeAt ? `Reanuda: ${new Date(resumeAt).toLocaleTimeString()}` : 'Bot pausa 30 min al alcanzar el máximo'}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Log de señales ignoradas: muestra los últimos motivos por los que el bot
 * no ejecutó una señal (volatilidad, racha, noticia, ML, etc.)
 */
const IgnoredSignalsLog: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.getIgnoredSignals(15);
      setItems(r.items || r.data || r.signals || []);
    } catch (_) { /* */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <h3 className="text-base font-bold flex items-center gap-2 text-[#191c1e]">
          <span className="material-symbols-outlined text-amber-500 text-[18px]">filter_alt_off</span>
          Señales descartadas por filtros
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </h3>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
          {items.length === 0 && (
            <p className="px-5 py-4 text-xs text-slate-400">No hay señales descartadas todavía.</p>
          )}
          {items.map((s, i) => (
            <div key={i} className="px-5 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-slate-500 shrink-0">
                  {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '--'}
                </span>
                <span className="font-bold text-slate-800 truncate">{s.symbol || '—'}</span>
                {s.strategy && <span className="text-slate-500 truncate">· {s.strategy}</span>}
              </div>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold uppercase shrink-0">
                {s.reason || s.motivo || 'descartada'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Indicador del estado del módulo ML: número de operaciones, etapa
 * (observación / aprendiendo / maduro) y peso recomendado.
 */
const MLStatusIndicator: React.FC = () => {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.getMLStatus();
        if (alive) setInfo(r);
      } catch (_) { /* */ }
    })();
    return () => { alive = false; };
  }, []);

  const trades = Number(info?.trained_trades ?? info?.total_trades ?? info?.records ?? 0);
  let stage: { label: string; weight: string; color: string };
  if (trades < 300) stage = { label: 'Etapa 1 — Observación', weight: '0.20', color: 'text-amber-700 border-amber-200 bg-amber-50' };
  else if (trades < 800) stage = { label: 'Etapa 2 — Aprendiendo', weight: '0.30', color: 'text-[#3f5c8c] border-[#d6e3ff] bg-[#d6e3ff]/30' };
  else stage = { label: 'Etapa 3 — Maduro', weight: '0.40', color: 'text-emerald-700 border-emerald-200 bg-emerald-50' };

  return (
    <div className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-3 ${stage.color}`}>
      <span className="material-symbols-outlined text-[18px]">smart_toy</span>
      <div className="flex flex-col">
        <span className="font-bold leading-tight">ML: {stage.label}</span>
        <span className="text-[10px] opacity-80 leading-tight">
          {trades} operaciones · ml_weight recomendado: {stage.weight}
        </span>
      </div>
    </div>
  );
};

// Live Trading Tab Component  
const LiveTradingTab: React.FC<{
  platform: 'iqoption' | 'mt5';
  setPlatform: (p: 'iqoption' | 'mt5') => void;
  tradingMode: 'auto' | 'manual';
  setTradingMode: (m: 'auto' | 'manual') => void;
  isTrading: boolean;
  onToggleTrading: () => void;
  liveStatus: LiveStatus | null;
  signals: Signal[];
  recentTrades: Trade[];
  onExecuteSignal: (signal: Signal) => void;
  onIgnoreSignal: (signal: Signal) => void;
  onRefreshSignals: () => void;
  isScanning: boolean;
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  marketType: 'binary' | 'otc';
  onMarketTypeChange: (type: 'binary' | 'otc') => void;
  selectedAssets: string[];
  configStrategies: string[];
  configIndicators: {
    emaFast: number;
    emaSlow: number;
    rsiPeriod: number;
  };
  iqConnected: boolean;
  mt5Connected: boolean;
  activeSessions: string[];
  onOpenConnectionModal?: () => void;
}> = ({
  platform, setPlatform, tradingMode, setTradingMode,
  isTrading, onToggleTrading, liveStatus, signals, recentTrades,
  onExecuteSignal, onIgnoreSignal, onRefreshSignals, isScanning,
  selectedSymbol, onSymbolChange, marketType, onMarketTypeChange, selectedAssets,
  configStrategies, configIndicators, iqConnected, mt5Connected, activeSessions,
  onOpenConnectionModal
}) => {
  // Get available symbols based on platform and market type
  const getAvailableSymbols = () => {
    if (platform === 'iqoption') {
      const assets = marketType === 'otc' ? IQ_OPTION_ASSETS.otc : IQ_OPTION_ASSETS.binary;
      return assets.filter(a => selectedAssets.length === 0 || selectedAssets.includes(a.symbol));
    }
    return MT5_ASSETS.filter(a => selectedAssets.length === 0 || selectedAssets.includes(a.symbol));
  };
  
  const availableSymbols = getAvailableSymbols();
  const winRate = liveStatus 
    ? (liveStatus.total_trades > 0 
        ? (liveStatus.winning_trades / liveStatus.total_trades * 100) 
        : 0)
    : 0;

  // Daily operations state & filters with pagination
  const [dailyTrades, setDailyTrades] = useState<Trade[]>([]);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [filterSymbol, setFilterSymbol] = useState<string>('');
  const [filterResult, setFilterResult] = useState<string>('');
  const [minConf, setMinConf] = useState<string>('');
  const [maxConf, setMaxConf] = useState<string>('');
  const [showAllHistory, setShowAllHistory] = useState(false); // Toggle between today only or all history
  const TRADES_PER_PAGE = 25;
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination helpers
  const totalPages = Math.ceil(dailyTrades.length / TRADES_PER_PAGE);
  const paginatedTrades = dailyTrades.slice((currentPage - 1) * TRADES_PER_PAGE, currentPage * TRADES_PER_PAGE);

  const dailyResultStats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let pending = 0;
    for (const t of dailyTrades) {
      const n = normalizeTradeResult(t);
      if (n === 'win') wins += 1;
      else if (n === 'loss') losses += 1;
      else pending += 1;
    }
    return { wins, losses, pending, total: dailyTrades.length };
  }, [dailyTrades]);
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSymbol, filterResult, minConf, maxConf]);

  // Indicators config synced from Configuration - derived from configStrategies
  const [indicators, setIndicators] = useState({
    emaLength: configIndicators.emaFast || 9,
    rsiLength: configIndicators.rsiPeriod || 14,
    emaColor: '#10B981',
    rsiColor: '#8B5CF6',
    emaLineWidth: 2,
    rsiLineWidth: 2,
    showEMA: configStrategies.some(s => s.toLowerCase().includes('ema')),
    showRSI: configStrategies.some(s => s.toLowerCase().includes('rsi') || s.toLowerCase().includes('ema')),
    // Extra indicators - synced from config strategies
    showMACD: configStrategies.some(s => s.toLowerCase().includes('macd')),
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    showBollinger: configStrategies.some(s => s.toLowerCase().includes('bollinger')),
    bbPeriod: 20,
    bbStd: 2,
    showRSIDivergence: configStrategies.some(s => s.toLowerCase().includes('divergence')),
    rsiDivLookback: 80,
  });

  // Sync indicators when config strategies change
  useEffect(() => {
    setIndicators(prev => ({
      ...prev,
      emaLength: configIndicators.emaFast || prev.emaLength,
      rsiLength: configIndicators.rsiPeriod || prev.rsiLength,
      showEMA: configStrategies.some(s => s.toLowerCase().includes('ema')),
      showRSI: configStrategies.some(s => s.toLowerCase().includes('rsi') || s.toLowerCase().includes('ema')),
      showMACD: configStrategies.some(s => s.toLowerCase().includes('macd')),
      showBollinger: configStrategies.some(s => s.toLowerCase().includes('bollinger')),
      showRSIDivergence: configStrategies.some(s => s.toLowerCase().includes('divergence')),
    }));
  }, [configStrategies, configIndicators]);

  // Charts visibility state - each asset can be shown/hidden
  const [visibleCharts, setVisibleCharts] = useState<Record<string, boolean>>({});
  const [showAllCharts, setShowAllCharts] = useState(true);

  // Initialize visible charts when selected assets change
  useEffect(() => {
    const newVisible: Record<string, boolean> = {};
    selectedAssets.forEach(asset => {
      newVisible[asset] = visibleCharts[asset] !== undefined ? visibleCharts[asset] : true;
    });
    setVisibleCharts(newVisible);
  }, [selectedAssets]);

  const [chartTF, setChartTF] = useState<'1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'>(platform === 'iqoption' ? '5m' : '1h');

  useEffect(() => {
    setChartTF(platform === 'iqoption' ? '5m' : '1h');
  }, [platform]);

  // Chart engine selector – 'lightweight' (default) or 'tvpro' (TradingView Advanced Charts).
  const [chartEngine, setChartEngine] = useState<'lightweight' | 'tvpro'>(() => {
    if (typeof window === 'undefined') return 'lightweight';
    const saved = window.localStorage.getItem('chartEngine');
    return saved === 'tvpro' ? 'tvpro' : 'lightweight';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('chartEngine', chartEngine);
    }
  }, [chartEngine]);

  // Keep the TradingView Advanced Charts datafeed in sync with the active broker
  // so /api/tv/history hits the right `unified_data_service` provider.
  useEffect(() => {
    setTvDatafeedPlatform(platform);
  }, [platform]);

  // Map our internal timeframe codes to TradingView's resolution string.
  const tvResolution = useMemo(() => {
    const map: Record<string, string> = {
      '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D',
    };
    return map[chartTF] || '5';
  }, [chartTF]);

  const loadCandles = async (sym: string, tf: string, count: number) => {
    // IQ OTC usa símbolos tipo EURUSD-OTC; quitar el sufijo rompe las velas en vivo.
    const normalizedSymbol =
      platform === 'iqoption' && marketType === 'otc' ? sym : sym.replace('-OTC', '');
    // Tell the backend which broker to query so MT5 charts no longer fall back
    // to the IQ Option / demo provider (which doesn't know XAUUSD, US30, etc.),
    // and so IQ Option charts never hit the MT5 endpoint with an OTC symbol.
    const targetPlatform: 'iqoption' | 'mt5' = platform === 'mt5' ? 'mt5' : 'iqoption';

    // Demo fallback so the chart never stays empty when the broker is down.
    const tryDemo = async (): Promise<any[]> => {
      try {
        const res = await api.getCandles(normalizedSymbol, tf, count, 'demo');
        return res?.data || [];
      } catch {
        return [];
      }
    };

    try {
      const res = await api.getCandles(normalizedSymbol, tf, count, targetPlatform);
      if (res?.data?.length) return res.data;

      // Empty payload. For MT5 try the dedicated endpoint (which uses
      // copy_rates directly and resolves broker-specific suffixes); for IQ
      // Option there is no equivalent, so fall back to demo.
      if (platform === 'mt5') {
        try {
          const mtRes = await api.getMT5HistoricalData(normalizedSymbol, tf, count);
          if (mtRes?.data?.length) return mtRes.data;
        } catch {/* keep going to demo */}
      }
      return await tryDemo();
    } catch (e) {
      // The active broker rejected the request (e.g. not connected, unknown
      // symbol). Only hit the MT5 endpoint when the user is on MT5 — calling
      // it with OTC symbols just returns 500 and pollutes the console.
      if (platform === 'mt5') {
        try {
          const res = await api.getMT5HistoricalData(normalizedSymbol, tf, count);
          if (res?.data?.length) return res.data;
        } catch {/* keep going to demo */}
      }
      return await tryDemo();
    }
  };

  /** Inicio del día en hora local (sin convertir a UTC) para alinear con opened_at del servidor típico. */
  const startOfTodayIso = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
  };

  const fetchDailyTrades = async () => {
    try {
      setIsDailyLoading(true);
      const params: any = { limit: 200 };
      // Only filter by date if not showing all history
      if (!showAllHistory) {
        params.from = startOfTodayIso();
        params.to = new Date().toISOString();
      }
      if (filterSymbol) params.symbol = filterSymbol;
      if (filterResult) params.result = filterResult;
      if (minConf) params.min_conf = Number(minConf);
      if (maxConf) params.max_conf = Number(maxConf);
      const res = await api.getLiveHistoryAdvanced(params);
      setDailyTrades(res.trades || []);
    } catch (e: any) {
      console.error('daily history error', e);
      toast.error(e.message || 'Error al obtener operaciones');
    } finally {
      setIsDailyLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyTrades();
  }, [showAllHistory]);

  // Mode change handler with validation
  const handleModeChange = (mode: 'auto' | 'manual') => {
    if (mode === 'auto') {
      if (platform === 'iqoption' && !iqConnected) {
        toast('Modo DEMO sin broker: operaciones simuladas localmente', { icon: '📋' });
      }
      if (platform === 'mt5' && !mt5Connected) {
        toast.error('Debes conectar MT5 para usar el modo automático');
        onOpenConnectionModal?.();
        return;
      }
    }
    setTradingMode(mode);
  };

  // Start trading handler
  const handleToggleTrading = async () => {
    if (!isTrading) {
      if (tradingMode === 'auto') {
        if (platform === 'iqoption' && !iqConnected) {
          toast('Iniciando en modo DEMO simulado (sin broker conectado)', { icon: '📋' });
        }
        if (platform === 'mt5' && !mt5Connected) {
          toast.error('Debes conectar MT5 para usar el modo automático');
          onOpenConnectionModal?.();
          return;
        }
      }
    }
    onToggleTrading();
  };

  return (
    <div className="space-y-6 text-[#191c1e]">
      {/* ─── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#3f5c8c] tracking-tight">Terminal Pro Live</h1>
          <p className="text-slate-500 text-sm mt-1">Monitoreo en tiempo real de algoritmos y mercado global.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <span className={`w-2 h-2 rounded-full ${liveStatus?.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="text-xs font-bold text-slate-700">
              {liveStatus?.is_scanning ? 'Escaneando…' : liveStatus?.is_running ? 'Bot Activo' : 'Bot Detenido'}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500">Modo: <span className="text-[#3f5c8c] capitalize">{tradingMode}</span></span>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-500">Plataforma:
              <span className="text-[#3f5c8c] ml-1">{platform === 'iqoption' ? 'IQ Option' : 'MetaTrader 5'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ─── Control panel (bento) ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          {/* Plataforma */}
          <div className="inline-flex bg-slate-100/80 rounded-xl p-1">
            <button
              onClick={() => setPlatform('iqoption')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                platform === 'iqoption' ? 'bg-white shadow-sm text-[#3f5c8c]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              IQ Option
              <span className={`w-2 h-2 rounded-full ${iqConnected ? 'bg-emerald-500' : 'bg-rose-400'}`} />
            </button>
            <button
              onClick={() => setPlatform('mt5')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                platform === 'mt5' ? 'bg-white shadow-sm text-[#3f5c8c]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              MetaTrader 5
              <span className={`w-2 h-2 rounded-full ${mt5Connected ? 'bg-emerald-500' : 'bg-rose-400'}`} />
            </button>
          </div>

          {/* Modo + Iniciar/Detener */}
          <div className="flex items-center gap-3">
            <div className="inline-flex bg-slate-100/80 rounded-xl p-1">
              <button
                onClick={() => handleModeChange('auto')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  tradingMode === 'auto' ? 'bg-white shadow-sm text-[#3f5c8c]' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Bot className="w-4 h-4" /> Automático
              </button>
              <button
                onClick={() => handleModeChange('manual')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  tradingMode === 'manual' ? 'bg-white shadow-sm text-[#3f5c8c]' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Eye className="w-4 h-4" /> Manual
              </button>
            </div>

            <button
              onClick={handleToggleTrading}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm ${
                isTrading
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200'
              }`}
            >
              {isTrading ? (<><Pause className="w-4 h-4" /> Detener</>) : (<><Play className="w-4 h-4" /> Iniciar</>)}
            </button>
          </div>
        </div>

        {/* Stats grid bento */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Balance', value: `$${(liveStatus?.balance || 0).toFixed(2)}`, sub: platform === 'iqoption' ? 'IQ Option' : 'MT5', icon: 'account_balance_wallet', cls: 'text-[#3f5c8c]' },
            { label: 'P&L Hoy', value: `${(liveStatus?.total_pnl || 0) >= 0 ? '+' : ''}$${(liveStatus?.total_pnl || 0).toFixed(2)}`, sub: 'Variación neta', icon: 'trending_up', cls: (liveStatus?.total_pnl || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600' },
            { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, sub: `${liveStatus?.winning_trades || 0} / ${liveStatus?.total_trades || 0} trades`, icon: 'verified', cls: 'text-emerald-600' },
            { label: 'Operaciones', value: `${liveStatus?.total_trades || 0}`, sub: `${liveStatus?.active_trades?.length || 0} activas`, icon: 'pie_chart', cls: 'text-[#3f5c8c]' },
            { label: 'Bot', value: liveStatus?.is_running ? 'Activo' : 'Detenido', sub: liveStatus?.is_scanning ? 'Escaneando…' : 'En espera', icon: 'smart_toy', cls: liveStatus?.is_running ? 'text-emerald-600' : 'text-slate-500' },
          ].map((s, i) => (
            <div key={i} className="bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200/70 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</span>
                <span className={`material-symbols-outlined text-base ${s.cls} opacity-70`}>{s.icon}</span>
              </div>
              <p className={`text-xl font-extrabold ${s.cls}`}>{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <MLStatusIndicator />
        </div>
      </div>

      {/* ─── Riesgo + señales ignoradas ─────────────────────────────────── */}
      <DailyRiskPanel isTrading={isTrading} />
      <IgnoredSignalsLog />

      {/* ─── Grid principal: chart + signals/trades ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Area - Multiple Charts for Selected Assets */}
        <div className="lg:col-span-2 space-y-4">
          {/* Global Chart Controls (bento) */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-[#191c1e]">
                <BarChart3 className="w-4 h-4 text-[#3f5c8c]" />
                Gráficos en Vivo
                <span className="text-xs font-bold text-[#3f5c8c] bg-[#d6e3ff] px-2 py-0.5 rounded">
                  {availableSymbols.filter(a => visibleCharts[a.symbol] !== false).length} activos
                </span>
              </h3>
              <div className="flex items-center gap-2">
                {/* Engine selector: lightweight charts vs TradingView Advanced Charts */}
                <div className="inline-flex bg-slate-100 rounded-lg p-0.5" title="Motor de gráfico">
                  <button
                    onClick={() => setChartEngine('lightweight')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                      chartEngine === 'lightweight' ? 'bg-white text-[#3f5c8c] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Lightweight
                  </button>
                  <button
                    onClick={() => setChartEngine('tvpro')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 ${
                      chartEngine === 'tvpro' ? 'bg-white text-[#3f5c8c] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    TV Pro
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded font-black">NEW</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    const newState = !showAllCharts;
                    setShowAllCharts(newState);
                    const updated: Record<string, boolean> = {};
                    availableSymbols.forEach(a => { updated[a.symbol] = newState; });
                    setVisibleCharts(updated);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                >
                  {showAllCharts ? 'Ocultar Todos' : 'Mostrar Todos'}
                </button>
                <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
                  {(platform === 'iqoption' ? ['1m', '5m', '15m'] : ['1h', '4h', '1D']).map(tf => {
                    const tfNorm = (tf === '1D' ? '1d' : tf) as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
                    const active = chartTF === tfNorm;
                    return (
                      <button
                        key={tf}
                        onClick={() => setChartTF(tfNorm)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                          active ? 'bg-white text-[#3f5c8c] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Indicator controls */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { key: 'showEMA',       label: `EMA (${indicators.emaLength})`, color: 'emerald' },
                { key: 'showRSI',       label: `RSI (${indicators.rsiLength})`, color: 'violet'  },
                { key: 'showMACD',      label: 'MACD',                          color: 'sky'     },
                { key: 'showBollinger', label: 'Bollinger',                     color: 'amber'   },
              ].map(ind => (
                <label key={ind.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                  (indicators as any)[ind.key]
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={(indicators as any)[ind.key]}
                    onChange={(e) => setIndicators(prev => ({ ...prev, [ind.key]: e.target.checked }))}
                    className="w-3.5 h-3.5 accent-[#3f5c8c] rounded"
                  />
                  <span className="font-medium">{ind.label}</span>
                </label>
              ))}
            </div>
            {/* Connection notice when the chosen broker isn't available */}
            {platform === 'mt5' && !mt5Connected && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <span className="material-symbols-outlined text-base mt-0.5">warning</span>
                <div className="flex-1">
                  <p className="font-bold">MetaTrader 5 no está conectado</p>
                  <p className="opacity-90">
                    Conéctate desde <span className="font-semibold">Configuración → Conexiones</span> para ver
                    velas reales de los activos seleccionados (Forex, Commodities, Índices y Crypto).
                  </p>
                </div>
                {onOpenConnectionModal && (
                  <button
                    onClick={onOpenConnectionModal}
                    className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold whitespace-nowrap"
                  >
                    Conectar MT5
                  </button>
                )}
              </div>
            )}
            {platform === 'iqoption' && !iqConnected && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <span className="material-symbols-outlined text-base mt-0.5">warning</span>
                <div className="flex-1">
                  <p className="font-bold">IQ Option no está conectado</p>
                  <p className="opacity-90">
                    Conéctate desde <span className="font-semibold">Configuración → Conexiones</span> para ver
                    velas reales de los pares OTC y Binarios.
                  </p>
                </div>
                {onOpenConnectionModal && (
                  <button
                    onClick={onOpenConnectionModal}
                    className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold whitespace-nowrap"
                  >
                    Conectar IQ
                  </button>
                )}
              </div>
            )}
            {/* Asset visibility toggles */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Mostrar / Ocultar Activos</p>
              <div className="flex flex-wrap gap-1.5">
                {availableSymbols.map(asset => (
                  <button
                    key={asset.symbol}
                    onClick={() => setVisibleCharts(prev => ({ ...prev, [asset.symbol]: !prev[asset.symbol] }))}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-all ${
                      visibleCharts[asset.symbol] !== false
                        ? 'bg-[#3f5c8c] border-[#3f5c8c] text-white'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {asset.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Charts Container - Stacked Vertically with larger height */}
          <div className="space-y-4 max-h-[820px] overflow-y-auto pr-1 custom-scrollbar">
            {availableSymbols
              .filter(asset => visibleCharts[asset.symbol] !== false)
              .map(asset => (
                <div key={asset.symbol} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#3f5c8c] text-base">candlestick_chart</span>
                      <span className="font-bold text-sm text-[#191c1e]">{asset.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{asset.symbol}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        marketType === 'otc'
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        {marketType.toUpperCase()}
                      </span>
                    </div>
                    <button
                      onClick={() => setVisibleCharts(prev => ({ ...prev, [asset.symbol]: false }))}
                      className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                      title="Ocultar gráfico"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="h-96 bg-white overflow-hidden">
                    {chartEngine === 'tvpro' ? (
                      <TradingViewProChart
                        symbol={asset.symbol}
                        interval={tvResolution}
                        theme="Light"
                        height={384}
                        trades={(liveStatus?.active_trades || [])
                          .filter(t => {
                            const a = String(asset.symbol || '').replace('-OTC', '');
                            const s = String((t as any).symbol || '').replace('-OTC', '');
                            return a === s && typeof (t as any).entry_price === 'number';
                          })
                          .slice(0, 20)
                          .map((t, idx) => {
                            const tt: any = t;
                            return {
                              id: tt.id ?? tt.order_id ?? `${tt.symbol}-${tt.timestamp}-${idx}`,
                              time: new Date(tt.timestamp).getTime(),
                              price: Number(tt.entry_price),
                              direction: (tt.direction as 'call' | 'put') || 'call',
                              confidence: typeof tt.confidence === 'number' ? tt.confidence : undefined,
                              tp: typeof tt.tp === 'number' ? tt.tp : (typeof tt.take_profit === 'number' ? tt.take_profit : undefined),
                              sl: typeof tt.sl === 'number' ? tt.sl : (typeof tt.stop_loss === 'number' ? tt.stop_loss : undefined),
                            };
                          })}
                      />
                    ) : (
                      <LightweightProChart
                        symbol={asset.symbol}
                        platform={platform}
                        timeframe={chartTF}
                        height={384}
                        loadCandles={loadCandles}
                        candleCount={platform === 'iqoption' ? 400 : 500}
                        theme="light"
                        showEMA={indicators.showEMA}
                        emaLength={indicators.emaLength}
                        emaColor={indicators.emaColor}
                        emaLineWidth={indicators.emaLineWidth}
                        showRSI={indicators.showRSI}
                        rsiLength={indicators.rsiLength}
                        rsiColor={indicators.rsiColor}
                        rsiLineWidth={indicators.rsiLineWidth}
                        showMACD={indicators.showMACD}
                        macdFast={indicators.macdFast}
                        macdSlow={indicators.macdSlow}
                        macdSignal={indicators.macdSignal}
                        showBollinger={indicators.showBollinger}
                        bbPeriod={indicators.bbPeriod}
                        bbStd={indicators.bbStd}
                        showRSIDivergence={indicators.showRSIDivergence}
                        rsiDivLookback={indicators.rsiDivLookback}
                        sessionBands={computeSessionBands(activeSessions)}
                        trades={(liveStatus?.active_trades || [])
                          .filter(t => {
                            const a = String(asset.symbol || '').replace('-OTC', '');
                            const s = String((t as any).symbol || '').replace('-OTC', '');
                            return a === s && typeof (t as any).entry_price === 'number';
                          })
                          .slice(0, 20)
                          .map(t => {
                            const tt: any = t;
                            return {
                              time: Math.floor(new Date(tt.timestamp).getTime() / 1000),
                              price: Number(tt.entry_price),
                              direction: (tt.direction as 'call' | 'put') || 'call',
                              label: (tt.direction || '').toUpperCase(),
                              confidence: typeof tt.confidence === 'number' ? tt.confidence : undefined,
                              tp: typeof tt.tp === 'number' ? tt.tp : (typeof tt.take_profit === 'number' ? tt.take_profit : undefined),
                              sl: typeof tt.sl === 'number' ? tt.sl : (typeof tt.stop_loss === 'number' ? tt.stop_loss : undefined),
                            };
                          })}
                      />
                    )}
                  </div>
                </div>
              ))}
            {availableSymbols.filter(asset => visibleCharts[asset.symbol] !== false).length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm p-10 text-center">
                <BarChart3 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-semibold">No hay gráficos visibles</p>
                <p className="text-xs text-slate-500 mt-1">Selecciona activos en Configuración o usa los botones arriba</p>
              </div>
            )}
          </div>
        </div>

        {/* Signals & Trades */}
        <div className="space-y-4">
          {/* Active Signals */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold flex items-center gap-2 text-[#191c1e]">
                <Zap className="w-4 h-4 text-amber-500" />
                Señales Activas
                <span className="text-[10px] font-bold text-[#3f5c8c] bg-[#d6e3ff] px-2 py-0.5 rounded">LIVE</span>
              </h3>
              <button
                onClick={onRefreshSignals}
                disabled={isScanning}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
                title="Refrescar"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {signals.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  {isScanning ? 'Escaneando mercado…' : 'No hay señales activas'}
                </p>
              ) : (
                signals.map((signal, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all hover:shadow-sm ${
                      signal.direction === 'call'
                        ? 'bg-emerald-50/40 border-emerald-100'
                        : 'bg-rose-50/40 border-rose-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 ${
                        signal.direction === 'call' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}>
                        {signal.direction === 'call'
                          ? <TrendingUp className="w-4 h-4" />
                          : <TrendingDown className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">
                          {signal.direction.toUpperCase()} {signal.symbol}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {signal.strategy} · Conf {signal.confidence.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                    {tradingMode === 'manual' && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            if (platform === 'mt5' && !mt5Connected) {
                              toast.error('Conecta MT5 para ejecutar');
                              return;
                            }
                            onExecuteSignal(signal);
                          }}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                            platform === 'mt5' && !mt5Connected
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                          }`}
                        >
                          Ejecutar
                        </button>
                        <button
                          onClick={() => onIgnoreSignal(signal)}
                          className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                        >
                          Ignorar
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Trades with Countdown - Pending first */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold flex items-center gap-2 text-[#191c1e]">
                <span className="material-symbols-outlined text-[#3f5c8c] text-base">pending_actions</span>
                Operaciones Activas
              </h3>
              {(() => {
                const brokerConnected = platform === 'iqoption' ? iqConnected : mt5Connected;
                const brokerLabel = platform === 'iqoption' ? 'IQ' : 'MT5';
                return !brokerConnected && recentTrades.some(t => normalizeTradeResult(t) === 'pending') && (
                  <button
                    onClick={() => onOpenConnectionModal?.()}
                    className="px-2 py-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors font-semibold"
                  >
                    ⚠️ Conectar {brokerLabel}
                  </button>
                );
              })()}
            </div>
            {(() => {
              const brokerConnected = platform === 'iqoption' ? iqConnected : mt5Connected;
              const brokerLabel = platform === 'iqoption' ? 'IQ Option' : 'MetaTrader 5';
              return !brokerConnected && recentTrades.length > 0 && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                  <span className="mt-0.5">🔸</span>
                  <span>
                    <strong>Modo Simulación.</strong> Las operaciones se calculan localmente y no se envían a {brokerLabel}.
                  </span>
                </div>
              );
            })()}
            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
              {recentTrades.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Sin operaciones recientes</p>
              ) : (
                [...recentTrades]
                  .sort((a, b) => {
                    const pa = normalizeTradeResult(a);
                    const pb = normalizeTradeResult(b);
                    if (pa === 'pending' && pb !== 'pending') return -1;
                    if (pa !== 'pending' && pb === 'pending') return 1;
                    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                  })
                  .slice(0, 10).map((trade, i) => {
                  const ro = normalizeTradeResult(trade);
                  const sentToBroker = Boolean((trade as any).order_id_platform);
                  const accent = ro === 'win'
                    ? { border: 'border-emerald-200',  pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',  label: '✓ GANADA',   pnlCls: 'text-emerald-600' }
                    : ro === 'loss'
                    ? { border: 'border-rose-200',     pill: 'bg-rose-50 text-rose-700 border-rose-200',           label: '✕ PERDIDA',  pnlCls: 'text-rose-600' }
                    : { border: 'border-amber-200',   pill: 'bg-amber-50 text-amber-700 border-amber-200',        label: '⏳ ACTIVA',   pnlCls: 'text-amber-600' };
                  return (
                  <div key={i} className={`bg-white rounded-xl p-3 border ${accent.border} hover:shadow-sm transition-shadow`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                          trade.direction === 'call'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {trade.direction?.toUpperCase()}
                        </span>
                        <span className="text-sm font-bold text-slate-900 truncate">{trade.symbol}</span>
                        {(() => {
                          const tradePlatform = String((trade as any).platform || '').toLowerCase();
                          const brokerLabel = tradePlatform === 'mt5' || (!tradePlatform && platform === 'mt5')
                            ? 'MT5'
                            : 'IQ';
                          return (
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                sentToBroker
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-amber-50 border-amber-200 text-amber-700'
                              }`}
                              title={sentToBroker
                                ? `Orden enviada y ejecutada en ${brokerLabel === 'MT5' ? 'MetaTrader 5' : 'IQ Option'}`
                                : `Simulación local — ${brokerLabel === 'MT5' ? 'MetaTrader 5' : 'IQ Option'} no conectado`}
                            >
                              {sentToBroker ? `🔗 ${brokerLabel}` : '🔸 SIM'}
                            </span>
                          );
                        })()}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${accent.pill}`}>
                        {accent.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        ${trade.amount?.toFixed(2)} · {new Date(trade.timestamp).toLocaleTimeString()}
                        {(trade as any).entry_price ? ` · ${(trade as any).entry_price}` : ''}
                      </span>
                      {ro === 'pending' ? (
                        <CountdownTimer
                          expirationTime={trade.expiration_time}
                          expirationMinutes={trade.expiration_minutes}
                          timestamp={trade.timestamp}
                        />
                      ) : (
                        <span className={`font-bold ${accent.pnlCls}`}>
                          {trade.pnl != null ? ((trade.pnl >= 0 ? '+' : '') + '$' + Math.abs(trade.pnl).toFixed(2)) : '-'}
                        </span>
                      )}
                    </div>
                  </div>
                );})
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ─── Operaciones del día (fila completa) ────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-[#191c1e] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#3f5c8c] text-base">history</span>
              {showAllHistory ? 'Historial de Operaciones' : 'Operaciones del Día'}
            </h3>
            <button
              onClick={() => setShowAllHistory(!showAllHistory)}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                showAllHistory
                  ? 'bg-[#3f5c8c] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {showAllHistory ? 'Ver solo hoy' : 'Ver todo'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDailyTrades}
              disabled={isDailyLoading}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDailyLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={() => {
                const params: any = { limit: 500 };
                if (!showAllHistory) {
                  params.from = startOfTodayIso();
                  params.to = new Date().toISOString();
                }
                if (filterSymbol) params.symbol = filterSymbol;
                if (filterResult) params.result = filterResult;
                if (minConf) params.min_conf = Number(minConf);
                if (maxConf) params.max_conf = Number(maxConf);
                window.open(api.buildLiveHistoryExportUrl(params), '_blank');
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-[#3f5c8c] hover:bg-[#2e4a76] text-white rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          </div>
        </div>

        {dailyResultStats.total > 0 && (
          <div className="px-6 pt-4 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              GANADAS · {dailyResultStats.wins}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
              PERDIDAS · {dailyResultStats.losses}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold">
              PENDIENTES · {dailyResultStats.pending}
            </span>
            <span className="text-slate-500 self-center">Total listado: {dailyResultStats.total}</span>
          </div>
        )}

        <div className="px-6 pt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Símbolo</label>
            <select value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3f5c8c]/30">
              <option value="">Todos</option>
              {availableSymbols.map(a => (
                <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Resultado</label>
            <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3f5c8c]/30">
              <option value="">Todos</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Conf. mín</label>
            <input value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="60" className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3f5c8c]/30" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Conf. máx</label>
            <input value={maxConf} onChange={(e) => setMaxConf(e.target.value)} placeholder="85" className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3f5c8c]/30" />
          </div>
          <div className="flex items-end">
            <button onClick={fetchDailyTrades} className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
              Aplicar filtros
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                <th className="px-6 py-3">Hora</th>
                <th className="px-6 py-3">Activo</th>
                <th className="px-6 py-3">Dirección</th>
                <th className="px-6 py-3 text-right">Monto</th>
                <th className="px-6 py-3 text-right">Entrada</th>
                <th className="px-6 py-3 text-right">Salida</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3 text-right">PnL</th>
                <th className="px-6 py-3">Estrategia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-4xl text-slate-300">inbox</span>
                      <span className="font-semibold">{showAllHistory ? 'No hay operaciones registradas' : 'Sin operaciones hoy'}</span>
                      {!showAllHistory && (
                        <button
                          onClick={() => setShowAllHistory(true)}
                          className="text-xs text-[#3f5c8c] hover:underline font-semibold"
                        >
                          Ver historial completo →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((t: Trade, idx: number) => {
                  const outcome = normalizeTradeResult(t);
                  const dirCls = t.direction === 'call'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700';
                  const stCls = outcome === 'win'
                    ? { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Closed' }
                    : outcome === 'loss'
                    ? { dot: 'bg-rose-500',    text: 'text-rose-700',    label: 'Closed' }
                    : { dot: 'bg-[#3f5c8c] animate-pulse', text: 'text-[#3f5c8c]', label: 'Active' };
                  const pnlCls = typeof t.pnl === 'number'
                    ? (t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600')
                    : 'text-slate-400';
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 text-xs text-slate-500 font-medium">
                        {new Date(t.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3 font-bold text-slate-800">{t.symbol}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${dirCls}`}>
                          {t.direction?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium tabular-nums text-slate-700">
                        ${t.amount?.toFixed ? t.amount.toFixed(2) : t.amount}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-600">{t.entry_price ?? '-'}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-slate-600">{t.exit_price ?? '-'}</td>
                      <td className="px-6 py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-semibold ${stCls.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stCls.dot}`} />
                          {stCls.label}
                        </span>
                      </td>
                      <td className={`px-6 py-3 text-right font-extrabold tabular-nums ${pnlCls}`}>
                        {typeof t.pnl === 'number' ? (t.pnl >= 0 ? '+' : '') + '$' + Math.abs(t.pnl).toFixed(2) : '--'}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">{t.strategy_used || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
            <p className="text-xs text-slate-500">
              Mostrando <strong>{((currentPage - 1) * TRADES_PER_PAGE) + 1}-{Math.min(currentPage * TRADES_PER_PAGE, dailyTrades.length)}</strong> de {dailyTrades.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-slate-600"
              >
                Anterior
              </button>
              <span className="text-xs text-slate-500">Página {currentPage} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-slate-600"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Backtesting Tab ────────────────────────────────────────────────────────
// Glass-card, bento-style simulator wired to /api/backtesting/auto.
// Aligned with the live trading platform: defaults to the assets and market
// type the user is operating, so the metrics here reflect what will run live.
const STRATEGY_OPTIONS: Array<{ id: string; label: string; family: string }> = [
  { id: 'ema_rsi',        label: 'EMA + RSI Reversal',  family: 'Tendencia' },
  { id: 'macd',           label: 'MACD Trend Follow',   family: 'Tendencia' },
  { id: 'bollinger',      label: 'Bollinger Scalping',  family: 'Reversión' },
  { id: 'ichimoku',       label: 'Ichimoku Cloud',      family: 'Tendencia' },
  { id: 'rsi_divergence', label: 'RSI Divergence',      family: 'Reversión' },
];

const TIMEFRAME_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '1m',  label: '1 minuto'   },
  { id: '5m',  label: '5 minutos'  },
  { id: '15m', label: '15 minutos' },
  { id: '30m', label: '30 minutos' },
  { id: '1h',  label: '1 hora'     },
  { id: '4h',  label: '4 horas'    },
  { id: '1d',  label: '1 día'      },
];

const PERIOD_OPTIONS: Array<{ id: string; label: string; days: number }> = [
  { id: '7d',   label: 'Última semana', days: 7  },
  { id: '30d',  label: 'Último mes',    days: 30 },
  { id: '58d',  label: 'Últimos 58 d.', days: 58 },
];

const BacktestingTab: React.FC<{
  strategies: string[];
  onRunBacktest: (params: any) => void;
  result: BacktestResult | null;
  isRunning: boolean;
  errorMessage?: string | null;
  platform?: 'iqoption' | 'mt5';
  marketType?: 'binary' | 'otc';
  selectedLiveAssets?: string[];
}> = ({
  onRunBacktest, result, isRunning, errorMessage,
  platform = 'iqoption', marketType = 'binary', selectedLiveAssets = [],
}) => {
  const router = useRouter();

  // Available assets depend on the broker. Yahoo Finance (used by the auto
  // backtest) only knows real symbols, so OTC variants are normalized.
  const availableAssets = useMemo(() => {
    if (platform === 'mt5') return MT5_ASSETS;
    return marketType === 'otc' ? IQ_OPTION_ASSETS.otc : IQ_OPTION_ASSETS.binary;
  }, [platform, marketType]);

  const defaultAsset = useMemo(() => {
    const live = selectedLiveAssets[0];
    if (live) return live.replace('-OTC', '');
    return availableAssets[0]?.symbol?.replace('-OTC', '') || 'EURUSD';
  }, [availableAssets, selectedLiveAssets]);

  const [asset, setAsset]              = useState(defaultAsset);
  const [strategy, setStrategy]        = useState('ema_rsi');
  const [timeframe, setTimeframe]      = useState('5m');
  const [period, setPeriod]            = useState('30d');
  const [initialCapital, setInitialCapital] = useState(10_000);
  const [tradeAmount, setTradeAmount]       = useState(100);
  const [minConfidence, setMinConfidence]   = useState(60);

  // Keep the selected asset in sync with the broker / market mode.
  useEffect(() => { setAsset(defaultAsset); }, [defaultAsset]);

  const handleRun = () => {
    const days = PERIOD_OPTIONS.find(p => p.id === period)?.days || 30;
    onRunBacktest({
      strategy_name:   strategy,
      assets:          [asset.replace('-OTC', '')],
      timeframe,
      days_back:       days,
      initial_capital: initialCapital,
      trade_amount:    tradeAmount,
      payout_rate:     platform === 'iqoption' ? 0.85 : 0.0,
      min_confidence:  minConfidence,
      expiration_minutes: 5,
      max_trades_per_day: 100,
    });
  };

  const m = result?.metrics;
  const totalReturnPct = m
    ? (m.total_return ?? (m.total_pnl / Math.max(1, result?.start_balance || initialCapital)) * 100)
    : 0;
  const drawdownPct = m?.max_drawdown_pct ?? m?.max_drawdown ?? 0;

  // Equity curve as compact SVG path (avoids extra deps).
  const equityChart = useMemo(() => {
    const curve = result?.equity_curve || [];
    if (curve.length < 2) return null;
    const W = 800;
    const H = 280;
    const balances = curve.map(p => p.balance);
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const range = Math.max(1e-6, max - min);
    const step = W / (curve.length - 1);
    const pts = curve.map((p, i) => `${(i * step).toFixed(2)},${(H - ((p.balance - min) / range) * (H - 20) - 10).toFixed(2)}`);
    const line = `M${pts.join(' L')}`;
    const area = `${line} L${W},${H} L0,${H} Z`;
    return { line, area, viewBox: `0 0 ${W} ${H}` };
  }, [result?.equity_curve]);

  const recentTrades = (result?.trades || []).slice(-12).reverse();
  const fmtMoney = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#191c1e]">Simulador de Estrategias · Backtesting Pro</h2>
          <p className="text-sm text-[#43474f] mt-1 max-w-2xl">
            Analiza el rendimiento histórico de tus algoritmos con precisión institucional.
            Ajusta parámetros, valida señales y optimiza la gestión de riesgo antes de operar en real.
          </p>
        </div>
        <button
          onClick={() => router.push('/app/dashboard/backtesting')}
          className="self-start md:self-end inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#3f5c8c]/30 bg-white text-[#3f5c8c] hover:bg-[#3f5c8c] hover:text-white transition-colors text-xs font-bold shadow-sm"
        >
          <BarChart3 className="w-4 h-4" /> Análisis Profesional Completo
        </button>
      </div>

      {/* Configuration card */}
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-[#c4c6d0]/30 shadow-[0_10px_20px_rgba(112,141,192,0.06)]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4 items-end">
          <div>
            <label className="text-[11px] font-bold text-[#43474f] uppercase tracking-wider block mb-1.5">Activo</label>
            <select value={asset} onChange={e => setAsset(e.target.value)}
              className="w-full bg-[#eceef0] border-none rounded-lg px-3 py-2.5 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#3f5c8c] outline-none">
              {availableAssets.map(a => (
                <option key={a.symbol} value={a.symbol.replace('-OTC', '')}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[11px] font-bold text-[#43474f] uppercase tracking-wider block mb-1.5">Estrategia</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)}
              className="w-full bg-[#eceef0] border-none rounded-lg px-3 py-2.5 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#3f5c8c] outline-none">
              {STRATEGY_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.label} · {s.family}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#43474f] uppercase tracking-wider block mb-1.5">Timeframe</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
              className="w-full bg-[#eceef0] border-none rounded-lg px-3 py-2.5 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#3f5c8c] outline-none">
              {TIMEFRAME_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#43474f] uppercase tracking-wider block mb-1.5">Periodo</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="w-full bg-[#eceef0] border-none rounded-lg px-3 py-2.5 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#3f5c8c] outline-none">
              {PERIOD_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-[#43474f] uppercase tracking-wider block mb-1.5">Capital ($)</label>
            <input type="number" min={100} step={100} value={initialCapital}
              onChange={e => setInitialCapital(Number(e.target.value) || 0)}
              className="w-full bg-[#eceef0] border-none rounded-lg px-3 py-2.5 text-sm font-medium text-[#191c1e] focus:ring-2 focus:ring-[#3f5c8c] outline-none" />
          </div>
          <div>
            <button onClick={handleRun} disabled={isRunning}
              className="w-full bg-[#3f5c8c] hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-[#3f5c8c]/20">
              {isRunning
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analizando…</>
                : <><Play className="w-4 h-4" /> Ejecutar Backtest</>}
            </button>
          </div>
        </div>

        {/* Risk knobs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-5 pt-5 border-t border-[#c4c6d0]/30">
          <div>
            <div className="flex justify-between text-[11px] font-bold text-[#43474f] mb-1.5">
              <span className="uppercase tracking-wider">Monto / operación</span>
              <span className="text-[#3f5c8c]">${tradeAmount}</span>
            </div>
            <input type="range" min={5} max={1000} step={5} value={tradeAmount}
              onChange={e => setTradeAmount(Number(e.target.value))}
              className="w-full accent-[#3f5c8c]" />
          </div>
          <div>
            <div className="flex justify-between text-[11px] font-bold text-[#43474f] mb-1.5">
              <span className="uppercase tracking-wider">Confianza mínima</span>
              <span className="text-[#3f5c8c]">{minConfidence}%</span>
            </div>
            <input type="range" min={50} max={95} step={1} value={minConfidence}
              onChange={e => setMinConfidence(Number(e.target.value))}
              className="w-full accent-[#3f5c8c]" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#d1e4fb]/40 rounded-lg border border-[#3f5c8c]/15">
            <span className="material-symbols-outlined text-[#3f5c8c] text-base">verified</span>
            <p className="text-[11px] text-[#43474f] leading-snug">
              <strong className="text-[#191c1e]">{platform === 'mt5' ? 'MetaTrader 5' : `IQ Option · ${marketType.toUpperCase()}`}</strong>
              {' · '}Mismos parámetros del trading en vivo. Datos reales desde Yahoo Finance.
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && !isRunning && (
        <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-rose-700 mb-0.5">No se pudo ejecutar el backtest</p>
            <p className="text-xs text-rose-700/90 leading-relaxed">{errorMessage}</p>
            {timeframe !== '1h' && timeframe !== '1d' && (
              <button
                onClick={() => { setTimeframe('1h'); }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors"
              >
                Probar con 1h →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty / loading states */}
      {!result && !isRunning && !errorMessage && (
        <div className="bg-white/80 rounded-xl p-12 text-center border border-[#c4c6d0]/30 shadow-sm">
          <BarChart3 className="w-14 h-14 mx-auto text-[#c4c6d0] mb-3" />
          <p className="text-base font-bold text-[#191c1e]">Configura y ejecuta el análisis</p>
          <p className="text-xs text-[#43474f] mt-1">Selecciona estrategia, activo y periodo para validar tu plan.</p>
        </div>
      )}
      {isRunning && (
        <div className="bg-white/80 rounded-xl p-12 text-center border border-[#c4c6d0]/30 shadow-sm">
          <RefreshCw className="w-12 h-12 mx-auto text-[#3f5c8c] mb-3 animate-spin" />
          <p className="text-base font-bold text-[#191c1e]">Descargando datos y ejecutando análisis…</p>
          <p className="text-xs text-[#43474f] mt-1">
            {asset} · {timeframe} · {PERIOD_OPTIONS.find(p => p.id === period)?.label}
          </p>
        </div>
      )}

      {/* KPI grid */}
      {result && m && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Ganancia Total ($)"
              value={fmtMoney(m.total_pnl)}
              tone={m.total_pnl >= 0 ? 'positive' : 'negative'}
              subValue={`${fmtPct(totalReturnPct)} ROE`}
              accent="border-l-[#3f5c8c]"
            />
            <KpiCard
              label="Profit Factor"
              value={(m.profit_factor || 0).toFixed(2)}
              subValue={`Mín. recomendado: 1.5${(m.profit_factor || 0) >= 1.5 ? ' ✓' : ''}`}
              tone={(m.profit_factor || 0) >= 1.5 ? 'positive' : (m.profit_factor || 0) >= 1 ? 'neutral' : 'negative'}
            />
            <KpiCard
              label="Win Rate"
              value={`${(m.win_rate || 0).toFixed(1)}%`}
              progress={Math.max(0, Math.min(100, m.win_rate || 0))}
              tone={(m.win_rate || 0) >= 55 ? 'positive' : (m.win_rate || 0) >= 50 ? 'neutral' : 'negative'}
              subValue={`${m.winning_trades}W · ${m.losing_trades}L`}
            />
            <KpiCard
              label="Sharpe Ratio"
              value={(m.sharpe_ratio || 0).toFixed(2)}
              subValue="Risk-adjusted"
              tone={(m.sharpe_ratio || 0) >= 1 ? 'positive' : (m.sharpe_ratio || 0) >= 0 ? 'neutral' : 'negative'}
            />
            <KpiCard
              label="Max Drawdown"
              value={`${drawdownPct.toFixed(2)}%`}
              tone="negative"
              subValue={`${m.max_consecutive_losses || 0} pérdidas seguidas`}
              accent="border-l-rose-500"
            />
          </div>

          {/* Equity curve + Risk distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white/80 rounded-xl p-6 border border-[#c4c6d0]/30 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#191c1e]">Curva de Equidad</h3>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#d1e4fb] text-[#294775] text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-[#3f5c8c]" /> Balance
                </span>
              </div>
              <div className="h-[320px] w-full">
                {equityChart ? (
                  <svg viewBox={equityChart.viewBox} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="equityGradientLight" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"  stopColor="#3f5c8c" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#3f5c8c" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={equityChart.area} fill="url(#equityGradientLight)" />
                    <path d={equityChart.line} fill="none" stroke="#3f5c8c" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[#c4c6d0]">
                    <BarChart3 className="w-12 h-12 mb-2" />
                    <p className="text-sm">Sin datos suficientes</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-[#43474f]">
                <span>Capital inicial: <strong className="text-[#191c1e]">${result.start_balance.toLocaleString()}</strong></span>
                <span>Capital final: <strong className={result.end_balance >= result.start_balance ? 'text-emerald-600' : 'text-rose-600'}>${result.end_balance.toLocaleString()}</strong></span>
                <span>{m.total_trades} operaciones · {(m.trades_per_day || 0).toFixed(1)}/día</span>
              </div>
            </div>

            <div className="bg-white/80 rounded-xl p-6 border border-[#c4c6d0]/30 shadow-sm flex flex-col">
              <h3 className="text-sm font-bold text-[#191c1e] mb-4">Distribución de Riesgo</h3>
              <div className="flex-1 space-y-5">
                <RiskBar label="Promedio ganadora" value={fmtMoney(m.avg_win || 0)} color="bg-emerald-500" pct={Math.min(100, ((m.avg_win || 0) / Math.max(1, (m.avg_win || 0) + Math.abs(m.avg_loss || 0))) * 100)} valueClass="text-emerald-600" />
                <RiskBar label="Promedio perdedora" value={fmtMoney(-Math.abs(m.avg_loss || 0))} color="bg-rose-500" pct={Math.min(100, (Math.abs(m.avg_loss || 0) / Math.max(1, (m.avg_win || 0) + Math.abs(m.avg_loss || 0))) * 100)} valueClass="text-rose-600" />
                <RiskBar
                  label="Risk / Reward"
                  value={`1 : ${(Math.abs(m.avg_loss || 0) > 0 ? ((m.avg_win || 0) / Math.abs(m.avg_loss || 0)) : 0).toFixed(2)}`}
                  color="bg-[#3f5c8c]"
                  pct={Math.min(100, ((m.avg_win || 0) / Math.max(1, Math.abs(m.avg_loss || 0))) * 35)}
                  valueClass="text-[#191c1e]"
                />
                <RiskBar
                  label="Recovery Factor"
                  value={(m.recovery_factor || 0).toFixed(2)}
                  color="bg-amber-500"
                  pct={Math.min(100, (m.recovery_factor || 0) * 25)}
                  valueClass="text-[#191c1e]"
                />
              </div>
              <div className="mt-5 p-3 bg-[#eceef0] rounded-lg">
                <p className="text-[11px] font-bold text-[#3f5c8c] uppercase mb-1">Veredicto</p>
                <p className="text-xs text-[#43474f] leading-relaxed">
                  {m.profit_factor >= 1.5 && m.win_rate >= 55 && drawdownPct <= 15
                    ? 'Estrategia con expectativa positiva y drawdown controlado. Apta para operar en vivo.'
                    : m.profit_factor >= 1
                    ? 'Estrategia rentable pero sensible al riesgo. Reduce el tamaño de posición o sube la confianza mínima.'
                    : 'Resultados por debajo del umbral institucional. Ajusta parámetros antes de activarla en vivo.'}
                </p>
              </div>
            </div>
          </div>

          {/* Trade history */}
          <div className="bg-white/80 rounded-xl border border-[#c4c6d0]/30 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#c4c6d0]/30 flex items-center justify-between bg-[#f2f4f6]">
              <h3 className="text-sm font-bold text-[#191c1e]">Historial de Operaciones</h3>
              <span className="text-[11px] text-[#43474f]">
                Mostrando últimas {recentTrades.length} de {result.trades.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#e6e8ea] text-[#43474f] uppercase text-[11px] font-bold">
                  <tr>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Activo</th>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3 text-right">Entrada</th>
                    <th className="px-6 py-3 text-right">Salida</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3 text-right">P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c4c6d0]/20">
                  {recentTrades.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-[#43474f]">No hay operaciones registradas.</td></tr>
                  ) : recentTrades.map((t, idx) => {
                    const dir = (t.direction || '').toLowerCase();
                    const isLong = dir === 'call' || dir === 'buy';
                    return (
                      <tr key={t.id ?? idx} className="hover:bg-[#f7f9fb] transition-colors">
                        <td className="px-6 py-3 text-[#43474f]">
                          {t.timestamp
                            ? new Date(typeof t.timestamp === 'number' ? t.timestamp * 1000 : t.timestamp)
                                .toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                        <td className="px-6 py-3 font-semibold">{t.asset || t.symbol}</td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isLong ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {isLong ? 'Buy / Call' : 'Sell / Put'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-semibold tabular-nums">{(t.entry_price ?? 0).toFixed(5)}</td>
                        <td className="px-6 py-3 text-right font-semibold tabular-nums">{(t.exit_price ?? 0).toFixed(5)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">${(t.amount ?? 0).toFixed(2)}</td>
                        <td className={`px-6 py-3 text-right font-bold tabular-nums ${(t.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmtMoney(t.pnl ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {result.trades.length > recentTrades.length && (
              <div className="px-6 py-3 border-t border-[#c4c6d0]/30 bg-[#f7f9fb] text-center">
                <button
                  onClick={() => router.push('/app/dashboard/backtesting')}
                  className="text-xs font-bold text-[#3f5c8c] hover:underline"
                >
                  Ver todas las operaciones en el análisis profesional →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Reusable cards for the BacktestingTab ──────────────────────────────────
const KpiCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
  progress?: number;
  tone?: 'positive' | 'negative' | 'neutral';
  accent?: string;
}> = ({ label, value, subValue, progress, tone = 'neutral', accent }) => {
  const toneClass =
    tone === 'positive' ? 'text-emerald-600' :
    tone === 'negative' ? 'text-rose-600' :
    'text-[#191c1e]';
  return (
    <div className={`bg-white/80 rounded-xl p-5 border border-[#c4c6d0]/30 shadow-[0_10px_20px_rgba(112,141,192,0.06)] ${accent ? `border-l-4 ${accent}` : ''}`}>
      <p className="text-[11px] font-bold text-[#43474f] uppercase tracking-wider mb-1">{label}</p>
      <h3 className={`text-2xl font-bold ${toneClass}`}>{value}</h3>
      {typeof progress === 'number' && (
        <div className="w-full bg-[#e6e8ea] h-1 rounded-full mt-2 overflow-hidden">
          <div className="bg-[#3f5c8c] h-full" style={{ width: `${progress}%` }} />
        </div>
      )}
      {subValue && <p className="text-[11px] text-[#43474f] mt-1.5">{subValue}</p>}
    </div>
  );
};

const RiskBar: React.FC<{
  label: string;
  value: string;
  color: string;
  pct: number;
  valueClass?: string;
}> = ({ label, value, color, pct, valueClass = 'text-[#191c1e]' }) => (
  <div>
    <div className="flex justify-between text-xs font-medium mb-1">
      <span className="text-[#43474f]">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
    <div className="w-full bg-[#eceef0] h-2 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  </div>
);

// ─── Dashboard Overview Tab ───────────────────────────────────────────────────
const DashboardOverviewTab: React.FC<{
  iqConnected: boolean;
  mt5Connected: boolean;
  iqBalance: number;
  mt5Balance: number;
  recentTrades: Trade[];
  onNavigate: (tab: string) => void;
}> = ({ iqConnected, mt5Connected, iqBalance, mt5Balance, recentTrades, onNavigate }) => {
  const totalBalance = iqBalance + mt5Balance;
  const wins = recentTrades.filter(t => t.result === 'win').length;
  const winRate = recentTrades.length > 0 ? Math.round((wins / recentTrades.length) * 100) : 68;
  const todayPnl = recentTrades.slice(0, 10).reduce((sum, t) => {
    const val = typeof t.pnl === 'number' ? t.pnl : 0;
    return sum + val;
  }, 0);

  return (
    <div className="space-y-10">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#191c1e]">Dashboard Principal</h2>
          <p className="text-sm text-[#43474f] mt-1">Bienvenido de nuevo. Aquí tienes el resumen de tu actividad.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className={`flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-[#c4c6d0]/30 shadow-sm ${!mt5Connected && 'opacity-60'}`}>
            <span className={`w-2 h-2 rounded-full ${mt5Connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-xs font-semibold text-slate-700">MT5: {mt5Connected ? 'Activo' : 'Desconectado'}</span>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-[#c4c6d0]/30 shadow-sm ${!iqConnected && 'opacity-60'}`}>
            <span className={`w-2 h-2 rounded-full ${iqConnected ? 'bg-blue-500' : 'bg-slate-300'}`} />
            <span className="text-xs font-semibold text-slate-700">IQ Option: {iqConnected ? 'Activo' : 'Desconectado'}</span>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-semibold text-[#43474f] uppercase tracking-wider">Saldo Total</span>
            <span className="material-symbols-outlined text-[#708DC0]" style={{ fontSize: '22px' }}>account_balance_wallet</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-[#191c1e]">${totalBalance > 0 ? totalBalance.toFixed(0) : '—'}</span>
            {totalBalance > 0 && <span className="text-sm text-[#43474f]">.00</span>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit">
            <TrendingUp className="w-3 h-3" />
            +12.5% este mes
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-semibold text-[#43474f] uppercase tracking-wider">Ganancias/Pérdidas Hoy</span>
            <span className="material-symbols-outlined text-[#708DC0]" style={{ fontSize: '22px' }}>show_chart</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-bold ${todayPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {todayPnl >= 0 ? '+' : ''}{todayPnl !== 0 ? `$${Math.abs(todayPnl).toFixed(2)}` : '$0.00'}
            </span>
          </div>
          <div className="mt-4">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: '70%' }} />
            </div>
            <p className="text-[10px] text-[#43474f] mt-2">70% de la meta diaria alcanzada</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-semibold text-[#43474f] uppercase tracking-wider">Win Rate</span>
            <span className="material-symbols-outlined text-[#708DC0]" style={{ fontSize: '22px' }}>target</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-[#191c1e]">{winRate}</span>
            <span className="text-sm text-[#43474f]">%</span>
          </div>
          <div className="mt-4 flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i < Math.round(winRate / 20) ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>
      </section>

      {/* Equity Chart + Distribution */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-[#191c1e]">Rendimiento Histórico</h3>
            <div className="flex gap-2">
              {['1S', '1M', '1A'].map((p, i) => (
                <button key={p} className={`px-3 py-1 text-xs font-bold rounded-md ${i === 1 ? 'bg-[#3f5c8c] text-white' : 'bg-slate-100 text-slate-600'}`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="relative h-[240px] w-full">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 280">
              <defs>
                <linearGradient id="ovGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#708DC0" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#708DC0" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,250 Q100,230 200,240 T400,180 T600,150 T800,100 T1000,80 L1000,280 L0,280 Z" fill="url(#ovGrad)" />
              <path d="M0,250 Q100,230 200,240 T400,180 T600,150 T800,100 T1000,80" fill="none" stroke="#708DC0" strokeLinecap="round" strokeWidth="2.5" />
              {[[200,240],[400,180],[600,150],[800,100]].map(([cx,cy],i) => (
                <circle key={i} cx={cx} cy={cy} r="4" fill="white" stroke="#708DC0" strokeWidth="2" />
              ))}
              <circle cx="1000" cy="80" r="6" fill="#708DC0" />
            </svg>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-slate-400 font-medium px-2 pt-3 border-t border-slate-100">
              {['01 May','07 May','14 May','21 May','28 May'].map(d => <span key={d}>{d}</span>)}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)] flex flex-col">
          <h3 className="text-lg font-semibold text-[#191c1e] mb-6">Distribución</h3>
          <div className="flex-1 flex flex-col justify-center items-center">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="16" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#708DC0" strokeWidth="16" strokeDasharray="251" strokeDashoffset="100" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3f5c8c" strokeWidth="16" strokeDasharray="251" strokeDashoffset="200" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-slate-800">12</span>
                <span className="text-[9px] text-slate-400 uppercase font-bold">Activos</span>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {[['#708DC0','Forex Major','45%'],['#3f5c8c','Crypto','35%'],['#e2e8f0','Indices','20%']].map(([color,label,pct]) => (
              <div key={label} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs font-medium text-slate-600">{label}</span>
                </div>
                <span className="text-xs font-bold text-slate-900">{pct}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Operations */}
      <section className="bg-white rounded-xl border border-[#c4c6d0]/30 shadow-[0_4px_20px_rgba(112,141,192,0.08)] overflow-hidden">
        <div className="p-6 flex justify-between items-center border-b border-slate-50">
          <h3 className="text-lg font-semibold text-[#191c1e]">Operaciones Recientes</h3>
          <button onClick={() => onNavigate('live')} className="text-[#3f5c8c] text-xs font-bold hover:underline">Ver Historial Completo</button>
        </div>
        <div className="overflow-x-auto">
          {recentTrades.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">Sin operaciones recientes</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  {['Activo','Dirección','Precio Entrada','Resultado','Tiempo'].map(h => (
                    <th key={h} className="px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentTrades.slice(0, 5).map((trade, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-bold">
                          {(trade.symbol || 'FX').slice(0,2)}
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{trade.symbol || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        trade.direction === 'call' || trade.direction === 'buy'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        {trade.direction === 'call' || trade.direction === 'buy' ? 'Compra' : 'Venta'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">{trade.entry_price ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${trade.result === 'win' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {trade.result === 'win' ? '+' : ''}{typeof trade.pnl === 'number' ? `$${trade.pnl.toFixed(2)}` : trade.result}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">{trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};

// ─── Platforms Hub Tab ────────────────────────────────────────────────────────
const PlatformsHubTab: React.FC<{
  iqConnected: boolean;
  mt5Connected: boolean;
  iqBalance: number;
  mt5Balance: number;
  onConnectIQ: () => void;
  onConnectMT5: () => void;
  onOpenConnectionModal: () => void;
}> = ({ iqConnected, mt5Connected, iqBalance, mt5Balance, onConnectIQ, onConnectMT5, onOpenConnectionModal }) => {
  const platforms = [
    {
      key: 'mt5',
      name: 'MetaTrader 5',
      desc: 'Estándar de la industria para Forex y CFDs.',
      icon: 'terminal',
      iconBg: 'bg-[#d6e3ff]', iconColor: 'text-[#3f5c8c]',
      connected: mt5Connected,
      balance: mt5Balance,
      onConnect: onConnectMT5,
      available: true,
    },
    {
      key: 'iq',
      name: 'IQ Option',
      desc: 'Plataforma intuitiva para opciones binarias.',
      icon: 'query_stats',
      iconBg: 'bg-[#ffdad6]', iconColor: 'text-[#93000a]',
      connected: iqConnected,
      balance: iqBalance,
      onConnect: onConnectIQ,
      available: true,
    },
    {
      key: 'binance',
      name: 'Binance',
      desc: 'El exchange de criptomonedas más grande del mundo.',
      icon: 'currency_bitcoin',
      iconBg: 'bg-[#FCD535]/20', iconColor: 'text-[#C99400]',
      connected: false,
      balance: 0,
      onConnect: () => {},
      available: true,
    },
    {
      key: 'coinbase',
      name: 'Coinbase',
      desc: 'Seguridad institucional para tus activos digitales.',
      icon: 'account_balance_wallet',
      iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
      connected: false,
      balance: 0,
      onConnect: () => {},
      available: false,
    },
    {
      key: 'bybit',
      name: 'Bybit',
      desc: 'Trading de derivados y futuros de alta velocidad.',
      icon: 'trending_up',
      iconBg: 'bg-slate-800', iconColor: 'text-white',
      connected: false,
      balance: 0,
      onConnect: () => {},
      available: true,
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#191c1e]">Hub de Conectividad</h2>
        <p className="text-sm text-[#4e6073] mt-1 max-w-2xl">
          Gestiona tus conexiones con las plataformas de trading líderes. Conecta tus cuentas para empezar a operar en tiempo real.
        </p>
      </div>

      {/* Platform Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {platforms.map(p => (
          <div key={p.key} className="group bg-white border border-[#c4c6d0]/30 rounded-xl p-6 shadow-[0_4px_20px_rgba(112,141,192,0.08)] hover:-translate-y-1 transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
              <div className={`w-12 h-12 flex items-center justify-center ${p.iconBg} ${p.iconColor} rounded-xl`}>
                <span className="material-symbols-outlined text-3xl">{p.icon}</span>
              </div>
              {p.connected ? (
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">Conectado</span>
              ) : p.available ? (
                <span className="px-3 py-1 rounded-full bg-[#d1e4fb] text-[#546679] text-[11px] font-semibold">Disponible</span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-[#e6e8ea] text-[#565d64] text-[11px] font-semibold">No conectado</span>
              )}
            </div>
            <h3 className="text-xl font-semibold text-[#191c1e] mb-1">{p.name}</h3>
            <p className="text-sm text-[#4e6073] mb-6">{p.desc}</p>
            {p.connected && p.balance > 0 && (
              <p className="text-xs font-semibold text-emerald-600 mb-3">Balance: ${p.balance.toFixed(2)}</p>
            )}
            {p.connected ? (
              <button className="w-full py-3 border border-[#c4c6d0] text-[#191c1e] rounded-full text-xs font-semibold tracking-wide hover:bg-[#f2f4f6] transition-colors">
                GESTIONAR
              </button>
            ) : p.available ? (
              <button
                onClick={p.key === 'mt5' || p.key === 'iq' ? p.onConnect : onOpenConnectionModal}
                className="w-full py-3 bg-[#3f5c8c] text-white rounded-full text-xs font-semibold tracking-wide hover:bg-[#2d4a78] transition-colors"
              >
                CONECTAR
              </button>
            ) : (
              <button className="w-full py-3 border border-[#747780] text-[#191c1e] rounded-full text-xs font-semibold tracking-wide hover:bg-[#f2f4f6] transition-colors">
                GESTIONAR
              </button>
            )}
          </div>
        ))}

        {/* New Connection card */}
        <div className="group bg-slate-900 text-white rounded-xl p-6 shadow-[0_4px_20px_rgba(112,141,192,0.15)] flex flex-col justify-center items-center text-center overflow-hidden relative">
          <span className="material-symbols-outlined text-5xl mb-4 text-[#708DC0]">add_link</span>
          <h3 className="text-xl font-semibold mb-2">Nueva Conexión</h3>
          <p className="text-slate-400 text-sm mb-6 px-4">¿No ves tu plataforma? Solicita una nueva integración.</p>
          <button className="px-8 py-2 bg-white text-slate-900 rounded-full text-xs font-semibold tracking-wide hover:bg-slate-100 transition-colors">
            SOLICITAR
          </button>
        </div>
      </div>

      {/* Info cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#f2f4f6] p-6 rounded-xl border border-[#c4c6d0]/20">
          <div className="flex items-center gap-3 mb-4 text-[#3f5c8c]">
            <span className="material-symbols-outlined">security</span>
            <h4 className="text-lg font-semibold">Seguridad de Nivel Bancario</h4>
          </div>
          <p className="text-sm text-[#4e6073]">
            Utilizamos encriptación AES-256 para proteger todas tus API Keys y credenciales de acceso. Tus fondos siempre permanecen en tu exchange o broker.
          </p>
        </div>
        <div className="bg-[#f2f4f6] p-6 rounded-xl border border-[#c4c6d0]/20">
          <div className="flex items-center gap-3 mb-4 text-[#3f5c8c]">
            <span className="material-symbols-outlined">sync</span>
            <h4 className="text-lg font-semibold">Sincronización en Tiempo Real</h4>
          </div>
          <p className="text-sm text-[#4e6073]">
            Una vez conectado, el sistema sincroniza tus saldos, posiciones abiertas y el historial de operaciones de manera instantánea.
          </p>
        </div>
      </section>
    </div>
  );
};

// Main Dashboard Component
const TradingDashboard: React.FC = () => {
  // Theme
  const { theme, toggleTheme } = useTheme();
  
  // State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'platforms' | 'config' | 'live' | 'backtest'>('dashboard');
  const [configPlatform, setConfigPlatform] = useState<'iqoption' | 'mt5'>('iqoption');
  const [platform, setPlatform] = useState<'iqoption' | 'mt5'>('iqoption');
  const [tradingMode, setTradingMode] = useState<'auto' | 'manual'>('manual');
  const [isTrading, setIsTrading] = useState(false);
  
  // Connection state
  const [iqConnected, setIqConnected] = useState(false);
  const [mt5Connected, setMt5Connected] = useState(false);
  const [iqBalance, setIqBalance] = useState(0);
  const [mt5Balance, setMt5Balance] = useState(0);
  const [iqAccountType, setIqAccountType] = useState<'PRACTICE' | 'REAL'>('PRACTICE');
  
  // Trading state
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  
  // Default config
  const defaultConfig = {
    // Risk Management
    riskPerTrade: 2,
    maxConcurrentTrades: 3,
    maxDailyTrades: 50,
    autoStopLoss: true,
    activeSessions: ['Londres', 'Nueva York', 'Tokio', 'Sydney'],
    pauseOnNews: true,
    // Trading Parameters
    betAmount: 10,
    takeProfit: 80,
    stopLoss: 100,
    expiration: 5,
    // IQ Option Strategies (display names matching Config panel checkboxes)
    iqStrategies: ['EMA + RSI'],
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    minConfidence: 68,
    // MT5 Strategies (display names)
    mt5Strategies: ['Ichimoku Cloud'],
    mt5LotSize: 0.1,
    mt5StopLoss: 50,
    mt5TakeProfit: 100,
    mt5MaxSpread: 3,
    // Market Type & Assets
    iqMarketType: 'binary' as 'binary' | 'otc',
    selectedIQAssets: ['EURUSD', 'GBPUSD', 'USDJPY'] as string[],
    selectedMT5Assets: ['EURUSD', 'GBPUSD'] as string[]
  };

  // Config state - start with default, load from localStorage after mount to avoid hydration mismatch
  const [config, setConfig] = useState(defaultConfig);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load config from localStorage after mount (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('trading_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate: if iqStrategies uses old backend names, reset to display names
        const backendNames = ['ema_rsi', 'macd', 'bollinger', 'rsi_divergence', 'ichimoku'];
        const hasOldNames = (parsed.iqStrategies || []).some((s: string) => backendNames.includes(s));
        if (hasOldNames) {
          parsed.iqStrategies = ['EMA + RSI'];
          parsed.mt5Strategies = ['Ichimoku Cloud'];
        }
        // Migrate: ensure selectedIQAssets has defaults if empty
        if (!parsed.selectedIQAssets || parsed.selectedIQAssets.length === 0) {
          parsed.selectedIQAssets = ['EURUSD', 'GBPUSD', 'USDJPY'];
        }
        setConfig(prev => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.error('Error loading config from localStorage:', e);
    }
    setConfigLoaded(true);
  }, []);

  // Persist config to localStorage when it changes (only after initial load)
  useEffect(() => {
    if (configLoaded) {
      try {
        localStorage.setItem('trading_config', JSON.stringify(config));
      } catch (e) {
        console.error('Error saving config to localStorage:', e);
      }
    }
  }, [config, configLoaded]);
  
  // Backtest state
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestError, setBacktestError]   = useState<string | null>(null);
  const [isBacktesting, setIsBacktesting]   = useState(false);
  
  // Modal state
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [connectionPlatform, setConnectionPlatform] = useState<'iqoption' | 'mt5'>('iqoption');

  // Check connection status on mount
  useEffect(() => {
    checkConnections();
    fetchLiveStatus();
  }, []);

  // Sequential poll: status first (triggers backend settlement), then history (reads results)
  const pollLiveData = async () => {
    await fetchLiveStatus();   // triggers _settle_due_trades on backend
    await refreshTrades();     // now history has up-to-date WIN/LOSS
  };

  // Polling for live status - always poll when on live tab, more frequently when trading
  useEffect(() => {
    // Initial fetch when switching to live tab
    if (activeTab === 'live') {
      pollLiveData();
    }

    // Set up polling interval - 3s when trading/pending, 8s otherwise
    const pollInterval = isTrading ? 3000 : 8000;
    const interval = setInterval(() => {
      if (activeTab === 'live') {
        pollLiveData();
        if (isTrading && tradingMode === 'auto') {
          refreshSignals();
        }
      }
    }, pollInterval);
    
    return () => clearInterval(interval);
  }, [isTrading, tradingMode, activeTab]);

  const checkConnections = async () => {
    // Check IQ Option connection
    try {
      const result = await api.checkConnection();
      if (result.status === 'connected' || result.connected) {
        setIqConnected(true);
        try {
          const accountInfo = await api.getAccountInfo();
          if (accountInfo.balance) {
            setIqBalance(accountInfo.balance);
          }
          if (accountInfo.account_type) {
            setIqAccountType(
              (accountInfo.account_type || '').toUpperCase() === 'REAL' ? 'REAL' : 'PRACTICE'
            );
          }
        } catch (e) {
          // Balance fetch failed
        }
      }
    } catch (error) {
      // Not connected via direct check, try broker status
      try {
        const brokerStatus = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000'}/api/broker/status`);
        const data = await brokerStatus.json();
        if (data.iqoption?.connected) {
          setIqConnected(true);
          if (data.iqoption?.balance) {
            setIqBalance(data.iqoption.balance);
          }
        }
        if (data.mt5?.connected) {
          setMt5Connected(true);
          if (data.mt5?.balance) {
            setMt5Balance(data.mt5.balance);
          }
        }
      } catch (e) {
        // Broker status not available
      }
    }
  };

  const fetchLiveStatus = async () => {
    try {
      const result = await api.getLiveStatus();
      // Extract bot_status from response
      const status = result.bot_status || result;
      setLiveStatus(status);
      setIsTrading(status.is_running);
      
      // Update balance from bot status if connected
      if (status.balance > 0) {
        if (status.platform === 'iqoption' || platform === 'iqoption') {
          setIqBalance(status.balance);
        } else {
          setMt5Balance(status.balance);
        }
      }
    } catch (error) {
      // Status not available
    }
  };

  const refreshTrades = async () => {
    try {
      // getLiveHistory also triggers settlement on the backend
      const res = await api.getLiveHistory(10);
      if (res.trades) {
        setRecentTrades(res.trades);
      }
    } catch (e) {
      // ignore
    }
  };

  // Fast poll when there are pending trades waiting for result
  const hasPendingTrades = recentTrades.some(t => normalizeTradeResult(t) === 'pending');
  useEffect(() => {
    if (!hasPendingTrades) return;
    const fastPoll = setInterval(() => {
      refreshTrades();
    }, 2000);
    return () => clearInterval(fastPoll);
  }, [hasPendingTrades]);

  // ── SSE: real-time push from backend ─────────────────────────────────────
  // Connects to GET /api/live/events and receives instant trade_result /
  // balance_update / trade_timeout events the moment IQ Option settles an
  // order — no more waiting for the 3-8 s polling interval.
  useEffect(() => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000';
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es = new EventSource(`${BASE_URL}/api/live/events`);

      es.addEventListener('connected', () => {
        console.log('[SSE] connected to /api/live/events');
      });

      es.addEventListener('trade_result', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as {
            trade_id: string;
            order_id: string;
            result: 'win' | 'loss';
            profit: number;
          };
          // Instantly update the matching trade card
          setRecentTrades(prev =>
            prev.map(t =>
              t.id === data.trade_id
                ? { ...t, result: data.result, pnl: data.profit }
                : t
            )
          );
          const sign = data.profit >= 0 ? '+' : '';
          if (data.result === 'win') {
            toast.success(`🏆 WIN  ${sign}$${data.profit.toFixed(2)}`);
          } else {
            toast.error(`❌ LOSS  $${data.profit.toFixed(2)}`);
          }
        } catch {/* ignore malformed events */}
      });

      es.addEventListener('balance_update', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { balance: number; platform: string };
          if (!data.platform || data.platform === 'iqoption') {
            setIqBalance(data.balance);
          }
        } catch {/* ignore */}
      });

      es.addEventListener('trade_timeout', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { trade_id: string };
          toast(`⏰ Resultado pendiente — reintentando…`, { icon: '🔄' });
          // Trigger a manual refresh so the poll picks it up
          refreshTrades();
          console.warn('[SSE] trade_timeout for', data.trade_id);
        } catch {/* ignore */}
      });

      es.onerror = () => {
        es?.close();
        // Auto-reconnect after 5 s
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────

  const handleConnectIQ = () => {
    setConnectionPlatform('iqoption');
    setConnectionModalOpen(true);
  };

  const handleConnectMT5 = () => {
    setConnectionPlatform('mt5');
    setConnectionModalOpen(true);
  };

  const handleConnectionSuccess = (accountInfo: any) => {
    if (connectionPlatform === 'iqoption') {
      setIqConnected(true);
      setIqBalance(accountInfo.balance || 0);
      setIqAccountType(
        (accountInfo.account_type || '').toUpperCase() === 'REAL' ? 'REAL' : 'PRACTICE'
      );
    } else {
      setMt5Connected(true);
      setMt5Balance(accountInfo.balance || accountInfo.equity || 0);
    }
    // Redirect to configuration tab showing only the connected platform
    setConfigPlatform(connectionPlatform === 'iqoption' ? 'iqoption' : 'mt5');
    setActiveTab('config');
  };

  const handleSaveConfig = async () => {
    try {
      const minConf = Number(config.minConfidence ?? 68);
      if (Number.isNaN(minConf) || minConf < 60 || minConf > 95) {
        toast.error('La confianza mínima debe estar entre 60 y 95');
        return;
      }
      await api.saveRobotConfig(config);
      toast.success('Configuración guardada — Redirigiendo a Trading en Vivo');
      // Al cambiar de tab, ConfigurationTab se desmonta y los paneles se cierran
      setTimeout(() => {
        setActiveTab('live');
      }, 800);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    }
  };

  const startLiveTradingNow = async () => {
    let selectedSymbols: string[] = [];
    if (platform === 'iqoption') {
      const assets = config.iqMarketType === 'otc' ? IQ_OPTION_ASSETS.otc : IQ_OPTION_ASSETS.binary;
      selectedSymbols = config.selectedIQAssets?.length > 0
        ? config.selectedIQAssets
        : assets.map(a => a.symbol);
    } else {
      selectedSymbols = config.selectedMT5Assets?.length > 0
        ? config.selectedMT5Assets
        : MT5_ASSETS.map(a => a.symbol);
    }
    const strategyDisplayToId: Record<string, string> = {
      'EMA + RSI': 'ema_rsi', 'MACD': 'macd', 'Bollinger Bands': 'bollinger',
      'RSI Divergence': 'rsi_divergence', 'Ichimoku Cloud': 'ichimoku',
      'Swing Trading': 'ema_rsi', 'Grid Trading': 'ema_rsi', 'Trend Following': 'ema_rsi',
    };
    const rawStrats = platform === 'iqoption' ? config.iqStrategies : config.mt5Strategies;
    const mappedStrategies = rawStrats
      .map((s: string) => strategyDisplayToId[s] || s.toLowerCase().replace(/[^a-z0-9]/g, '_'))
      .filter((s: string, i: number, arr: string[]) => arr.indexOf(s) === i);

    await api.startLiveTrading({
      mode: tradingMode,
      platform,
      symbols: selectedSymbols,
      strategies: mappedStrategies,
      amount: config.betAmount || 10,
      min_confidence: config.minConfidence || 68,
      expiration: config.expiration || 5,
      max_concurrent: config.maxConcurrentTrades || 1,
      max_daily_trades: config.maxDailyTrades || 10,
    });
    setIsTrading(true);
    toast.success(`Trading iniciado - Escaneando ${selectedSymbols.length} activos`);
    refreshSignals();
    refreshTrades();
  };

  const handleToggleTrading = async () => {
    try {
      if (isTrading) {
        toast.loading('Deteniendo trading...', { id: 'stop-trading' });
        const result = await api.stopLiveTrading();
        console.log('Stop result:', result);
        setIsTrading(false);
        setLiveStatus(prev => prev ? { ...prev, is_running: false, is_scanning: false } : null);
        setTimeout(() => { fetchLiveStatus(); }, 500);
        toast.success('Trading detenido correctamente', { id: 'stop-trading' });
        return;
      }

      // Antes de iniciar, validar backtesting de cada estrategia activa.
      // Si alguna no cumple los mínimos (≥100 señales, ≥55% win rate, P&L positivo)
      // se muestra un modal de confirmación para que el usuario decida.
      const activeStrats = platform === 'iqoption' ? config.iqStrategies : config.mt5Strategies;
      const strategyDisplayToId: Record<string, string> = {
        'EMA + RSI': 'ema_rsi', 'MACD': 'macd', 'Bollinger Bands': 'bollinger',
        'RSI Divergence': 'rsi_divergence', 'Ichimoku Cloud': 'ichimoku',
        'Swing Trading': 'ema_rsi', 'Grid Trading': 'ema_rsi', 'Trend Following': 'ema_rsi',
      };
      const failing: Array<{ name: string; summary: any }> = [];
      for (const display of (activeStrats || [])) {
        const id = strategyDisplayToId[display] || display.toLowerCase().replace(/[^a-z0-9]/g, '_');
        try {
          const r = await api.getBacktestingSummary(id);
          const checks = r.checks || {};
          const summary = r.summary || {};
          if (checks.meets_all !== true) {
            failing.push({
              name: display,
              summary: {
                total_signals: summary.signals_total ?? 0,
                win_rate: summary.win_rate ?? 0,
                net_profit: summary.net_profit ?? 0,
                source: summary.source || 'none',
              },
            });
          }
        } catch (_) {
          failing.push({ name: display, summary: null });
        }
      }
      if (failing.length > 0) {
        setBacktestingGate({ failing });
        return;
      }

      await startLiveTradingNow();
    } catch (error: any) {
      toast.error(error.message || 'Error');
    }
  };

  // Estado del modal de advertencia de backtesting
  const [backtestingGate, setBacktestingGate] = useState<{ failing: Array<{ name: string; summary: any }> } | null>(null);

  const confirmStartDespiteBacktest = async () => {
    setBacktestingGate(null);
    try {
      await startLiveTradingNow();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    }
  };

  const refreshSignals = async () => {
    setIsScanning(true);
    try {
      // Get selected symbols based on platform and market type
      let symbolsToScan: string[] = [];
      if (platform === 'iqoption') {
        const assets = config.iqMarketType === 'otc' ? IQ_OPTION_ASSETS.otc : IQ_OPTION_ASSETS.binary;
        symbolsToScan = config.selectedIQAssets?.length > 0 
          ? config.selectedIQAssets 
          : assets.slice(0, 6).map(a => a.symbol);  // Default to first 6 assets
      } else {
        symbolsToScan = config.selectedMT5Assets?.length > 0 
          ? config.selectedMT5Assets 
          : MT5_ASSETS.slice(0, 6).map(a => a.symbol);
      }
      
      const result = await api.scanMarket({
        platform,
        symbols: symbolsToScan,
        strategies: platform === 'iqoption' ? config.iqStrategies : config.mt5Strategies
      });
      
      if (result.signals && result.signals.length > 0) {
        setSignals(result.signals.filter((s: Signal) => s.confidence >= 55));
      }
    } catch (error: any) {
      console.error('Scan error:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecuteSignal = async (signal: Signal) => {
    try {
      await api.executeLiveTrade({
        symbol: signal.symbol,
        direction: signal.direction,
        amount: config.betAmount || 10,
        strategy: signal.strategy,
        confidence: signal.confidence,
        indicators: signal.indicators,
        reasons: signal.reasons,
        platform: platform,
        account_type: iqAccountType,
        expiration: config.expiration || 5,
      });
      const brokerLabel = platform === 'mt5' ? 'MetaTrader 5' : 'IQ Option';
      const brokerConnected = platform === 'mt5' ? mt5Connected : iqConnected;
      if (!brokerConnected) {
        toast(`${signal.direction.toUpperCase()} ${signal.symbol} — Simulación local (${brokerLabel} no conectado)`, { icon: '🔸' });
      } else {
        toast.success(`✅ ${signal.direction.toUpperCase()} ${signal.symbol} ejecutado en ${brokerLabel}`);
      }
      setSignals(signals.filter(s => s !== signal));
      // Sequential: settle first, then read results
      await pollLiveData();
    } catch (error: any) {
      toast.error(error.message || 'Error al ejecutar');
    }
  };

  const handleIgnoreSignal = (signal: Signal) => {
    setSignals(signals.filter(s => s !== signal));
    toast('Señal ignorada', { icon: '👋' });
  };

  

  const handleRunBacktest = async (params: any) => {
    setIsBacktesting(true);
    setBacktestError(null);
    try {
      const response = await api.runAutoBacktest(params);
      // The backend returns { status, result_id, result: { metrics, trades,
      // equity_curve, monthly_pnl, ...data_info } }. Persist the complete
      // payload so the UI can render KPIs, equity curve and trade history.
      const payload: BacktestResult | null = response?.result || response?.results || null;
      if (payload && payload.metrics) {
        setBacktestResult(payload);
        toast.success(
          `Backtest listo · ${payload.metrics.total_trades} ops · WR ${payload.metrics.win_rate.toFixed(1)}%`
        );
      } else {
        const msg = 'El backtest no devolvió datos válidos';
        setBacktestError(msg);
        toast.error(msg);
      }
    } catch (error: any) {
      // Surface the backend message verbatim so the user knows whether the
      // problem is the symbol, the timeframe, the date range, or the source.
      const msg = error?.message || 'Error en backtest';
      setBacktestError(msg);
      toast.error(msg, { duration: 7000 });
    } finally {
      setIsBacktesting(false);
    }
  };

  const tabs = [
    { id: 'config' as const, name: 'Configuración', icon: Settings },
    { id: 'live' as const, name: 'Trading en Vivo', icon: Activity },
    { id: 'backtest' as const, name: 'Backtesting', icon: BarChart3 }
  ];

  const sideNavItems = [
    { id: 'dashboard'  as const, icon: 'dashboard',          label: 'Dashboard'        },
    { id: 'platforms'  as const, icon: 'hub',                label: 'Plataformas'      },
    { id: 'live'       as const, icon: 'candlestick_chart',  label: 'Trading en Vivo'  },
    { id: 'backtest'   as const, icon: 'analytics',          label: 'Backtesting'      },
    { id: 'config'     as const, icon: 'settings',           label: 'Configuración'    },
  ];

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-[#191c1e]">

      {/* ── Top App Bar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white/80 backdrop-blur-md border-b border-[#c4c6d0]/40 shadow-sm">
        <div className="flex items-center justify-between h-full px-6 max-w-full">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#3F5C8C] rounded-lg flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-base font-bold text-[#3F5C8C] leading-none">AI Trading System</p>
              <p className="text-[10px] text-[#4e6073] mt-0.5">Multi-Platform Trading Bot</p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Connection pill */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              iqConnected || mt5Connected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${iqConnected || mt5Connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {iqConnected || mt5Connected
                ? `${iqConnected ? 'IQ' : ''}${iqConnected && mt5Connected ? ' + ' : ''}${mt5Connected ? 'MT5' : ''} Conectado`
                : 'Desconectado'}
            </div>

            {/* Trading status pill */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isTrading
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isTrading ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
              {isTrading ? 'Activo' : 'Detenido'}
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              {theme === 'dark'
                ? <Sun className="w-4 h-4 text-yellow-500" />
                : <Moon className="w-4 h-4 text-[#3F5C8C]" />}
            </button>

            {/* Bell */}
            <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
              <Bell className="w-4 h-4 text-[#3F5C8C]" />
              {signals.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                  {signals.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex fixed left-0 top-16 h-[calc(100vh-64px)] w-60 bg-white border-r border-[#c4c6d0]/40 flex-col z-40 shadow-sm">

        {/* Account status card */}
        <div className="p-5 border-b border-[#c4c6d0]/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d6e3ff] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#3F5C8C]" style={{ fontVariationSettings: "'FILL' 1", fontSize: '20px' }}>account_balance</span>
            </div>
            <div>
              <p className="text-xs font-bold text-[#191c1e] uppercase tracking-wide">Institutional Desk</p>
              <p className="text-[10px] text-[#4e6073]">v4.2.0</p>
            </div>
          </div>
          <div className="space-y-2">
            {iqConnected && (
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  <span className="text-[11px] font-bold text-emerald-700">IQ Option</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700">${iqBalance.toFixed(0)}</span>
              </div>
            )}
            {mt5Connected && (
              <div className="flex items-center justify-between px-3 py-2 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                  <span className="text-[11px] font-bold text-purple-700">MetaTrader 5</span>
                </div>
                <span className="text-[11px] font-semibold text-purple-700">${mt5Balance.toFixed(0)}</span>
              </div>
            )}
            {!iqConnected && !mt5Connected && (
              <button
                onClick={() => setConnectionModalOpen(true)}
                className="w-full py-2 bg-[#3F5C8C] text-white rounded-lg text-xs font-bold hover:bg-[#2d4a78] transition-colors"
              >
                Conectar Plataforma
              </button>
            )}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-3">
            {sideNavItems.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    activeTab === item.id
                      ? 'bg-[#3F5C8C] text-white shadow-sm shadow-[#3F5C8C]/30'
                      : 'text-[#4e6073] hover:bg-[#f2f4f6] hover:text-[#3F5C8C]'
                  }`}
                >
                  <span
                    className="material-symbols-outlined flex-shrink-0"
                    style={{ fontSize: '20px', fontVariationSettings: activeTab === item.id ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Connect/Start button */}
        <div className="p-4 border-t border-[#c4c6d0]/30">
          <button
            onClick={handleToggleTrading}
            className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              isTrading
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : 'bg-[#3F5C8C] text-white hover:bg-[#2d4a78] shadow-sm'
            }`}
          >
            {isTrading ? 'Detener Trading' : 'Iniciar Operativa'}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="md:ml-60 pt-16 min-h-screen">
        <div className="p-6">
          {activeTab === 'dashboard' && (
            <DashboardOverviewTab
              iqConnected={iqConnected}
              mt5Connected={mt5Connected}
              iqBalance={iqBalance}
              mt5Balance={mt5Balance}
              recentTrades={recentTrades}
              onNavigate={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'platforms' && (
            <PlatformsHubTab
              iqConnected={iqConnected}
              mt5Connected={mt5Connected}
              iqBalance={iqBalance}
              mt5Balance={mt5Balance}
              onConnectIQ={handleConnectIQ}
              onConnectMT5={handleConnectMT5}
              onOpenConnectionModal={() => setConnectionModalOpen(true)}
            />
          )}

          {activeTab === 'config' && (
            <ConfigurationTab
              iqConnected={iqConnected}
              mt5Connected={mt5Connected}
              iqBalance={iqBalance}
              mt5Balance={mt5Balance}
              onConnectIQ={handleConnectIQ}
              onConnectMT5={handleConnectMT5}
              config={config}
              onConfigChange={setConfig}
              onSaveConfig={handleSaveConfig}
              configPlatform={configPlatform}
              onConfigPlatformChange={setConfigPlatform}
            />
          )}

          {activeTab === 'live' && (
            <LiveTradingTab
              platform={platform}
              setPlatform={setPlatform}
              tradingMode={tradingMode}
              setTradingMode={setTradingMode}
              isTrading={isTrading}
              onToggleTrading={handleToggleTrading}
              liveStatus={liveStatus}
              signals={signals}
              recentTrades={recentTrades}
              onExecuteSignal={handleExecuteSignal}
              onIgnoreSignal={handleIgnoreSignal}
              onRefreshSignals={refreshSignals}
              isScanning={isScanning}
              selectedSymbol={selectedSymbol}
              onSymbolChange={setSelectedSymbol}
              marketType={config.iqMarketType}
              onMarketTypeChange={(type) => setConfig({ ...config, iqMarketType: type })}
              selectedAssets={platform === 'iqoption' ? config.selectedIQAssets : config.selectedMT5Assets}
              configStrategies={platform === 'iqoption' ? config.iqStrategies : config.mt5Strategies}
              configIndicators={{
                emaFast: config.emaFast,
                emaSlow: config.emaSlow,
                rsiPeriod: config.rsiPeriod
              }}
              iqConnected={iqConnected}
              mt5Connected={mt5Connected}
              activeSessions={config.activeSessions || []}
              onOpenConnectionModal={() => setConnectionModalOpen(true)}
            />
          )}

          {activeTab === 'backtest' && (
            <BacktestingTab
              strategies={['ema_rsi', 'macd', 'bollinger', 'ichimoku', 'rsi_divergence']}
              onRunBacktest={handleRunBacktest}
              result={backtestResult}
              isRunning={isBacktesting}
              errorMessage={backtestError}
              platform={platform}
              marketType={config.iqMarketType}
              selectedLiveAssets={platform === 'iqoption' ? config.selectedIQAssets : config.selectedMT5Assets}
            />
          )}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-20 bg-white/90 backdrop-blur-md border-t border-[#c4c6d0]/30 rounded-t-2xl shadow-sm flex justify-around items-center px-4">
        {sideNavItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === item.id ? 'text-[#3F5C8C]' : 'text-slate-400 hover:text-[#3F5C8C]'
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', fontVariationSettings: activeTab === item.id ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            <span className="text-[10px] font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Connection Modal ── */}
      <ConnectionModal
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        platform={connectionPlatform}
        onSuccess={handleConnectionSuccess}
      />

      {/* ── Modal de advertencia de backtesting ── */}
      {backtestingGate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="p-6 border-b border-amber-200 bg-amber-50">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
                <div>
                  <h3 className="text-lg font-bold text-[#191c1e]">Estrategias sin backtesting suficiente</h3>
                  <p className="text-sm text-[#43474f]">
                    Algunas estrategias no cumplen los mínimos recomendados (≥100 señales, ≥55% win rate, P&amp;L positivo).
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-3 max-h-72 overflow-y-auto">
              {backtestingGate.failing.map((f, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <p className="text-sm font-bold text-[#191c1e]">{f.name}</p>
                  {f.summary ? (
                    <ul className="text-xs text-[#43474f] mt-1 grid grid-cols-3 gap-2">
                      <li>Señales: <strong>{f.summary.total_signals ?? f.summary.total_trades ?? 0}</strong></li>
                      <li>Win rate: <strong>{Number(f.summary.win_rate ?? 0).toFixed(1)}%</strong></li>
                      <li>P&amp;L: <strong>${Number(f.summary.net_profit ?? 0).toFixed(2)}</strong></li>
                    </ul>
                  ) : (
                    <p className="text-xs text-[#43474f] mt-1">Sin datos de backtesting registrados.</p>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50 flex items-center justify-end gap-2 border-t border-slate-200">
              <button
                onClick={() => setBacktestingGate(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#191c1e] bg-white border border-slate-300 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmStartDespiteBacktest}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700"
              >
                Activar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Trading Assistant ── */}
      <TradingAssistant
        recentTrades={recentTrades}
        isTrading={isTrading}
      />
    </div>
  );
};

export default TradingDashboard;
