'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, Settings, TrendingUp, BarChart3, Bot, Bell, Clock, 
  AlertTriangle, Play, Pause, DollarSign, TrendingDown, Eye, Zap,
  RefreshCw, X, Check, ChevronDown, Shield, Calendar, Wifi, WifiOff,
  Sun, Moon, Globe, Coins, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import LightweightProChart from '../charts/LightweightProChart';
import ConnectionModal from './ConnectionModal';
import TradingAssistant from '../assistant/TradingAssistant';
import { useTheme } from '../../context/ThemeContext';

// IQ Option available assets by market type
const IQ_OPTION_ASSETS = {
  binary: [
    { symbol: 'EURUSD', name: 'EUR/USD', type: 'forex' },
    { symbol: 'GBPUSD', name: 'GBP/USD', type: 'forex' },
    { symbol: 'USDJPY', name: 'USD/JPY', type: 'forex' },
    { symbol: 'AUDUSD', name: 'AUD/USD', type: 'forex' },
    { symbol: 'EURJPY', name: 'EUR/JPY', type: 'forex' },
    { symbol: 'GBPJPY', name: 'GBP/JPY', type: 'forex' },
    { symbol: 'USDCHF', name: 'USD/CHF', type: 'forex' },
    { symbol: 'EURGBP', name: 'EUR/GBP', type: 'forex' },
    { symbol: 'USDCAD', name: 'USD/CAD', type: 'forex' },
    { symbol: 'NZDUSD', name: 'NZD/USD', type: 'forex' },
  ],
  otc: [
    { symbol: 'EURUSD-OTC', name: 'EUR/USD OTC', type: 'otc' },
    { symbol: 'GBPUSD-OTC', name: 'GBP/USD OTC', type: 'otc' },
    { symbol: 'USDJPY-OTC', name: 'USD/JPY OTC', type: 'otc' },
    { symbol: 'AUDUSD-OTC', name: 'AUD/USD OTC', type: 'otc' },
    { symbol: 'EURJPY-OTC', name: 'EUR/JPY OTC', type: 'otc' },
    { symbol: 'GBPJPY-OTC', name: 'GBP/JPY OTC', type: 'otc' },
    { symbol: 'NZDUSD-OTC', name: 'NZD/USD OTC', type: 'otc' },
    { symbol: 'EURGBP-OTC', name: 'EUR/GBP OTC', type: 'otc' },
  ]
};

