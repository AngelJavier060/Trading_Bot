import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import { getPublicApiBaseUrl } from '@/services/api';

const BASE_URL = getPublicApiBaseUrl();

interface GlobalRiskConfig {
  // Pérdidas
  max_daily_loss_enabled: boolean;
  max_daily_loss_type: 'fixed' | 'percent';
  max_daily_loss: number;
  // Balance mínimo
  min_balance_enabled: boolean;
  min_balance: number;
  // Operaciones simultáneas
  max_concurrent_global: number;
  // Cooldown por racha
  global_cooldown_enabled: boolean;
  global_streak_losses: number;
  global_cooldown_minutes: number;
  // Objetivo diario (stop de ganancias)
  daily_target_enabled: boolean;
  daily_target_type: 'fixed' | 'percent';
  daily_target: number;
  // Horario global
  global_schedule_enabled: boolean;
  global_start_hour: number;
  global_end_hour: number;
  // Telegram
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_on_trade_open: boolean;
  telegram_on_trade_close: boolean;
  telegram_on_risk_limit: boolean;
}

const DEFAULT_CONFIG: GlobalRiskConfig = {
  max_daily_loss_enabled: true,
  max_daily_loss_type: 'fixed',
  max_daily_loss: 100,
  min_balance_enabled: true,
  min_balance: 200,
  max_concurrent_global: 5,
  global_cooldown_enabled: true,
  global_streak_losses: 5,
  global_cooldown_minutes: 30,
  daily_target_enabled: false,
  daily_target_type: 'fixed',
  daily_target: 200,
  global_schedule_enabled: false,
  global_start_hour: 7,
  global_end_hour: 22,
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_id: '',
  telegram_on_trade_open: true,
  telegram_on_trade_close: true,
  telegram_on_risk_limit: true,
};

const STORAGE_KEY = 'nexus_global_risk_config';

