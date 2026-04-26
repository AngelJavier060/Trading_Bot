import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

const IQ_ASSETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'XAUUSD', 'BTCUSD'];
const EXPIRATION_OPTIONS = [1, 2, 3, 5, 10, 15, 30, 60];
const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface StrategyRisk {
  amount_type: 'fixed' | 'percent';
  amount_value: number;
  max_daily_loss_type: 'fixed' | 'percent';
  max_daily_loss: number;
  max_streak_losses: number;
  streak_cooldown_minutes: number;
  daily_profit_target_type: 'fixed' | 'percent';
  daily_profit_target: number;
  max_ops_per_day: number;
  max_concurrent_ops: number;
  expiration_minutes: number;
  allowed_assets: string[];
  start_hour: number;
  end_hour: number;
  active_days: string[];
  martingale_enabled: boolean;
  martingale_factor: number;
  martingale_max_levels: number;
}

const DEFAULT_RISK: StrategyRisk = {
  amount_type: 'fixed',
  amount_value: 10,
  max_daily_loss_type: 'fixed',
  max_daily_loss: 50,
  max_streak_losses: 3,
  streak_cooldown_minutes: 30,
  daily_profit_target_type: 'fixed',
  daily_profit_target: 100,
  max_ops_per_day: 10,
  max_concurrent_ops: 2,
  expiration_minutes: 5,
  allowed_assets: ['EURUSD', 'GBPUSD', 'USDJPY'],
  start_hour: 8,
  end_hour: 20,
  active_days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
  martingale_enabled: false,
  martingale_factor: 2,
  martingale_max_levels: 3,
};

interface Strategy {
  id: number;
  name: string;
  display_name: string;
  description: string;
  version: string;
  is_active: boolean;
  is_visible: boolean;
  indicators_config: Record<string, any>;
  entry_rules: Record<string, any>;
  exit_rules: Record<string, any>;
  min_confidence: number;
  allowed_timeframes: string[];
  total_trades: number;
  win_rate: number;
  total_profit: number;
  is_ml_optimized: boolean;
  created_at: string;
}

interface IndicatorConfig {
  id: number;
  name: string;
  display_name: string;
  parameters: Record<string, any>;
  is_active: boolean;
  used_for: string[];
}

type EditTab = 'general' | 'riesgo' | 'tecnicos' | 'horario';

