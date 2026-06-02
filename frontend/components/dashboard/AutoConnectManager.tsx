/**
 * AutoConnectManager Component
 * =============================
 * Panel para guardar credenciales de IQ Option/MT5 y configurar
 * la auto-conexion al iniciar el servidor.
 *
 * Incluye:
 * - Formulario de credenciales IQ Option
 * - Formulario de credenciales MT5
 * - Estado actual de conexion
 * - Boton de conexion inmediata
 * - Configuracion de auto-inicio del bot
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi, WifiOff, Eye, EyeOff, Shield, Zap, Save,
  Plug, PlugZap, RefreshCw, Check, X, Loader2, Trash2,
  Settings, Power, PowerOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getPublicApiBaseUrl } from '../../services/api';

const BASE_URL = getPublicApiBaseUrl();

interface PlatformStatus {
  connected: boolean;
  account_type?: string;
  balance?: number;
  error?: string | null;
  last_attempt?: string;
  email?: string;
  login?: string;
}

interface AutoConnectStatus {
  has_auto_connected: boolean;
  auto_start_bot: boolean;
  has_credentials: boolean;
  platforms: {
    iqoption: PlatformStatus;
    mt5: PlatformStatus;
    quotex: PlatformStatus;
  };
  current_iq_connected?: boolean;
}

const AutoConnectManager: React.FC = () => {
  // Estado
  const [status, setStatus] = useState<AutoConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showTab, setShowTab] = useState<'iqoption' | 'mt5'>('iqoption');
  const [showPassword, setShowPassword] = useState(false);

  // IQ Option credentials
  const [iqEmail, setIqEmail] = useState('');
  const [iqPassword, setIqPassword] = useState('');
  const [iqAccountType, setIqAccountType] = useState<'PRACTICE' | 'REAL'>('PRACTICE');

  // MT5 credentials
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const [mt5IsDemo, setMt5IsDemo] = useState(true);

  // Auto-start config
  const [autoStartBot, setAutoStartBot] = useState(false);
  const [botMode, setBotMode] = useState<'auto' | 'manual'>('auto');
  const [botSymbols, setBotSymbols] = useState('EURUSD,GBPUSD,USDJPY');
  const [botStrategies, setBotStrategies] = useState('ema_rsi');
  const [botAmount, setBotAmount] = useState(10);
  const [botConfidence, setBotConfidence] = useState(68);

  // Cargar estado
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auto-connect/status`);
      const data = await res.json();
      if (data.status === 'success') {
        setStatus(data.auto_connect);
      }
    } catch (e) {
      console.error('Error fetching auto-connect status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Guardar credenciales
  const handleSaveCredentials = async () => {
    if (!iqEmail && !iqPassword && !mt5Login) {
      toast.error('Completa al menos una plataforma (IQ Option o MT5)');
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        iqoption: {},
        mt5: {},
        auto_start_bot: autoStartBot,
        bot_config: {
          mode: botMode,
          symbols: botSymbols.split(',').map(s => s.trim()).filter(Boolean),
          strategies: botStrategies.split(',').map(s => s.trim()).filter(Boolean),
          amount: botAmount,
          min_confidence: botConfidence,
          expiration: 5,
          max_concurrent: 3,
          max_daily_trades: 50,
        },
      };

      if (iqEmail && iqPassword) {
        body.iqoption = {
          email: iqEmail,
          password: iqPassword,
          account_type: iqAccountType,
        };
      }

      if (mt5Login && mt5Password && mt5Server) {
        body.mt5 = {
          login: mt5Login,
          password: mt5Password,
          server: mt5Server,
          is_demo: mt5IsDemo,
        };
      }

      const res = await fetch(`${BASE_URL}/api/auto-connect/save-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Credenciales guardadas! Se conectaran al reiniciar.');
        fetchStatus();
      } else {
        toast.error(data.message || 'Error al guardar');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error de conexion');
    } finally {
      setSaving(false);
    }
  };

  // Conectar ahora
  const handleConnectNow = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auto-connect/connect-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_start_bot: autoStartBot,
          bot_config: {
            mode: botMode,
            symbols: botSymbols.split(',').map(s => s.trim()).filter(Boolean),
            strategies: botStrategies.split(',').map(s => s.trim()).filter(Boolean),
            amount: botAmount,
            min_confidence: botConfidence,
          },
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Conectando en segundo plano...');
        setTimeout(fetchStatus, 3000);
      } else {
        toast.error(data.message || 'Error al conectar');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error de conexion');
    } finally {
      setConnecting(false);
    }
  };

  // Desconectar
  const handleDisconnect = async () => {
    if (!confirm('Desconectar todas las plataformas?')) return;

    try {
      const res = await fetch(`${BASE_URL}/api/auto-connect/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_credentials: false }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Plataformas desconectadas');
        fetchStatus();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const iqConnected = status?.platforms?.iqoption?.connected || status?.current_iq_connected;
  const mt5Connected = status?.platforms?.mt5?.connected;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Conexion Automatica</h2>
              <p className="text-xs text-slate-500">
                Las credenciales se guardan cifradas y el sistema se conecta solo al iniciar
              </p>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
              iqConnected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}>
              {iqConnected ? (
                <><Wifi className="w-3 h-3" /> IQ Option</>
              ) : (
                <><WifiOff className="w-3 h-3" /> IQ Off</>
              )}
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
              mt5Connected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}>
              {mt5Connected ? (
                <><Wifi className="w-3 h-3" /> MT5</>
              ) : (
                <><WifiOff className="w-3 h-3" /> MT5 Off</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Platform selector tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setShowTab('iqoption')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              showTab === 'iqoption'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            IQ Option
          </button>
          <button
            onClick={() => setShowTab('mt5')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              showTab === 'mt5'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            MetaTrader 5
          </button>
        </div>

        {/* IQ Option Form */}
        {showTab === 'iqoption' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email de IQ Option
              </label>
              <input
                type="email"
                value={iqEmail}
                onChange={(e) => setIqEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contrasena
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={iqPassword}
                  onChange={(e) => setIqPassword(e.target.value)}
                  placeholder="Ingresa tu contrasena"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tipo de Cuenta
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIqAccountType('PRACTICE')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    iqAccountType === 'PRACTICE'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setIqAccountType('REAL')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    iqAccountType === 'REAL'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Real
                </button>
              </div>
              {iqAccountType === 'REAL' && (
                <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Operaras con dinero REAL. Solo recomendado si estas seguro.
                </p>
              )}
            </div>

            {/* IQ Status */}
            {status?.platforms?.iqoption?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
                <strong>Error previo:</strong> {status.platforms.iqoption.error}
              </div>
            )}
          </div>
        )}

        {/* MT5 Form */}
        {showTab === 'mt5' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Nota sobre MT5</p>
              <p>MT5 solo funciona si el backend se ejecuta en Windows con el terminal MetaTrader 5 instalado y abierto. En Linux/nube, la conexion fallara.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tipo de Cuenta MT5
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMt5IsDemo(true)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    mt5IsDemo
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setMt5IsDemo(false)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    !mt5IsDemo
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Real
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Login (numero de cuenta)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={mt5Login}
                onChange={(e) => setMt5Login(e.target.value.replace(/\D/g, ''))}
                placeholder="12345678"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contrasena
              </label>
              <input
                type="password"
                value={mt5Password}
                onChange={(e) => setMt5Password(e.target.value)}
                placeholder="Contrasena de la cuenta MT5"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Servidor
              </label>
              <input
                type="text"
                value={mt5Server}
                onChange={(e) => setMt5Server(e.target.value)}
                placeholder="MT5-Demo01"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-1">Ej: MT5-Demo01, ICMarkets-Demo02, Pepperstone-Demo</p>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="my-6 border-t border-slate-200" />

        {/* Auto-start Bot Configuration */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            Configuracion de Auto-Inicio del Bot
          </h3>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStartBot}
              onChange={(e) => setAutoStartBot(e.target.checked)}
              className="w-5 h-5 rounded accent-blue-600"
            />
            <div>
              <span className="text-sm font-medium text-slate-700">Iniciar bot automaticamente</span>
              <p className="text-xs text-slate-500">El bot empezara a operar nada mas conectarse</p>
            </div>
          </label>

          {autoStartBot && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200 ml-8">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Modo</label>
                  <select
                    value={botMode}
                    onChange={(e) => setBotMode(e.target.value as 'auto' | 'manual')}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="auto">Auto (automatico)</option>
                    <option value="manual">Manual (solo senales)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Monto por trade ($)</label>
                  <input
                    type="number"
                    value={botAmount}
                    onChange={(e) => setBotAmount(Number(e.target.value))}
                    min={1}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Simbolos (separados por coma)</label>
                <input
                  type="text"
                  value={botSymbols}
                  onChange={(e) => setBotSymbols(e.target.value)}
                  placeholder="EURUSD,GBPUSD,USDJPY"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Estrategias (separadas por coma)</label>
                <input
                  type="text"
                  value={botStrategies}
                  onChange={(e) => setBotStrategies(e.target.value)}
                  placeholder="ema_rsi,macd,bollinger"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Confianza minima: {botConfidence}%
                </label>
                <input
                  type="range"
                  min={55}
                  max={95}
                  value={botConfidence}
                  onChange={(e) => setBotConfidence(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>55% (mas operaciones)</span>
                  <span>95% (menos, mas selectivo)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleSaveCredentials}
            disabled={saving}
            className="flex-1 min-w-[140px] py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            ) : (
              <><Save className="w-4 h-4" /> Guardar Credenciales</>
            )}
          </button>

          <button
            onClick={handleConnectNow}
            disabled={connecting || !status?.has_credentials}
            className="flex-1 min-w-[140px] py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            {connecting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</>
            ) : (
              <><Plug className="w-4 h-4" /> Conectar Ahora</>
            )}
          </button>

          <button
            onClick={handleDisconnect}
            className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 border border-red-200"
          >
            <PowerOff className="w-4 h-4" />
            Desconectar
          </button>
        </div>

        {/* Status summary */}
        {status && (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Estado de Auto-Conexion
              </span>
              {status.has_auto_connected ? (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Inicializado
                </span>
              ) : (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Pendiente
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${iqConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-slate-600">IQ Option:</span>
                <span className={iqConnected ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                  {iqConnected ? 'Conectado' : 'Desconectado'}
                </span>
                {status?.platforms?.iqoption?.balance ? (
                  <span className="text-slate-500 ml-auto">
                    ${status.platforms.iqoption.balance.toFixed(2)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${mt5Connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-slate-600">MT5:</span>
                <span className={mt5Connected ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                  {mt5Connected ? 'Conectado' : 'Desconectado'}
                </span>
                {status?.platforms?.mt5?.balance ? (
                  <span className="text-slate-500 ml-auto">
                    ${status.platforms.mt5.balance.toFixed(2)}
                  </span>
                ) : null}
              </div>
            </div>
            {!status?.has_credentials && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <X className="w-3 h-3" />
                No hay credenciales guardadas. Usa el formulario para configurar la auto-conexion.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoConnectManager;