export default function RiskManager() {
  const router = useRouter();
  const [config, setConfig] = useState<GlobalRiskConfig>({ ...DEFAULT_CONFIG });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'perdidas' | 'objetivos' | 'horario' | 'telegram'>('perdidas');
  const [dailyStats, setDailyStats] = useState<{
    daily_pnl: number;
    balance: number;
    ops_today: number;
    streak_losses: number;
  } | null>(null);

  // Load config from localStorage + backend
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) }); } catch {}
    }
    fetchDailyStats();
  }, []);

  const fetchDailyStats = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/live/status`);
      const data = await res.json();
      if (data.status === 'success' || data.bot_status) {
        setDailyStats({
          daily_pnl: data.daily_pnl ?? data.bot_status?.daily_pnl ?? 0,
          balance: data.balance ?? 0,
          ops_today: data.trades_today ?? data.bot_status?.trades_today ?? 0,
          streak_losses: data.streak_losses ?? 0,
        });
      }
    } catch {}
  };

  const updateConfig = (partial: Partial<GlobalRiskConfig>) =>
    setConfig(prev => ({ ...prev, ...partial }));

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      // Also try to push to backend
      try {
        await fetch(`${BASE_URL}/api/live/risk-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
      } catch {}
      toast.success('Risk Manager guardado correctamente');
    } finally {
      setIsSaving(false);
    }
  };

  const testTelegram = async () => {
    setIsTesting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/notifications/telegram/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: config.telegram_bot_token,
          chat_id: config.telegram_chat_id,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Mensaje de prueba enviado a Telegram ✓');
      } else {
        toast.error('Error: ' + (data.message || 'Verifica el token y chat_id'));
      }
    } catch {
      toast.error('No se pudo conectar con el backend');
    }
    setIsTesting(false);
  };

  const tabs = [
    { id: 'perdidas' as const, label: '🔴 Pérdidas' },
    { id: 'objetivos' as const, label: '🟢 Objetivos' },
    { id: 'horario' as const, label: '🕐 Horario' },
    { id: 'telegram' as const, label: '📱 Telegram' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">🛡️ Risk Manager Global</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Protección de la cuenta independientemente de las estrategias activas
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/app/dashboard/configuration')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm"
            >
              ← Configuración
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-4">

        {/* Daily stats banner */}
        {dailyStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: 'P&L del día',
                value: `${dailyStats.daily_pnl >= 0 ? '+' : ''}$${dailyStats.daily_pnl.toFixed(2)}`,
                color: dailyStats.daily_pnl >= 0 ? 'text-green-400' : 'text-red-400',
              },
              { label: 'Balance', value: `$${dailyStats.balance.toFixed(2)}`, color: 'text-white' },
              { label: 'Ops hoy', value: String(dailyStats.ops_today), color: 'text-blue-400' },
              {
                label: 'Racha pérdidas',
                value: String(dailyStats.streak_losses),
                color: dailyStats.streak_losses >= 3 ? 'text-red-400' : 'text-gray-300',
              },
            ].map(s => (
              <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center border border-gray-700">
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Risk status badges */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-sm font-semibold text-gray-300 mb-3">Estado de protecciones activas</p>
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.max_daily_loss_enabled ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-400'}`}>
              {config.max_daily_loss_enabled ? '✓' : '✗'} Límite pérdida diaria
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.min_balance_enabled ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-400'}`}>
              {config.min_balance_enabled ? '✓' : '✗'} Balance mínimo
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.global_cooldown_enabled ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-400'}`}>
              {config.global_cooldown_enabled ? '✓' : '✗'} Cooldown por racha
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.daily_target_enabled ? 'bg-blue-800 text-blue-200' : 'bg-gray-700 text-gray-400'}`}>
              {config.daily_target_enabled ? '✓' : '✗'} Stop de ganancias
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.global_schedule_enabled ? 'bg-yellow-800 text-yellow-200' : 'bg-gray-700 text-gray-400'}`}>
              {config.global_schedule_enabled ? '✓' : '✗'} Horario global
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.telegram_enabled ? 'bg-blue-800 text-blue-200' : 'bg-gray-700 text-gray-400'}`}>
              {config.telegram_enabled ? '✓' : '✗'} Telegram
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PÉRDIDAS ── */}
        {activeTab === 'perdidas' && (
          <div className="space-y-4">

            {/* Max daily loss */}
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold">Pérdida máxima diaria total</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Si la suma de pérdidas del día supera este límite, el bot detiene TODAS las estrategias.
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ max_daily_loss_enabled: !config.max_daily_loss_enabled })}
                  className={`px-4 py-2 rounded text-sm font-bold ${config.max_daily_loss_enabled ? 'bg-green-700' : 'bg-gray-600'}`}
                >
                  {config.max_daily_loss_enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              {config.max_daily_loss_enabled && (
                <div className="flex gap-3">
                  <div className="flex gap-1">
                    {(['fixed', 'percent'] as const).map(t => (
                      <button key={t} onClick={() => updateConfig({ max_daily_loss_type: t })}
                        className={`px-3 py-2 rounded text-sm ${config.max_daily_loss_type === t ? 'bg-red-700' : 'bg-gray-700'}`}>
                        {t === 'fixed' ? '$ Fijo' : '% Balance'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" min={0} step={config.max_daily_loss_type === 'fixed' ? 5 : 1}
                    value={config.max_daily_loss}
                    onChange={e => updateConfig({ max_daily_loss: Number(e.target.value) })}
                    className="flex-1 bg-gray-700 rounded p-2"
                  />
                  <span className="flex items-center text-gray-400">
                    {config.max_daily_loss_type === 'fixed' ? 'USD' : '%'}
                  </span>
                </div>
              )}
            </div>

            {/* Min balance */}
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold">Balance mínimo de seguridad</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Si el balance baja de este monto, el bot se detiene completamente.
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ min_balance_enabled: !config.min_balance_enabled })}
                  className={`px-4 py-2 rounded text-sm font-bold ${config.min_balance_enabled ? 'bg-green-700' : 'bg-gray-600'}`}
                >
                  {config.min_balance_enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              {config.min_balance_enabled && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">$</span>
                  <input type="number" min={0} step={10}
                    value={config.min_balance}
                    onChange={e => updateConfig({ min_balance: Number(e.target.value) })}
                    className="w-48 bg-gray-700 rounded p-2" />
                  <span className="text-gray-400 text-sm">USD</span>
                </div>
              )}
            </div>

            {/* Max concurrent global */}
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <h3 className="font-semibold mb-1">Máx. operaciones simultáneas globales</h3>
              <p className="text-xs text-gray-400 mb-3">
                Límite total entre todas las estrategias. Actualmente: <strong>{config.max_concurrent_global}</strong>
              </p>
              <div className="flex items-center gap-4">
                <input type="range" min={1} max={20}
                  value={config.max_concurrent_global}
                  onChange={e => updateConfig({ max_concurrent_global: Number(e.target.value) })}
                  className="flex-1" />
                <span className="text-2xl font-bold font-mono w-12 text-center">{config.max_concurrent_global}</span>
              </div>
            </div>

            {/* Cooldown streak */}
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold">Cooldown tras racha de pérdidas</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Pausa global si hay N pérdidas seguidas entre todas las estrategias.
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ global_cooldown_enabled: !config.global_cooldown_enabled })}
                  className={`px-4 py-2 rounded text-sm font-bold ${config.global_cooldown_enabled ? 'bg-green-700' : 'bg-gray-600'}`}
                >
                  {config.global_cooldown_enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              {config.global_cooldown_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Pérdidas seguidas para activar</label>
                    <input type="number" min={1}
                      value={config.global_streak_losses}
                      onChange={e => updateConfig({ global_streak_losses: Number(e.target.value) })}
                      className="w-full bg-gray-700 rounded p-2" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Tiempo de pausa (minutos)</label>
                    <input type="number" min={1}
                      value={config.global_cooldown_minutes}
                      onChange={e => updateConfig({ global_cooldown_minutes: Number(e.target.value) })}
                      className="w-full bg-gray-700 rounded p-2" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── OBJETIVOS ── */}
        {activeTab === 'objetivos' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold">Stop de ganancias del día</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Si el bot alcanza esta ganancia en el día, se detiene para proteger los beneficios.
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ daily_target_enabled: !config.daily_target_enabled })}
                  className={`px-4 py-2 rounded text-sm font-bold ${config.daily_target_enabled ? 'bg-green-700' : 'bg-gray-600'}`}
                >
                  {config.daily_target_enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              {config.daily_target_enabled && (
                <div className="flex gap-3">
                  <div className="flex gap-1">
                    {(['fixed', 'percent'] as const).map(t => (
                      <button key={t} onClick={() => updateConfig({ daily_target_type: t })}
                        className={`px-3 py-2 rounded text-sm ${config.daily_target_type === t ? 'bg-green-700' : 'bg-gray-700'}`}>
                        {t === 'fixed' ? '$ Fijo' : '% Balance'}
                      </button>
                    ))}
                  </div>
                  <input type="number" min={0} step={config.daily_target_type === 'fixed' ? 10 : 1}
                    value={config.daily_target}
                    onChange={e => updateConfig({ daily_target: Number(e.target.value) })}
                    className="flex-1 bg-gray-700 rounded p-2" />
                  <span className="flex items-center text-gray-400">
                    {config.daily_target_type === 'fixed' ? 'USD' : '%'}
                  </span>
                </div>
              )}
            </div>

            {/* Summary when both limits active */}
            {config.max_daily_loss_enabled && config.daily_target_enabled && (
              <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700">
                <p className="text-sm font-semibold text-blue-300 mb-2">📊 Resumen de límites del día</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-red-400">Pérdida máx:</span>
                    <span className="ml-2 font-mono">
                      {config.max_daily_loss_type === 'fixed' ? `$${config.max_daily_loss}` : `${config.max_daily_loss}%`}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-400">Ganancia obj:</span>
                    <span className="ml-2 font-mono">
                      {config.daily_target_type === 'fixed' ? `$${config.daily_target}` : `${config.daily_target}%`}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HORARIO ── */}
        {activeTab === 'horario' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold">Horario global de operación</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    El bot no abre operaciones fuera de este horario, sin importar qué estrategia esté activa.
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ global_schedule_enabled: !config.global_schedule_enabled })}
                  className={`px-4 py-2 rounded text-sm font-bold ${config.global_schedule_enabled ? 'bg-green-700' : 'bg-gray-600'}`}
                >
                  {config.global_schedule_enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              {config.global_schedule_enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Hora de inicio (0–23)</label>
                    <input type="number" min={0} max={23}
                      value={config.global_start_hour}
                      onChange={e => updateConfig({ global_start_hour: Number(e.target.value) })}
                      className="w-full bg-gray-700 rounded p-2" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Hora de fin (0–23)</label>
                    <input type="number" min={0} max={23}
                      value={config.global_end_hour}
                      onChange={e => updateConfig({ global_end_hour: Number(e.target.value) })}
                      className="w-full bg-gray-700 rounded p-2" />
                  </div>
                </div>
              )}
              {config.global_schedule_enabled && (
                <div className="mt-3 p-3 bg-gray-700/50 rounded text-sm text-gray-300">
                  El bot operará de <strong>{String(config.global_start_hour).padStart(2,'0')}:00</strong> a{' '}
                  <strong>{String(config.global_end_hour).padStart(2,'0')}:00</strong> hora del servidor.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TELEGRAM ── */}
        {activeTab === 'telegram' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold">Notificaciones por Telegram</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Recibe alertas cuando se abre/cierra una operación o se activa un límite de riesgo.
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ telegram_enabled: !config.telegram_enabled })}
                  className={`px-4 py-2 rounded text-sm font-bold ${config.telegram_enabled ? 'bg-green-700' : 'bg-gray-600'}`}
                >
                  {config.telegram_enabled ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Bot Token</label>
                  <input
                    type="password"
                    placeholder="1234567890:ABCDEFabcdefGHIJKL..."
                    value={config.telegram_bot_token}
                    onChange={e => updateConfig({ telegram_bot_token: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Obtén el token creando un bot con @BotFather en Telegram.
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Chat ID</label>
                  <input
                    type="text"
                    placeholder="-100123456789 o tu ID personal"
                    value={config.telegram_chat_id}
                    onChange={e => updateConfig({ telegram_chat_id: e.target.value })}
                    className="w-full bg-gray-700 rounded p-2 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Usa @userinfobot para obtener tu chat_id.
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">Notificar cuando:</p>
                  <div className="space-y-2">
                    {[
                      { key: 'telegram_on_trade_open', label: 'Se abre una operación' },
                      { key: 'telegram_on_trade_close', label: 'Se cierra una operación (con resultado)' },
                      { key: 'telegram_on_risk_limit', label: 'Se activa un límite de riesgo' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config[opt.key as keyof GlobalRiskConfig] as boolean}
                          onChange={e => updateConfig({ [opt.key]: e.target.checked } as any)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={testTelegram}
                  disabled={isTesting || !config.telegram_bot_token || !config.telegram_chat_id}
                  className="px-6 py-2 bg-blue-700 hover:bg-blue-600 rounded text-sm font-medium disabled:opacity-50"
                >
                  {isTesting ? '⏳ Enviando...' : '📤 Enviar mensaje de prueba'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={saveConfig}
            disabled={isSaving}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold disabled:opacity-50"
          >
            {isSaving ? '⏳ Guardando...' : '✓ Guardar Risk Manager'}
          </button>
          <button
            onClick={() => setConfig({ ...DEFAULT_CONFIG })}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Restablecer
          </button>
        </div>
      </div>
    </div>
  );
}