const MT5_ASSETS = [
  { symbol: 'EURUSD', name: 'EUR/USD', type: 'forex' },
  { symbol: 'GBPUSD', name: 'GBP/USD', type: 'forex' },
  { symbol: 'USDJPY', name: 'USD/JPY', type: 'forex' },
  { symbol: 'XAUUSD', name: 'Gold', type: 'commodity' },
  { symbol: 'XAGUSD', name: 'Silver', type: 'commodity' },
  { symbol: 'US30', name: 'Dow Jones', type: 'index' },
  { symbol: 'NAS100', name: 'NASDAQ', type: 'index' },
  { symbol: 'SPX500', name: 'S&P 500', type: 'index' },
  { symbol: 'BTCUSD', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETHUSD', name: 'Ethereum', type: 'crypto' },
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

interface BacktestResult {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  max_drawdown: number;
  sharpe_ratio?: number;
  profit_factor?: number;
}

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
}> = ({ 
  iqConnected, mt5Connected, iqBalance, mt5Balance,
  onConnectIQ, onConnectMT5, config, onConfigChange, onSaveConfig
}) => {
  const sessions = ['Londres', 'Nueva York', 'Tokio', 'Sydney'];
  
  // Get available assets based on market type
  const getIQAssets = () => {
    return config.iqMarketType === 'otc' ? IQ_OPTION_ASSETS.otc : IQ_OPTION_ASSETS.binary;
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Plataformas Conectadas */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          Plataformas Conectadas
        </h3>
        <div className="space-y-3">
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">IQ Option</span>
              <div className={`w-2 h-2 rounded-full ${iqConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <p className="text-xs text-slate-400">Opciones Binarias & OTC</p>
            {iqConnected ? (
              <p className="text-sm text-slate-300 mt-1">Balance: ${iqBalance.toFixed(2)}</p>
            ) : (
              <button 
                onClick={onConnectIQ}
                className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
              >
                Conectar
              </button>
            )}
          </div>
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">MetaTrader 5</span>
              <div className={`w-2 h-2 rounded-full ${mt5Connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <p className="text-xs text-slate-400">Forex & CFDs</p>
            {mt5Connected ? (
              <p className="text-sm text-slate-300 mt-1">Balance: ${mt5Balance.toFixed(2)}</p>
            ) : (
              <button 
                onClick={onConnectMT5}
                className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
              >
                Conectar
              </button>
            )}
          </div>
        </div>
        
        {/* IQ Option Market Type Selector */}
        <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Tipo de Mercado IQ Option
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => onConfigChange({ ...config, iqMarketType: 'binary' })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                config.iqMarketType !== 'otc'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Binarias
            </button>
            <button
              onClick={() => onConfigChange({ ...config, iqMarketType: 'otc' })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                config.iqMarketType === 'otc'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              OTC
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {config.iqMarketType === 'otc' 
              ? '⚠️ OTC: Mercado disponible 24/7, mayor volatilidad'
              : '✓ Binarias: Mercado estándar con horario de mercado'}
          </p>
        </div>
      </div>

      {/* Gestión de Riesgo */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-orange-500" />
          Gestión de Riesgo
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Riesgo por Trade (%)</label>
            <input 
              type="range" 
              min="1" 
              max="5" 
              value={config.riskPerTrade || 2}
              onChange={(e) => onConfigChange({ ...config, riskPerTrade: parseInt(e.target.value) })}
              className="w-full accent-blue-500" 
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>1%</span>
              <span className="text-blue-400 font-medium">{config.riskPerTrade || 2}%</span>
              <span>5%</span>
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Trades Simultáneos</label>
            <input 
              type="number" 
              value={config.maxConcurrentTrades || 3}
              onChange={(e) => onConfigChange({ ...config, maxConcurrentTrades: parseInt(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" 
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Máximo Trades Diarios</label>
            <input 
              type="number" 
              value={config.maxDailyTrades || 50}
              onChange={(e) => onConfigChange({ ...config, maxDailyTrades: parseInt(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" 
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Stop Loss Automático</label>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={config.autoStopLoss !== false}
                onChange={(e) => onConfigChange({ ...config, autoStopLoss: e.target.checked })}
                className="w-4 h-4 accent-blue-500" 
              />
              <span className="text-sm">Activado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Horarios y Noticias */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          Horarios & Noticias
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Sesiones Activas</label>
            <div className="space-y-2">
              {sessions.map(session => (
                <label key={session} className="flex items-center gap-2 text-sm">
                  <input 
                    type="checkbox" 
                    checked={config.activeSessions?.includes(session) ?? true}
                    onChange={(e) => {
                      const current = config.activeSessions || sessions;
                      const updated = e.target.checked 
                        ? [...current, session]
                        : current.filter((s: string) => s !== session);
                      onConfigChange({ ...config, activeSessions: updated });
                    }}
                    className="w-4 h-4 accent-blue-500" 
                  />
                  {session}
                </label>
              ))}
            </div>
          </div>
          <div className="pt-3 border-t border-slate-700">
            <label className="text-sm text-slate-400 block mb-2">Filtro de Noticias</label>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={config.pauseOnNews !== false}
                onChange={(e) => onConfigChange({ ...config, pauseOnNews: e.target.checked })}
                className="w-4 h-4 accent-blue-500" 
              />
              <span className="text-sm">Pausar ante alto impacto</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              <Calendar className="w-3 h-3 inline mr-1" />
              Próximo evento: Cargando...
            </p>
          </div>
        </div>
        
        <button 
          onClick={onSaveConfig}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Guardar Configuración
        </button>
      </div>

      {/* Parámetros de Trading */}
      <div className="lg:col-span-3 bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-500" />
          Parámetros de Trading
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Monto por Operación ($)</label>
            <input 
              type="number" 
              min="1"
              step="1"
              value={config.betAmount || 10}
              onChange={(e) => onConfigChange({ ...config, betAmount: parseFloat(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" 
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Take Profit (%)</label>
            <input 
              type="number" 
              min="1"
              max="100"
              value={config.takeProfit || 80}
              onChange={(e) => onConfigChange({ ...config, takeProfit: parseFloat(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" 
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Stop Loss (%)</label>
            <input 
              type="number" 
              min="1"
              max="100"
              value={config.stopLoss || 100}
              onChange={(e) => onConfigChange({ ...config, stopLoss: parseFloat(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" 
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Expiración (minutos)</label>
            <select 
              value={config.expiration || 5}
              onChange={(e) => onConfigChange({ ...config, expiration: parseInt(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="1">1 minuto</option>
              <option value="5">5 minutos</option>
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
            </select>
          </div>
        </div>
      </div>

      {/* Estrategias por Plataforma */}
      <div className="lg:col-span-3 bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-500" />
          Estrategias por Plataforma
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IQ Option Strategies */}
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 className="font-medium mb-3 text-blue-400">IQ Option (Binarias)</h4>
            <div className="space-y-2 mb-4">
              {['EMA + RSI', 'MACD', 'Bollinger Bands', 'RSI Divergence'].map(strategy => (
                <label key={strategy} className="flex items-center gap-2 text-sm">
                  <input 
                    type="checkbox" 
                    checked={config.iqStrategies?.includes(strategy) || false}
                    onChange={(e) => {
                      const current = config.iqStrategies || [];
                      const updated = e.target.checked 
                        ? [...current, strategy]
                        : current.filter((s: string) => s !== strategy);
                      onConfigChange({ ...config, iqStrategies: updated });
                    }}
                    className="w-4 h-4 accent-blue-500" 
                  />
                  {strategy}
                </label>
              ))}
            </div>
            
            {/* IQ Option Strategy Parameters */}
            <div className="pt-3 border-t border-slate-700 space-y-3">
              <h5 className="text-xs font-medium text-slate-400 uppercase">Parámetros de Indicadores</h5>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">EMA Rápida</label>
                  <input 
                    type="number" 
                    min="2"
                    max="50"
                    value={config.emaFast || 9}
                    onChange={(e) => onConfigChange({ ...config, emaFast: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">EMA Lenta</label>
                  <input 
                    type="number" 
                    min="5"
                    max="200"
                    value={config.emaSlow || 21}
                    onChange={(e) => onConfigChange({ ...config, emaSlow: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">RSI Período</label>
                  <input 
                    type="number" 
                    min="2"
                    max="50"
                    value={config.rsiPeriod || 14}
                    onChange={(e) => onConfigChange({ ...config, rsiPeriod: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">RSI Sobrecompra</label>
                  <input 
                    type="number" 
                    min="50"
                    max="90"
                    value={config.rsiOverbought || 70}
                    onChange={(e) => onConfigChange({ ...config, rsiOverbought: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">RSI Sobreventa</label>
                  <input 
                    type="number" 
                    min="10"
                    max="50"
                    value={config.rsiOversold || 30}
                    onChange={(e) => onConfigChange({ ...config, rsiOversold: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Confianza Mín (%)</label>
                  <input 
                    type="number" 
                    min="50"
                    max="95"
                    value={config.minConfidence || 65}
                    onChange={(e) => onConfigChange({ ...config, minConfidence: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Timeframes: 1m, 5m, 15m</p>
          </div>
          
          {/* MT5 Strategies */}
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 className="font-medium mb-3 text-purple-400">MetaTrader 5 (Forex)</h4>
            <div className="space-y-2 mb-4">
              {['Ichimoku Cloud', 'Swing Trading', 'Grid Trading', 'Trend Following'].map(strategy => (
                <label key={strategy} className="flex items-center gap-2 text-sm">
                  <input 
                    type="checkbox" 
                    checked={config.mt5Strategies?.includes(strategy) || false}
                    onChange={(e) => {
                      const current = config.mt5Strategies || [];
                      const updated = e.target.checked 
                        ? [...current, strategy]
                        : current.filter((s: string) => s !== strategy);
                      onConfigChange({ ...config, mt5Strategies: updated });
                    }}
                    className="w-4 h-4 accent-purple-500" 
                  />
                  {strategy}
                </label>
              ))}
            </div>
            
            {/* MT5 Strategy Parameters */}
            <div className="pt-3 border-t border-slate-700 space-y-3">
              <h5 className="text-xs font-medium text-slate-400 uppercase">Parámetros de Trading</h5>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Lot Size</label>
                  <input 
                    type="number" 
                    min="0.01"
                    max="10"
                    step="0.01"
                    value={config.mt5LotSize || 0.1}
                    onChange={(e) => onConfigChange({ ...config, mt5LotSize: parseFloat(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Stop Loss (pips)</label>
                  <input 
                    type="number" 
                    min="5"
                    max="500"
                    value={config.mt5StopLoss || 50}
                    onChange={(e) => onConfigChange({ ...config, mt5StopLoss: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Take Profit (pips)</label>
                  <input 
                    type="number" 
                    min="5"
                    max="500"
                    value={config.mt5TakeProfit || 100}
                    onChange={(e) => onConfigChange({ ...config, mt5TakeProfit: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Max Spread (pips)</label>
                  <input 
                    type="number" 
                    min="1"
                    max="50"
                    value={config.mt5MaxSpread || 3}
                    onChange={(e) => onConfigChange({ ...config, mt5MaxSpread: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs" 
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Timeframes: 1H, 4H, 1D</p>
          </div>
        </div>
      </div>

      {/* Selección de Activos */}
      <div className="lg:col-span-3 bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Coins className="w-5 h-5 text-yellow-500" />
          Activos a Operar
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IQ Option Assets */}
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 className="font-medium mb-3 text-blue-400">
              IQ Option - {config.iqMarketType === 'otc' ? 'OTC' : 'Binarias'}
            </h4>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {getIQAssets().map(asset => (
                <label key={asset.symbol} className="flex items-center gap-2 text-sm p-2 bg-slate-800 rounded hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.selectedIQAssets?.includes(asset.symbol) ?? true}
                    onChange={(e) => {
                      const current = config.selectedIQAssets || getIQAssets().map(a => a.symbol);
                      const updated = e.target.checked 
                        ? [...current, asset.symbol]
                        : current.filter((s: string) => s !== asset.symbol);
                      onConfigChange({ ...config, selectedIQAssets: updated });
                    }}
                    className="w-4 h-4 accent-blue-500" 
                  />
                  <span className="truncate">{asset.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {(config.selectedIQAssets?.length || getIQAssets().length)} activos seleccionados
            </p>
          </div>
          
          {/* MT5 Assets */}
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <h4 className="font-medium mb-3 text-purple-400">MetaTrader 5</h4>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {MT5_ASSETS.map(asset => (
                <label key={asset.symbol} className="flex items-center gap-2 text-sm p-2 bg-slate-800 rounded hover:bg-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.selectedMT5Assets?.includes(asset.symbol) ?? true}
                    onChange={(e) => {
                      const current = config.selectedMT5Assets || MT5_ASSETS.map(a => a.symbol);
                      const updated = e.target.checked 
                        ? [...current, asset.symbol]
                        : current.filter((s: string) => s !== asset.symbol);
                      onConfigChange({ ...config, selectedMT5Assets: updated });
                    }}
                    className="w-4 h-4 accent-purple-500" 
                  />
                  <span className="truncate">{asset.name}</span>
                  <span className="text-xs text-slate-500 ml-auto">{asset.type}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {(config.selectedMT5Assets?.length || MT5_ASSETS.length)} activos seleccionados
            </p>
          </div>
        </div>
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
}> = ({
  platform, setPlatform, tradingMode, setTradingMode,
  isTrading, onToggleTrading, liveStatus, signals, recentTrades,
  onExecuteSignal, onIgnoreSignal, onRefreshSignals, isScanning,
  selectedSymbol, onSymbolChange, marketType, onMarketTypeChange, selectedAssets,
  configStrategies, configIndicators, iqConnected, mt5Connected
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

  const loadCandles = async (sym: string, tf: string, count: number) => {
    const normalizedSymbol = sym.replace('-OTC', '');
    try {
      // Use unified endpoint; it auto-connects to demo if no platform connection is active
      const res = await api.getCandles(normalizedSymbol, tf, count);
      return res.data || [];
    } catch (e) {
      // Fallback: try MT5 endpoint (may require active MT5 connection)
      try {
        const res = await api.getMT5HistoricalData(normalizedSymbol, tf, count);
        return res.data || [];
      } catch {
        return [];
      }
    }
  };

  const startOfTodayIso = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
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
        toast.error('Debes conectar IQ Option para usar el modo automático');
        // Open modal instead
        setConnectionModalOpen(true);
        return;
      }
      if (platform === 'mt5' && !mt5Connected) {
        toast.error('Debes conectar MT5 para usar el modo automático');
        setConnectionModalOpen(true);
        return;
      }
    }
    setTradingMode(mode);
  };

  // Start trading handler
  const handleToggleTrading = async () => {
    if (!isTrading) {
      // Validation before starting
      if (tradingMode === 'auto') {
        if (platform === 'iqoption' && !iqConnected) {
          toast.error('Conecta IQ Option primero');
          return;
        }
      }
    }
    onToggleTrading();
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setPlatform('iqoption')}
                className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                  platform === 'iqoption' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                IQ Option
                <div className={`w-2 h-2 rounded-full ${iqConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              </button>
              <button
                onClick={() => setPlatform('mt5')}
                className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                  platform === 'mt5' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                MetaTrader 5
                <div className={`w-2 h-2 rounded-full ${mt5Connected ? 'bg-green-400' : 'bg-red-400'}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-2 bg-slate-900 rounded-lg p-1">
              <button
                onClick={() => handleModeChange('auto')}
                className={`px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-1 ${
                  tradingMode === 'auto' ? 'bg-purple-600' : 'hover:bg-slate-700'
                }`}
              >
                <Bot className="w-4 h-4" />
                Automático
              </button>
              <button
                onClick={() => handleModeChange('manual')}
                className={`px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-1 ${
                  tradingMode === 'manual' ? 'bg-purple-600' : 'hover:bg-slate-700'
                }`}
              >
                <Eye className="w-4 h-4" />
                Manual
              </button>
            </div>

            <button
              onClick={handleToggleTrading}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                isTrading
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isTrading ? (
                <>
                  <Pause className="w-4 h-4" />
                  Detener
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Iniciar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">Balance</p>
            <p className="text-2xl font-bold text-blue-400">
              ${(liveStatus?.balance || 0).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500">{platform === 'iqoption' ? 'IQ Option' : 'MT5'}</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">P&L Hoy</p>
            <p className={`text-2xl font-bold ${(liveStatus?.total_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(liveStatus?.total_pnl || 0) >= 0 ? '+' : ''}${(liveStatus?.total_pnl || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">Win Rate</p>
            <p className="text-2xl font-bold">{winRate.toFixed(1)}%</p>
            <p className="text-xs text-slate-500">
              {liveStatus?.winning_trades || 0} de {liveStatus?.total_trades || 0} trades
            </p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">Operaciones Hoy</p>
            <p className="text-2xl font-bold">{liveStatus?.total_trades || 0}</p>
            <p className="text-xs text-slate-500">{liveStatus?.active_trades?.length || 0} activas</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-sm text-slate-400 mb-1">Modo</p>
            <p className="text-2xl font-bold capitalize">{tradingMode}</p>
            <p className="text-xs text-slate-500">
              {liveStatus?.is_scanning ? '🔄 Escaneando...' : liveStatus?.is_running ? '✓ Activo' : '⏸ Detenido'}
            </p>
          </div>
        </div>
      </div>

      {/* Trading View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Area - Multiple Charts for Selected Assets */}
        <div className="lg:col-span-2 space-y-4">
          {/* Global Chart Controls */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                Gráficos en Vivo ({availableSymbols.filter(a => visibleCharts[a.symbol] !== false).length} activos)
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const newState = !showAllCharts;
                    setShowAllCharts(newState);
                    const updated: Record<string, boolean> = {};
                    availableSymbols.forEach(a => { updated[a.symbol] = newState; });
                    setVisibleCharts(updated);
                  }}
                  className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded"
                >
                  {showAllCharts ? 'Ocultar Todos' : 'Mostrar Todos'}
                </button>
                <div className="flex gap-2">
                  {(platform === 'iqoption' ? ['1m', '5m', '15m'] : ['1h', '4h', '1D']).map(tf => {
                    const tfNorm = (tf === '1D' ? '1d' : tf) as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
                    const active = chartTF === tfNorm;
                    return (
                      <button
                        key={tf}
                        onClick={() => setChartTF(tfNorm)}
                        className={`px-3 py-1 text-xs rounded transition-colors ${active ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
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
              <label className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded">
                <input type="checkbox" checked={indicators.showEMA} onChange={(e) => setIndicators(prev => ({ ...prev, showEMA: e.target.checked }))} />
                <span>EMA ({indicators.emaLength})</span>
              </label>
              <label className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded">
                <input type="checkbox" checked={indicators.showRSI} onChange={(e) => setIndicators(prev => ({ ...prev, showRSI: e.target.checked }))} />
                <span>RSI ({indicators.rsiLength})</span>
              </label>
              <label className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded">
                <input type="checkbox" checked={indicators.showMACD} onChange={(e) => setIndicators(prev => ({ ...prev, showMACD: e.target.checked }))} />
                <span>MACD</span>
              </label>
              <label className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded">
                <input type="checkbox" checked={indicators.showBollinger} onChange={(e) => setIndicators(prev => ({ ...prev, showBollinger: e.target.checked }))} />
                <span>Bollinger</span>
              </label>
            </div>
            {/* Asset visibility toggles */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <p className="text-xs text-slate-400 mb-2">Mostrar/Ocultar Activos:</p>
              <div className="flex flex-wrap gap-2">
                {availableSymbols.map(asset => (
                  <button
                    key={asset.symbol}
                    onClick={() => setVisibleCharts(prev => ({ ...prev, [asset.symbol]: !prev[asset.symbol] }))}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      visibleCharts[asset.symbol] !== false
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {asset.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Charts Container - Stacked Vertically with larger height */}
          <div className="space-y-4 max-h-[800px] overflow-y-auto">
            {availableSymbols
              .filter(asset => visibleCharts[asset.symbol] !== false)
              .map(asset => (
                <div key={asset.symbol} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{asset.name}</span>
                      <span className="text-xs text-slate-400">({asset.symbol})</span>
                    </div>
                    <button
                      onClick={() => setVisibleCharts(prev => ({ ...prev, [asset.symbol]: false }))}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                      title="Ocultar gráfico"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="h-96 bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
                    <LightweightProChart
                      symbol={asset.symbol}
                      platform={platform}
                      timeframe={chartTF}
                      height={384}
                      loadCandles={loadCandles}
                      candleCount={platform === 'iqoption' ? 400 : 500}
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
                      trades={(liveStatus?.active_trades || [])
                        .filter(t => {
                          const a = String(asset.symbol || '').replace('-OTC', '');
                          const s = String((t as any).symbol || '').replace('-OTC', '');
                          return a === s && typeof (t as any).entry_price === 'number';
                        })
                        .slice(0, 20)
                        .map(t => ({
                          time: Math.floor(new Date((t as any).timestamp).getTime() / 1000),
                          price: Number((t as any).entry_price),
                          direction: ((t as any).direction as 'call' | 'put') || 'call',
                          label: ((t as any).direction || '').toUpperCase(),
                        }))}
                    />
                  </div>
                </div>
              ))}
            {availableSymbols.filter(asset => visibleCharts[asset.symbol] !== false).length === 0 && (
              <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center">
                <BarChart3 className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400">No hay gráficos visibles</p>
                <p className="text-xs text-slate-500 mt-1">Selecciona activos en Configuración o usa los botones arriba</p>
              </div>
            )}
          </div>
        </div>

        {/* Signals & Trades */}
        <div className="space-y-4">
          {/* Active Signals */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Señales Activas
              </h3>
              <button 
                onClick={onRefreshSignals}
                disabled={isScanning}
                className="p-1 hover:bg-slate-700 rounded transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {signals.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  {isScanning ? 'Escaneando mercado...' : 'No hay señales activas'}
                </p>
              ) : (
                signals.map((signal, idx) => (
                  <div 
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      signal.direction === 'call' 
                        ? 'bg-green-900/30 border-green-700' 
                        : 'bg-red-900/30 border-red-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${
                        signal.direction === 'call' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {signal.symbol} {signal.direction.toUpperCase()}
                      </span>
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded">
                        {signal.confidence.toFixed(0)}% Conf.
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">
                      Estrategia: {signal.strategy}
                    </p>
                    {tradingMode === 'manual' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            if (platform === 'iqoption' && !iqConnected) {
                              toast.error('Conecta IQ Option para ejecutar');
                              return;
                            }
                            if (platform === 'mt5' && !mt5Connected) {
                              toast.error('Conecta MT5 para ejecutar');
                              return;
                            }
                            onExecuteSignal(signal);
                          }}
                          className={`flex-1 py-2 text-xs rounded transition-colors ${
                            (platform === 'iqoption' && !iqConnected) || (platform === 'mt5' && !mt5Connected)
                              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          }`}
                        >
                          Ejecutar
                        </button>
                        <button 
                          onClick={() => onIgnoreSignal(signal)}
                          className="flex-1 bg-slate-700 hover:bg-slate-600 py-2 text-xs rounded transition-colors"
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
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <h3 className="text-sm font-semibold mb-3">Operaciones Activas</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recentTrades.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Sin operaciones recientes</p>
              ) : (
                [...recentTrades]
                  .sort((a, b) => {
                    // Pending trades first
                    if (a.result === 'pending' && b.result !== 'pending') return -1;
                    if (a.result !== 'pending' && b.result === 'pending') return 1;
                    // Then by timestamp (newest first)
                    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
                  })
                  .slice(0, 10).map((trade, i) => (
                  <div key={i} className={`bg-slate-900 rounded-lg p-3 border ${
                    trade.result === 'pending' ? 'border-yellow-500/50' : 'border-slate-700'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${
                          trade.direction === 'call' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trade.direction?.toUpperCase()}
                        </span>
                        <span className="text-sm">{trade.symbol}</span>
                      </div>
                      <span className={`font-medium text-sm ${
                        trade.result === 'win' ? 'text-green-400' : 
                        trade.result === 'loss' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {trade.result === 'win' ? '✓ WIN' : 
                         trade.result === 'loss' ? '✗ LOSS' : 'ACTIVA'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        ${trade.amount?.toFixed(2)} • {new Date(trade.timestamp).toLocaleTimeString()}
                      </span>
                      {trade.result === 'pending' ? (
                        <CountdownTimer 
                          expirationTime={trade.expiration_time}
                          expirationMinutes={trade.expiration_minutes}
                          timestamp={trade.timestamp}
                        />
                      ) : (
                        <span className={trade.pnl && trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {trade.pnl ? (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) : '-'}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Operaciones del día */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold">
                  {showAllHistory ? 'Historial de Operaciones' : 'Operaciones del día'}
                </h3>
                <button
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    showAllHistory 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  {showAllHistory ? '📅 Ver solo hoy' : '📊 Ver todo'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchDailyTrades}
                  disabled={isDailyLoading}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isDailyLoading ? 'animate-spin' : ''}`} />
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
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Exportar CSV
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-slate-400">Símbolo</label>
                <select value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                  <option value="">Todos</option>
                  {availableSymbols.map(a => (
                    <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Resultado</label>
                <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                  <option value="">Todos</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Confianza mín</label>
                <input value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="e.g. 60" className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Confianza máx</label>
                <input value={maxConf} onChange={(e) => setMaxConf(e.target.value)} placeholder="e.g. 85" className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs" />
              </div>
              <div className="flex items-end">
                <button onClick={fetchDailyTrades} className="w-full px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded">Aplicar filtros</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left py-2">Hora</th>
                    <th className="text-left py-2">Símbolo</th>
                    <th className="text-left py-2">Dirección</th>
                    <th className="text-left py-2">Monto</th>
                    <th className="text-left py-2">Entrada</th>
                    <th className="text-left py-2">Salida</th>
                    <th className="text-left py-2">Resultado</th>
                    <th className="text-left py-2">PnL</th>
                    <th className="text-left py-2">Estrategia</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-6 text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <span>{showAllHistory ? 'No hay operaciones registradas' : 'Sin operaciones hoy'}</span>
                          {!showAllHistory && (
                            <button
                              onClick={() => setShowAllHistory(true)}
                              className="text-xs text-blue-400 hover:text-blue-300 underline"
                            >
                              Ver historial completo
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedTrades.map((t: Trade, idx: number) => (
                      <tr key={idx} className="border-t border-slate-700">
                        <td className="py-2">{new Date(t.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2">{t.symbol}</td>
                        <td className="py-2">{t.direction?.toUpperCase()}</td>
                        <td className="py-2">${t.amount?.toFixed ? t.amount.toFixed(2) : t.amount}</td>
                        <td className="py-2">{t.entry_price ?? '-'}</td>
                        <td className="py-2">{t.exit_price ?? '-'}</td>
                        <td className={`py-2 ${t.result === 'win' ? 'text-green-400' : t.result === 'loss' ? 'text-red-400' : 'text-yellow-400'}`}>{t.result || 'pending'}</td>
                        <td className="py-2">{typeof t.pnl === 'number' ? (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2) : '-'}</td>
                        <td className="py-2">{t.strategy_used || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-400">
                  Mostrando {((currentPage - 1) * TRADES_PER_PAGE) + 1}-{Math.min(currentPage * TRADES_PER_PAGE, dailyTrades.length)} de {dailyTrades.length} operaciones
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-slate-400">Página {currentPage} de {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Backtesting Tab Component
const BacktestingTab: React.FC<{
  strategies: string[];
  onRunBacktest: (params: any) => void;
  result: BacktestResult | null;
  isRunning: boolean;
}> = ({ strategies, onRunBacktest, result, isRunning }) => {
  const [selectedStrategy, setSelectedStrategy] = useState('ema_rsi');
  const [timeframe, setTimeframe] = useState('5m');
  const [period, setPeriod] = useState('1month');

  const handleRun = () => {
    onRunBacktest({
      strategy_name: selectedStrategy,
      timeframe,
      period,
      num_candles: period === '1month' ? 500 : period === '3months' ? 1500 : 3000
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Simulador de Estrategias</h3>
        
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Estrategia</label>
            <select 
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="ema_rsi">EMA + RSI</option>
              <option value="macd">MACD</option>
              <option value="bollinger">Bollinger Bands</option>
              <option value="ichimoku">Ichimoku Cloud</option>
              <option value="rsi_divergence">RSI Divergence</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Timeframe</label>
            <select 
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="1m">1 Minuto</option>
              <option value="5m">5 Minutos</option>
              <option value="15m">15 Minutos</option>
              <option value="1h">1 Hora</option>
              <option value="4h">4 Horas</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Período</label>
            <select 
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="1month">Último Mes</option>
              <option value="3months">3 Meses</option>
              <option value="6months">6 Meses</option>
            </select>
          </div>
          <div className="flex items-end">
            <button 
              onClick={handleRun}
              disabled={isRunning}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Ejecutando...
                </>
              ) : (
                'Ejecutar Test'
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Retorno Total</p>
              <p className={`text-xl font-bold ${result.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {result.total_pnl >= 0 ? '+' : ''}{((result.total_pnl / 1000) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Win Rate</p>
              <p className="text-xl font-bold">{result.win_rate.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Trades</p>
              <p className="text-xl font-bold">{result.total_trades}</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Profit Factor</p>
              <p className="text-xl font-bold">{result.profit_factor?.toFixed(2) || '-'}</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Max Drawdown</p>
              <p className="text-xl font-bold text-orange-500">-{result.max_drawdown.toFixed(1)}%</p>
            </div>
          </div>
        )}

        <div className="mt-6 h-64 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700">
          <div className="text-center">
            <BarChart3 className="w-16 h-16 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-500">Gráfico de Equity Curve</p>
            <p className="text-xs text-slate-600 mt-1">
              {result ? `${result.total_trades} operaciones analizadas` : 'Ejecuta un backtest para ver resultados'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const TradingDashboard: React.FC = () => {
  // Theme
  const { theme, toggleTheme } = useTheme();
  
  // State
  const [activeTab, setActiveTab] = useState<'config' | 'live' | 'backtest'>('live');
  const [platform, setPlatform] = useState<'iqoption' | 'mt5'>('iqoption');
  const [tradingMode, setTradingMode] = useState<'auto' | 'manual'>('manual');
  const [isTrading, setIsTrading] = useState(false);
  
  // Connection state
  const [iqConnected, setIqConnected] = useState(false);
  const [mt5Connected, setMt5Connected] = useState(false);
  const [iqBalance, setIqBalance] = useState(0);
  const [mt5Balance, setMt5Balance] = useState(0);
  
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
    // IQ Option Strategies (use backend identifiers)
    iqStrategies: ['ema_rsi', 'macd', 'bollinger'],
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    minConfidence: 65,
    // MT5 Strategies (use backend identifiers)
    mt5Strategies: ['ichimoku', 'ema_rsi'],
    mt5LotSize: 0.1,
    mt5StopLoss: 50,
    mt5TakeProfit: 100,
    mt5MaxSpread: 3,
    // Market Type & Assets
    iqMarketType: 'binary' as 'binary' | 'otc',
    selectedIQAssets: [] as string[],
    selectedMT5Assets: [] as string[]
  };

  // Config state - start with default, load from localStorage after mount to avoid hydration mismatch
  const [config, setConfig] = useState(defaultConfig);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load config from localStorage after mount (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('trading_config');
      if (saved) {
        setConfig(prev => ({ ...prev, ...JSON.parse(saved) }));
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
  const [isBacktesting, setIsBacktesting] = useState(false);
  
  // Modal state
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [connectionPlatform, setConnectionPlatform] = useState<'iqoption' | 'mt5'>('iqoption');

  // Check connection status on mount
  useEffect(() => {
    checkConnections();
    fetchLiveStatus();
  }, []);

  // Polling for live status - always poll when on live tab, more frequently when trading
  useEffect(() => {
    // Initial fetch when switching to live tab
    if (activeTab === 'live') {
      fetchLiveStatus();
      refreshTrades();
    }

    // Set up polling interval
    const pollInterval = isTrading ? 3000 : 10000; // 3s when trading, 10s otherwise
    const interval = setInterval(() => {
      if (activeTab === 'live') {
        fetchLiveStatus();
        refreshTrades();
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
        } catch (e) {
          // Balance fetch failed
        }
      }
    } catch (error) {
      // Not connected via direct check, try broker status
      try {
        const brokerStatus = await fetch('http://127.0.0.1:5000/api/broker/status');
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
      const res = await api.getLiveHistory(10);
      if (res.trades) {
        setRecentTrades(res.trades);
      }
    } catch (e) {
      // ignore
    }
  };

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
    } else {
      setMt5Connected(true);
      setMt5Balance(accountInfo.balance || accountInfo.equity || 0);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await api.saveRobotConfig(config);
      toast.success('Configuración guardada - Redirigiendo a Trading en Vivo');
      // Redirect to live trading tab after saving config
      setTimeout(() => {
        setActiveTab('live');
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar');
    }
  };

  const handleToggleTrading = async () => {
    try {
      if (isTrading) {
        toast.loading('Deteniendo trading...', { id: 'stop-trading' });
        const result = await api.stopLiveTrading();
        console.log('Stop result:', result);
        setIsTrading(false);
        setLiveStatus(prev => prev ? { ...prev, is_running: false, is_scanning: false } : null);
        // Force refresh status after short delay
        setTimeout(() => {
          fetchLiveStatus();
        }, 500);
        toast.success('Trading detenido correctamente', { id: 'stop-trading' });
      } else {
        // Get all selected symbols based on platform and market type
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
        
        await api.startLiveTrading({
          mode: tradingMode,
          platform,
          symbols: selectedSymbols,
          strategies: platform === 'iqoption' ? config.iqStrategies : config.mt5Strategies,
          amount: config.betAmount || 10,
          min_confidence: config.minConfidence || 60,
          expiration: config.expiration || 5
        });
        setIsTrading(true);
        toast.success(`Trading iniciado - Escaneando ${selectedSymbols.length} activos`);
        refreshSignals();
        refreshTrades();
      }
    } catch (error: any) {
      toast.error(error.message || 'Error');
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
        reasons: signal.reasons
      });
      toast.success(`Trade ${signal.direction.toUpperCase()} ejecutado en ${signal.symbol}`);
      setSignals(signals.filter(s => s !== signal));
      fetchLiveStatus();
      refreshTrades();
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
    try {
      const result = await api.runQuickBacktest(params);
      if (result.results) {
        setBacktestResult(result.results);
        toast.success('Backtest completado');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error en backtest');
    } finally {
      setIsBacktesting(false);
    }
  };

  const tabs = [
    { id: 'config' as const, name: 'Configuración', icon: Settings },
    { id: 'live' as const, name: 'Trading en Vivo', icon: Activity },
    { id: 'backtest' as const, name: 'Backtesting', icon: BarChart3 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">AI Trading System</h1>
                <p className="text-xs text-slate-400">Multi-Platform Trading Bot</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-sm">
                {iqConnected || mt5Connected ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span>{iqConnected ? 'IQ' : ''}{iqConnected && mt5Connected ? ' + ' : ''}{mt5Connected ? 'MT5' : ''}{!iqConnected && !mt5Connected ? 'Desconectado' : ''}</span>
              </div>
              
              {/* Trading Status */}
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${isTrading ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-sm">{isTrading ? 'Activo' : 'Detenido'}</span>
              </div>
              
              {/* Theme Toggle */}
              <button 
                onClick={toggleTheme}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-blue-500" />
                )}
              </button>
              
              <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5" />
                {signals.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center">
                    {signals.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 flex gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-800 text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
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
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestingTab
            strategies={['ema_rsi', 'macd', 'bollinger', 'ichimoku', 'rsi_divergence']}
            onRunBacktest={handleRunBacktest}
            result={backtestResult}
            isRunning={isBacktesting}
          />
        )}
      </main>

      {/* Connection Modal */}
      <ConnectionModal
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        platform={connectionPlatform}
        onSuccess={handleConnectionSuccess}
      />

      {/* AI Trading Assistant */}
      <TradingAssistant
        recentTrades={recentTrades}
        isTrading={isTrading}
      />
    </div>
  );
};

export default TradingDashboard;
