import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

const BASE_URL = "http://127.0.0.1:5000";

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

export default function StrategiesConfiguration() {
  const router = useRouter();
  
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'strategies' | 'indicators' | 'create'>('strategies');
  
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
        alert('Estrategia actualizada correctamente');
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
                    onClick={() => setSelectedStrategy(strategy)}
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

        {/* Edit Strategy Modal */}
        {selectedStrategy && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">✏️ Editar: {selectedStrategy.display_name}</h2>
                <button
                  onClick={() => setSelectedStrategy(null)}
                  className="p-2 hover:bg-gray-700 rounded"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Nombre</label>
                  <input
                    type="text"
                    value={selectedStrategy.display_name}
                    onChange={(e) => setSelectedStrategy(prev => prev ? { ...prev, display_name: e.target.value } : null)}
                    className="w-full bg-gray-700 rounded p-2"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 block mb-1">Descripción</label>
                  <textarea
                    value={selectedStrategy.description}
                    onChange={(e) => setSelectedStrategy(prev => prev ? { ...prev, description: e.target.value } : null)}
                    className="w-full bg-gray-700 rounded p-2 h-20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Confianza Mínima (%)</label>
                    <input
                      type="number"
                      value={selectedStrategy.min_confidence}
                      onChange={(e) => setSelectedStrategy(prev => prev ? { ...prev, min_confidence: Number(e.target.value) } : null)}
                      className="w-full bg-gray-700 rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Versión</label>
                    <input
                      type="text"
                      value={selectedStrategy.version}
                      onChange={(e) => setSelectedStrategy(prev => prev ? { ...prev, version: e.target.value } : null)}
                      className="w-full bg-gray-700 rounded p-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 block mb-1">Configuración de Indicadores (JSON)</label>
                  <textarea
                    value={JSON.stringify(selectedStrategy.indicators_config, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setSelectedStrategy(prev => prev ? { ...prev, indicators_config: parsed } : null);
                      } catch {}
                    }}
                    className="w-full bg-gray-700 rounded p-2 font-mono text-sm h-32"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => updateStrategy(selectedStrategy.id, {
                      display_name: selectedStrategy.display_name,
                      description: selectedStrategy.description,
                      min_confidence: selectedStrategy.min_confidence,
                      version: selectedStrategy.version,
                      indicators_config: selectedStrategy.indicators_config,
                    })}
                    disabled={isSaving}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold disabled:opacity-50"
                  >
                    {isSaving ? 'Guardando...' : '✓ Guardar Cambios'}
                  </button>
                  <button
                    onClick={() => setSelectedStrategy(null)}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