export default function StrategiesConfiguration() {
  const router = useRouter();
  
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'strategies' | 'indicators' | 'create'>('strategies');
  const [editTab, setEditTab] = useState<EditTab>('general');
  const [riskConfig, setRiskConfig] = useState<StrategyRisk>({ ...DEFAULT_RISK });

  const getRisk = (s: Strategy): StrategyRisk => ({
    ...DEFAULT_RISK,
    ...(s.indicators_config?._risk || {}),
  });

  const openEdit = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setRiskConfig(getRisk(strategy));
    setEditTab('general');
  };

  const updateRisk = (partial: Partial<StrategyRisk>) =>
    setRiskConfig(prev => ({ ...prev, ...partial }));
  
  // New strategy form
  const [newStrategy, setNewStrategy] = useState({
    name: '',
    display_name: '',
    description: '',
    min_confidence: 60,
    allowed_timeframes: ['5m', '15m'],
    indicators_config: {},
    entry_rules: {},
  });

  // Fetch strategies
  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/strategies/?active_only=false`);
      const data = await response.json();
      if (data.status === 'success') {
        setStrategies(data.strategies);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  }, []);

  // Fetch indicators
  const fetchIndicators = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/strategies/indicators`);
      const data = await response.json();
      if (data.status === 'success') {
        setIndicators(data.indicators);
      }
    } catch (error) {
      console.error('Error fetching indicators:', error);
    }
  }, []);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchStrategies(), fetchIndicators()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchStrategies, fetchIndicators]);

  // Toggle strategy active
  const toggleStrategy = async (strategyId: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`${BASE_URL}/api/strategies/${strategyId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      
      const data = await response.json();
      if (data.status === 'success') {
        setStrategies(prev => prev.map(s => 
          s.id === strategyId ? { ...s, is_active: !currentStatus } : s
        ));
      }
    } catch (error) {
      console.error('Error toggling strategy:', error);
    }
  };

  // Update strategy
  const updateStrategy = async (strategyId: number, updates: Partial<Strategy>) => {
    setIsSaving(true);
    try {
      const response = await fetch(`${BASE_URL}/api/strategies/${strategyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      const data = await response.json();
      if (data.status === 'success') {
        setStrategies(prev => prev.map(s => 
          s.id === strategyId ? { ...s, ...updates } : s
        ));
        setSelectedStrategy(null);
      }
    } catch (error) {
      console.error('Error updating strategy:', error);
      alert('Error al actualizar estrategia');
    }
    setIsSaving(false);
  };

  // Create new strategy
  const createStrategy = async () => {
    if (!newStrategy.name || !newStrategy.display_name) {
      alert('Nombre requerido');
      return;
    }
    
    setIsSaving(true);
    try {
      const response = await fetch(`${BASE_URL}/api/strategies/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStrategy),
      });
      
      const data = await response.json();
      if (data.status === 'success') {
        await fetchStrategies();
        setNewStrategy({
          name: '',
          display_name: '',
          description: '',
          min_confidence: 60,
          allowed_timeframes: ['5m', '15m'],
          indicators_config: {},
          entry_rules: {},
        });
        setActiveTab('strategies');
        alert('Estrategia creada correctamente');
      }
    } catch (error) {
      console.error('Error creating strategy:', error);
      alert('Error al crear estrategia');
    }
    setIsSaving(false);
  };

  // Update indicator
  const updateIndicator = async (configId: number, updates: Partial<IndicatorConfig>) => {
    try {
      const response = await fetch(`${BASE_URL}/api/strategies/indicators/${configId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      const data = await response.json();
      if (data.status === 'success') {
        await fetchIndicators();
      }
    } catch (error) {
      console.error('Error updating indicator:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">⚙️ Configuración de Estrategias</h1>
            <span className="px-3 py-1 bg-purple-600 rounded-full text-xs">
              {strategies.filter(s => s.is_active).length} Activas
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/app/dashboard/trading/demo')}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm"
            >
              Trading Demo
            </button>
            <button
              onClick={() => router.push('/app/dashboard/configuration')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm"
            >
              ← Configuración
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('strategies')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'strategies' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            📊 Estrategias ({strategies.length})
          </button>
          <button
            onClick={() => setActiveTab('indicators')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'indicators' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            📈 Indicadores ({indicators.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === 'create' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            ➕ Nueva Estrategia
          </button>
        </div>

        {/* Strategies Tab */}
        {activeTab === 'strategies' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {strategies.map(strategy => (
              <div
                key={strategy.id}
                className={`bg-gray-800 rounded-xl p-4 border ${
                  strategy.is_active ? 'border-green-500' : 'border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{strategy.display_name || strategy.name}</h3>
                    <p className="text-sm text-gray-400">{strategy.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {strategy.is_ml_optimized && (
                      <span className="px-2 py-1 bg-purple-600 rounded text-xs">🤖 ML</span>
                    )}
                    <button
                      onClick={() => toggleStrategy(strategy.id, strategy.is_active)}
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        strategy.is_active ? 'bg-green-600' : 'bg-gray-600'
                      }`}
                    >
                      {strategy.is_active ? '✓ Activa' : 'Inactiva'}
                    </button>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <p className="text-lg font-bold">{strategy.total_trades}</p>
                    <p className="text-xs text-gray-400">Trades</p>
                  </div>
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <p className={`text-lg font-bold ${strategy.win_rate >= 55 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {strategy.win_rate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-400">Win Rate</p>
                  </div>
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <p className={`text-lg font-bold ${strategy.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${strategy.total_profit.toFixed(0)}
                    </p>
                    <p className="text-xs text-gray-400">Profit</p>
                  </div>
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <p className="text-lg font-bold text-blue-400">{strategy.min_confidence}%</p>
                    <p className="text-xs text-gray-400">Min Conf</p>
                  </div>
                </div>

                {/* Indicators */}
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Indicadores:</p>
                  <div className="flex flex-wrap gap-1">
                    {strategy.indicators_config && Object.keys(strategy.indicators_config).map(ind => (
                      <span key={ind} className="px-2 py-0.5 bg-blue-900/50 rounded text-xs">
                        {ind.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Timeframes */}
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Timeframes:</p>
                  <div className="flex flex-wrap gap-1">
                    {strategy.allowed_timeframes?.map(tf => (
                      <span key={tf} className="px-2 py-0.5 bg-gray-700 rounded text-xs">{tf}</span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(strategy)}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  >
                    ✏️ Editar
                  </button>
                  <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                    📊 Stats
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Indicators Tab */}
        {activeTab === 'indicators' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {indicators.map(indicator => (
              <div key={indicator.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold">{indicator.display_name || indicator.name}</h3>
                    <p className="text-xs text-gray-400">{indicator.name.toUpperCase()}</p>
                  </div>
                  <button
                    onClick={() => updateIndicator(indicator.id, { is_active: !indicator.is_active })}
                    className={`px-2 py-1 rounded text-xs ${
                      indicator.is_active ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    {indicator.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Parámetros:</p>
                  {Object.entries(indicator.parameters || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-gray-400">{key}:</span>
                      <span className="font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-1">Uso:</p>
                  <div className="flex gap-1">
                    {indicator.used_for?.map(use => (
                      <span key={use} className="px-2 py-0.5 bg-blue-900/50 rounded text-xs">{use}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Strategy Tab */}
        {activeTab === 'create' && (
          <div className="max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold mb-4">➕ Crear Nueva Estrategia</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">ID (único)</label>
                  <input
                    type="text"
                    value={newStrategy.name}
                    onChange={(e) => setNewStrategy(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                    className="w-full bg-gray-700 rounded p-2"
                    placeholder="ej: mi_estrategia"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newStrategy.display_name}
                    onChange={(e) => setNewStrategy(prev => ({ ...prev, display_name: e.target.value }))}
                    className="w-full bg-gray-700 rounded p-2"
                    placeholder="Mi Estrategia"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Descripción</label>
                <textarea
                  value={newStrategy.description}
                  onChange={(e) => setNewStrategy(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-gray-700 rounded p-2 h-20"
                  placeholder="Descripción de la estrategia..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Confianza Mínima (%)</label>
                  <input
                    type="number"
                    value={newStrategy.min_confidence}
                    onChange={(e) => setNewStrategy(prev => ({ ...prev, min_confidence: Number(e.target.value) }))}
                    className="w-full bg-gray-700 rounded p-2"
                    min={50}
                    max={100}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Timeframes</label>
                  <select
                    multiple
                    value={newStrategy.allowed_timeframes}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                      setNewStrategy(prev => ({ ...prev, allowed_timeframes: selected }));
                    }}
                    className="w-full bg-gray-700 rounded p-2 h-20"
                  >
                    <option value="1m">1 Minuto</option>
                    <option value="5m">5 Minutos</option>
                    <option value="15m">15 Minutos</option>
                    <option value="30m">30 Minutos</option>
                    <option value="1h">1 Hora</option>
                    <option value="4h">4 Horas</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Indicadores a Usar</label>
                <div className="grid grid-cols-3 gap-2">
                  {['ema', 'rsi', 'macd', 'bollinger', 'atr', 'stochastic'].map(ind => (
                    <label key={ind} className="flex items-center gap-2 bg-gray-700 p-2 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Object.keys(newStrategy.indicators_config).includes(ind)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewStrategy(prev => ({
                              ...prev,
                              indicators_config: { ...prev.indicators_config, [ind]: {} }
                            }));
                          } else {
                            const { [ind]: _, ...rest } = newStrategy.indicators_config;
                            setNewStrategy(prev => ({ ...prev, indicators_config: rest }));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{ind.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={createStrategy}
                disabled={isSaving || !newStrategy.name}
                className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : '✓ Crear Estrategia'}
              </button>
            </div>
          </div>
        )}

        {/* Edit Strategy Modal — 4 tabs */}
        {selectedStrategy && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col">
              {/* Modal header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
                <div>
                  <h2 className="text-xl font-bold">✏️ {selectedStrategy.display_name}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">ID: {selectedStrategy.name} · v{selectedStrategy.version}</p>
                </div>
                <button onClick={() => setSelectedStrategy(null)} className="p-2 hover:bg-gray-700 rounded text-gray-400">✕</button>
              </div>

              {/* Modal tabs */}
              <div className="flex border-b border-gray-700 px-6 gap-1">
                {([
                  { id: 'general', label: '⚙️ General' },
                  { id: 'riesgo',  label: '🛡️ Riesgo' },
                  { id: 'tecnicos', label: '📈 Técnicos' },
                  { id: 'horario', label: '🕐 Horario' },
                ] as { id: EditTab; label: string }[]).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setEditTab(t.id)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      editTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                {/* ── GENERAL ── */}
                {editTab === 'general' && (
                  <>
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">Nombre visible</label>
                      <input type="text" value={selectedStrategy.display_name}
                        onChange={e => setSelectedStrategy(p => p ? { ...p, display_name: e.target.value } : null)}
                        className="w-full bg-gray-700 rounded p-2" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">Descripción</label>
                      <textarea value={selectedStrategy.description}
                        onChange={e => setSelectedStrategy(p => p ? { ...p, description: e.target.value } : null)}
                        className="w-full bg-gray-700 rounded p-2 h-20" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-400 block mb-1">Confianza mínima (%)</label>
                        <input type="number" min={50} max={100}
                          value={selectedStrategy.min_confidence}
                          onChange={e => setSelectedStrategy(p => p ? { ...p, min_confidence: Number(e.target.value) } : null)}
                          className="w-full bg-gray-700 rounded p-2" />
                        <p className="text-xs text-gray-500 mt-1">Solo opera señales con score ≥ este valor</p>
                      </div>
                      <div>
                        <label className="text-sm text-gray-400 block mb-1">Versión</label>
                        <input type="text" value={selectedStrategy.version}
                          onChange={e => setSelectedStrategy(p => p ? { ...p, version: e.target.value } : null)}
                          className="w-full bg-gray-700 rounded p-2" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 block mb-2">Timeframes activos</label>
                      <div className="flex flex-wrap gap-2">
                        {['1m','2m','5m','10m','15m','30m','1h','4h'].map(tf => (
                          <button key={tf} type="button"
                            onClick={() => {
                              const cur = selectedStrategy.allowed_timeframes || [];
                              setSelectedStrategy(p => p ? {
                                ...p,
                                allowed_timeframes: cur.includes(tf) ? cur.filter(x => x !== tf) : [...cur, tf]
                              } : null);
                            }}
                            className={`px-3 py-1.5 rounded text-sm font-mono ${
                              (selectedStrategy.allowed_timeframes || []).includes(tf)
                                ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                            }`}
                          >{tf}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ── RIESGO ── */}
                {editTab === 'riesgo' && (
                  <>
                    {/* Amount */}
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">💰 Monto por operación</h4>
                      <div className="flex gap-3 mb-3">
                        <button onClick={() => updateRisk({ amount_type: 'fixed' })}
                          className={`flex-1 py-2 rounded text-sm ${riskConfig.amount_type === 'fixed' ? 'bg-blue-600' : 'bg-gray-600'}`}>
                          $ Fijo
                        </button>
                        <button onClick={() => updateRisk({ amount_type: 'percent' })}
                          className={`flex-1 py-2 rounded text-sm ${riskConfig.amount_type === 'percent' ? 'bg-blue-600' : 'bg-gray-600'}`}>
                          % del Balance
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{riskConfig.amount_type === 'fixed' ? '$' : '%'}</span>
                        <input type="number" min={0.1} step={0.5}
                          value={riskConfig.amount_value}
                          onChange={e => updateRisk({ amount_value: Number(e.target.value) })}
                          className="flex-1 bg-gray-700 rounded p-2" />
                      </div>
                    </div>

                    {/* Expiración */}
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">⏱️ Tiempo de expiración</h4>
                      <div className="flex flex-wrap gap-2">
                        {EXPIRATION_OPTIONS.map(m => (
                          <button key={m} onClick={() => updateRisk({ expiration_minutes: m })}
                            className={`px-3 py-1.5 rounded text-sm font-mono ${riskConfig.expiration_minutes === m ? 'bg-green-600' : 'bg-gray-600'}`}>
                            {m}m
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pérdidas */}
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">🔴 Límites de pérdida</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Pérdida máx. diaria</label>
                          <div className="flex gap-1 mb-1">
                            {(['fixed','percent'] as const).map(t => (
                              <button key={t} onClick={() => updateRisk({ max_daily_loss_type: t })}
                                className={`flex-1 text-xs py-1 rounded ${riskConfig.max_daily_loss_type === t ? 'bg-red-700' : 'bg-gray-600'}`}>
                                {t === 'fixed' ? '$' : '%'}
                              </button>
                            ))}
                          </div>
                          <input type="number" min={0}
                            value={riskConfig.max_daily_loss}
                            onChange={e => updateRisk({ max_daily_loss: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Pérdidas seguidas (pausa)</label>
                          <input type="number" min={1} max={20}
                            value={riskConfig.max_streak_losses}
                            onChange={e => updateRisk({ max_streak_losses: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2 mb-1" />
                          <label className="text-xs text-gray-400 block mb-1">Pausa tras racha (min)</label>
                          <input type="number" min={0}
                            value={riskConfig.streak_cooldown_minutes}
                            onChange={e => updateRisk({ streak_cooldown_minutes: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2" />
                        </div>
                      </div>
                    </div>

                    {/* Ganancias */}
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">🟢 Objetivos y límites de ops</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Ganancia diaria objetivo</label>
                          <div className="flex gap-1 mb-1">
                            {(['fixed','percent'] as const).map(t => (
                              <button key={t} onClick={() => updateRisk({ daily_profit_target_type: t })}
                                className={`flex-1 text-xs py-1 rounded ${riskConfig.daily_profit_target_type === t ? 'bg-green-700' : 'bg-gray-600'}`}>
                                {t === 'fixed' ? '$' : '%'}
                              </button>
                            ))}
                          </div>
                          <input type="number" min={0}
                            value={riskConfig.daily_profit_target}
                            onChange={e => updateRisk({ daily_profit_target: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Máx. operaciones/día</label>
                          <input type="number" min={1}
                            value={riskConfig.max_ops_per_day}
                            onChange={e => updateRisk({ max_ops_per_day: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2 mb-2" />
                          <label className="text-xs text-gray-400 block mb-1">Máx. operaciones simultáneas</label>
                          <input type="number" min={1} max={10}
                            value={riskConfig.max_concurrent_ops}
                            onChange={e => updateRisk({ max_concurrent_ops: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2" />
                        </div>
                      </div>
                    </div>

                    {/* Activos */}
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">📌 Activos permitidos</h4>
                      <div className="flex flex-wrap gap-2">
                        {IQ_ASSETS.map(a => (
                          <button key={a} onClick={() => {
                            const cur = riskConfig.allowed_assets;
                            updateRisk({ allowed_assets: cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a] });
                          }}
                            className={`px-2 py-1 rounded text-xs font-mono ${riskConfig.allowed_assets.includes(a) ? 'bg-blue-600' : 'bg-gray-600'}`}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ── TÉCNICOS ── */}
                {editTab === 'tecnicos' && (
                  <>
                    <p className="text-xs text-gray-400">Parámetros de los indicadores técnicos de esta estrategia. Los cambios afectan la sensibilidad de las señales.</p>

                    {/* RSI */}
                    {['rsi','RSI','Rsi'].some(k => k in (selectedStrategy.indicators_config || {})) && (
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-yellow-400 mb-3">RSI — Relative Strength Index</h4>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { key: 'period', label: 'Periodo', def: 14, min: 2, max: 50 },
                            { key: 'overbought', label: 'Sobrecompra', def: 70, min: 60, max: 90 },
                            { key: 'oversold', label: 'Sobreventa', def: 30, min: 10, max: 40 },
                          ].map(f => {
                            const indKey = ['rsi','RSI','Rsi'].find(k => k in (selectedStrategy.indicators_config || {}))!;
                            return (
                              <div key={f.key}>
                                <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                                <input type="number" min={f.min} max={f.max}
                                  value={selectedStrategy.indicators_config?.[indKey]?.[f.key] ?? f.def}
                                  onChange={e => setSelectedStrategy(p => p ? {
                                    ...p, indicators_config: {
                                      ...p.indicators_config,
                                      [indKey]: { ...(p.indicators_config[indKey] || {}), [f.key]: Number(e.target.value) }
                                    }
                                  } : null)}
                                  className="w-full bg-gray-700 rounded p-2" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* MACD */}
                    {['macd','MACD'].some(k => k in (selectedStrategy.indicators_config || {})) && (
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-blue-400 mb-3">MACD</h4>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { key: 'fast', label: 'Rápida (Fast)', def: 12 },
                            { key: 'slow', label: 'Lenta (Slow)', def: 26 },
                            { key: 'signal', label: 'Señal', def: 9 },
                          ].map(f => {
                            const indKey = ['macd','MACD'].find(k => k in (selectedStrategy.indicators_config || {}))!;
                            return (
                              <div key={f.key}>
                                <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                                <input type="number" min={1}
                                  value={selectedStrategy.indicators_config?.[indKey]?.[f.key] ?? f.def}
                                  onChange={e => setSelectedStrategy(p => p ? {
                                    ...p, indicators_config: {
                                      ...p.indicators_config,
                                      [indKey]: { ...(p.indicators_config[indKey] || {}), [f.key]: Number(e.target.value) }
                                    }
                                  } : null)}
                                  className="w-full bg-gray-700 rounded p-2" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* EMA */}
                    {['ema','EMA'].some(k => k in (selectedStrategy.indicators_config || {})) && (
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-green-400 mb-3">EMA — Media Móvil Exponencial</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'fast_period', label: 'Periodo corto', def: 9 },
                            { key: 'slow_period', label: 'Periodo largo', def: 21 },
                          ].map(f => {
                            const indKey = ['ema','EMA'].find(k => k in (selectedStrategy.indicators_config || {}))!;
                            return (
                              <div key={f.key}>
                                <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                                <input type="number" min={1}
                                  value={selectedStrategy.indicators_config?.[indKey]?.[f.key] ?? f.def}
                                  onChange={e => setSelectedStrategy(p => p ? {
                                    ...p, indicators_config: {
                                      ...p.indicators_config,
                                      [indKey]: { ...(p.indicators_config[indKey] || {}), [f.key]: Number(e.target.value) }
                                    }
                                  } : null)}
                                  className="w-full bg-gray-700 rounded p-2" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bollinger */}
                    {['bollinger','BOLLINGER','bb','BB'].some(k => k in (selectedStrategy.indicators_config || {})) && (
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-purple-400 mb-3">Bollinger Bands</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'period', label: 'Periodo', def: 20 },
                            { key: 'std_dev', label: 'Desviación estándar', def: 2 },
                          ].map(f => {
                            const indKey = ['bollinger','BOLLINGER','bb','BB'].find(k => k in (selectedStrategy.indicators_config || {}))!;
                            return (
                              <div key={f.key}>
                                <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                                <input type="number" min={1} step={f.key === 'std_dev' ? 0.1 : 1}
                                  value={selectedStrategy.indicators_config?.[indKey]?.[f.key] ?? f.def}
                                  onChange={e => setSelectedStrategy(p => p ? {
                                    ...p, indicators_config: {
                                      ...p.indicators_config,
                                      [indKey]: { ...(p.indicators_config[indKey] || {}), [f.key]: Number(e.target.value) }
                                    }
                                  } : null)}
                                  className="w-full bg-gray-700 rounded p-2" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Divergencias */}
                    {['divergencias','divergence','DIV'].some(k => k in (selectedStrategy.indicators_config || {})) && (
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-orange-400 mb-3">Divergencias</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'lookback', label: 'Lookback (velas)', def: 5 },
                            { key: 'tolerance', label: 'Tolerancia (%)', def: 0.1 },
                          ].map(f => {
                            const indKey = ['divergencias','divergence','DIV'].find(k => k in (selectedStrategy.indicators_config || {}))!;
                            return (
                              <div key={f.key}>
                                <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                                <input type="number" min={0} step={f.key === 'tolerance' ? 0.01 : 1}
                                  value={selectedStrategy.indicators_config?.[indKey]?.[f.key] ?? f.def}
                                  onChange={e => setSelectedStrategy(p => p ? {
                                    ...p, indicators_config: {
                                      ...p.indicators_config,
                                      [indKey]: { ...(p.indicators_config[indKey] || {}), [f.key]: Number(e.target.value) }
                                    }
                                  } : null)}
                                  className="w-full bg-gray-700 rounded p-2" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {Object.keys(selectedStrategy.indicators_config || {}).filter(k => k !== '_risk').length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <p>No hay indicadores configurados en esta estrategia.</p>
                        <p className="text-xs mt-1">Agrega indicadores desde la pestaña General.</p>
                      </div>
                    )}
                  </>
                )}

                {/* ── HORARIO + MARTINGALA ── */}
                {editTab === 'horario' && (
                  <>
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-3">🕐 Horario de operación</h4>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Hora inicio (0–23)</label>
                          <input type="number" min={0} max={23}
                            value={riskConfig.start_hour}
                            onChange={e => updateRisk({ start_hour: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Hora fin (0–23)</label>
                          <input type="number" min={0} max={23}
                            value={riskConfig.end_hour}
                            onChange={e => updateRisk({ end_hour: Number(e.target.value) })}
                            className="w-full bg-gray-700 rounded p-2" />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">Días activos</p>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map(d => (
                          <button key={d} onClick={() => {
                            const cur = riskConfig.active_days;
                            updateRisk({ active_days: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] });
                          }}
                            className={`px-3 py-1.5 rounded text-sm ${riskConfig.active_days.includes(d) ? 'bg-blue-600' : 'bg-gray-600'}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={`rounded-lg p-4 border-2 ${riskConfig.martingale_enabled ? 'bg-red-900/20 border-red-700' : 'bg-gray-700/50 border-gray-600'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-red-400">⚠️ Martingala</h4>
                          <p className="text-xs text-gray-400 mt-0.5">MUY ARRIESGADO — duplica el monto en cada pérdida</p>
                        </div>
                        <button onClick={() => updateRisk({ martingale_enabled: !riskConfig.martingale_enabled })}
                          className={`px-4 py-2 rounded text-sm font-bold ${riskConfig.martingale_enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-500'}`}>
                          {riskConfig.martingale_enabled ? '🔴 ACTIVA' : 'Desactivada'}
                        </button>
                      </div>
                      {riskConfig.martingale_enabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Factor multiplicador</label>
                            <input type="number" min={1.1} max={5} step={0.1}
                              value={riskConfig.martingale_factor}
                              onChange={e => updateRisk({ martingale_factor: Number(e.target.value) })}
                              className="w-full bg-gray-800 rounded p-2" />
                            <p className="text-xs text-gray-500 mt-1">Ej: 2 = doble en cada pérdida</p>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Niveles máximos</label>
                            <input type="number" min={1} max={8}
                              value={riskConfig.martingale_max_levels}
                              onChange={e => updateRisk({ martingale_max_levels: Number(e.target.value) })}
                              className="w-full bg-gray-800 rounded p-2" />
                            <p className="text-xs text-gray-500 mt-1">Máx. veces que se aplica antes de parar</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Modal footer — save */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-700">
                <button
                  onClick={() => updateStrategy(selectedStrategy.id, {
                    display_name: selectedStrategy.display_name,
                    description: selectedStrategy.description,
                    min_confidence: selectedStrategy.min_confidence,
                    version: selectedStrategy.version,
                    allowed_timeframes: selectedStrategy.allowed_timeframes,
                    indicators_config: { ...selectedStrategy.indicators_config, _risk: riskConfig },
                  })}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold disabled:opacity-50"
                >
                  {isSaving ? '⏳ Guardando...' : '✓ Guardar todos los cambios'}
                </button>
                <button onClick={() => setSelectedStrategy(null)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
