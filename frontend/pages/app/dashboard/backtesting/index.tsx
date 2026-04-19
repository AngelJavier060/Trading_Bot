import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import {
  Play, Pause, Square, SkipForward, TrendingUp, TrendingDown,
  BarChart2, Activity, Target, AlertTriangle, ArrowLeft,
  Database, Cpu, Calendar, ChevronDown, ChevronUp, RefreshCw,
  CheckCircle, XCircle, Award,
} from "lucide-react";
import api from "../../../../services/api";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ─── Types ───────────────────────────────────────────────────────────────────
interface Strategy { id: string; name: string; description: string; }
interface Symbol { symbol: string; label: string; category: string; }
interface BacktestMetrics {
  total_trades: number; winning_trades: number; losing_trades: number;
  win_rate: number; total_pnl: number; total_return: number;
  max_drawdown: number; max_drawdown_pct: number; profit_factor: number;
  sharpe_ratio: number; sortino_ratio: number; expectancy: number;
  max_consecutive_wins: number; max_consecutive_losses: number;
  best_day_pnl: number; worst_day_pnl: number; trades_per_day: number;
  avg_win: number; avg_loss: number; recovery_factor: number;
}
interface BacktestResult {
  metrics: BacktestMetrics; trades: any[]; equity_curve: any[];
  daily_pnl: any[]; monthly_pnl: any[];
  start_balance: number; end_balance: number;
  execution_time_seconds: number; data_info?: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TIMEFRAMES = ['1m','5m','15m','30m','1h','4h','1d'];
const EXPIRATIONS = [1,2,3,5,10,15,30];

const MetricCard = ({ label, value, sub, color = 'text-white', icon }: any) => (
  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-slate-400">{label}</span>
      {icon && <span className="text-slate-500">{icon}</span>}
    </div>
    <p className={`text-xl font-bold ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
const Backtesting = () => {
  const router = useRouter();
  const [strategies, setStrategies]   = useState<Strategy[]>([]);
  const [symbols, setSymbols]         = useState<Symbol[]>([]);
  const [isRunning, setIsRunning]     = useState(false);
  const [results, setResults]         = useState<BacktestResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [replayIdx, setReplayIdx]     = useState(0);
  const [replaying, setReplaying]     = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(80);
  const [tradePage, setTradePage]     = useState(0);
  const replayRef = useRef<any>(null);
  const TRADES_PER_PAGE = 15;

  const [cfg, setCfg] = useState({
    strategy_name:    'ema_rsi',
    assets:           ['EURUSD'],
    timeframe:        '5m',
    days_back:        30,
    initial_capital:  10000,
    trade_amount:     100,
    payout_rate:      0.85,
    min_confidence:   55,
    expiration_minutes: 5,
    max_trades_per_day: 50,
    stop_loss_daily:  0.10,
    take_profit_daily:0.20,
    use_real_data:    true,
  });

  useEffect(() => {
    Promise.all([api.getStrategies(), api.getBacktestSymbols()]).then(([s, sy]) => {
      setStrategies(s.strategies || []);
      setSymbols(sy.symbols || []);
    }).catch(() => {});
  }, []);

  // ─── Replay ───────────────────────────────────────────────────────────────
  const startReplay = useCallback(() => {
    if (!results) return;
    setReplayIdx(0);
    setReplaying(true);
  }, [results]);

  const stopReplay = () => { setReplaying(false); clearInterval(replayRef.current); };

  useEffect(() => {
    if (!replaying || !results) return;
    replayRef.current = setInterval(() => {
      setReplayIdx(prev => {
        if (prev >= results.equity_curve.length - 1) { setReplaying(false); return prev; }
        return prev + 1;
      });
    }, replaySpeed);
    return () => clearInterval(replayRef.current);
  }, [replaying, replaySpeed, results]);

  // ─── Run backtest ─────────────────────────────────────────────────────────
  const runBacktest = async () => {
    setIsRunning(true); setError(null); setResults(null); setReplayIdx(0);
    try {
      const fn = cfg.use_real_data ? api.runAutoBacktest : api.runQuickBacktest;
      const payload = cfg.use_real_data
        ? { ...cfg }
        : { strategy_name: cfg.strategy_name, num_candles: cfg.days_back * 288,
            initial_capital: cfg.initial_capital, trade_amount: cfg.trade_amount,
            payout_rate: cfg.payout_rate, min_confidence: cfg.min_confidence };
      const data = await (fn as any)(payload);
      setResults(data.result);
    } catch (err: any) {
      setError(err.message || 'Error al ejecutar backtesting');
    } finally { setIsRunning(false); }
  };

  // ─── Chart data (respects replay) ─────────────────────────────────────────
  const equityCurve = results?.equity_curve || [];
  const displayCurve = replaying || replayIdx > 0
    ? equityCurve.slice(0, replayIdx + 1) : equityCurve;

  const equityChartData = {
    labels: displayCurve.map((_: any, i: number) => i === 0 ? 'Inicio' : `${i}`),
    datasets: [{
      label: 'Balance ($)',
      data: displayCurve.map((e: any) => e.balance),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
    }],
  };

  const monthlyBarData = results?.monthly_pnl?.length ? {
    labels: results.monthly_pnl.map((m: any) => m.month),
    datasets: [{
      label: 'P&L Mensual ($)',
      data: results.monthly_pnl.map((m: any) => m.pnl),
      backgroundColor: results.monthly_pnl.map((m: any) => m.pnl >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'),
    }],
  } : null;

  const chartOpts: any = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };

  const m = results?.metrics;
  const tradePage_items = results?.trades.slice(tradePage * TRADES_PER_PAGE, (tradePage + 1) * TRADES_PER_PAGE) || [];
  const totalPages = Math.ceil((results?.trades.length || 0) / TRADES_PER_PAGE);
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  const toggleAsset = (sym: string) => {
    setCfg(c => ({
      ...c,
      assets: c.assets.includes(sym) ? c.assets.filter(a => a !== sym) : [...c.assets, sym],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/app/dashboard')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-blue-400" /> Backtesting Profesional
            </h1>
            <p className="text-xs text-slate-500">Análisis histórico con datos reales · Yahoo Finance</p>
          </div>
        </div>
        {results?.data_info && (
          <div className="flex items-center gap-2 text-xs bg-blue-900/30 border border-blue-700/50 px-3 py-1.5 rounded-lg text-blue-300">
            <Database className="w-3.5 h-3.5" />
            {results.data_info.source === 'yfinance' ? 'Datos reales · yfinance' : 'Datos simulados'}
            &nbsp;·&nbsp;{(Object.values(results.data_info.candles_per_asset as Record<string,number>) as number[]).reduce((a, b) => a + b, 0)} velas
          </div>
        )}
      </div>

      <div className="flex gap-0">
        {/* ── Config sidebar ── */}
        <aside className="w-80 min-h-screen border-r border-slate-800 p-4 space-y-4 overflow-y-auto">
          {/* Data source toggle */}
          <div className="flex gap-1 p-1 bg-slate-800 rounded-lg">
            {[true, false].map(real => (
              <button key={String(real)} onClick={() => setCfg(c => ({ ...c, use_real_data: real }))}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  cfg.use_real_data === real ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {real ? <><Database className="w-3 h-3 inline mr-1" />Datos Reales</> : <><Cpu className="w-3 h-3 inline mr-1" />Simulado</>}
              </button>
            ))}
          </div>

          {/* Strategy */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Estrategia</label>
            <select value={cfg.strategy_name} onChange={e => setCfg(c => ({ ...c, strategy_name: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none">
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Assets */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Activos ({cfg.assets.length} seleccionados)</label>
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto pr-1">
              {symbols.map(s => (
                <button key={s.symbol} onClick={() => toggleAsset(s.symbol)}
                  className={`text-xs px-2 py-1.5 rounded-md border transition-colors text-left ${
                    cfg.assets.includes(s.symbol)
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe & Expiration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Timeframe</label>
              <select value={cfg.timeframe} onChange={e => setCfg(c => ({ ...c, timeframe: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-2 focus:outline-none">
                {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Expiración (min)</label>
              <select value={cfg.expiration_minutes} onChange={e => setCfg(c => ({ ...c, expiration_minutes: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-2 focus:outline-none">
                {EXPIRATIONS.map(n => <option key={n} value={n}>{n}m</option>)}
              </select>
            </div>
          </div>

          {/* Days back */}
          {cfg.use_real_data && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Período <span className="text-slate-500">({cfg.days_back} días)</span>
              </label>
              <input type="range" min={5} max={58} step={1} value={cfg.days_back}
                onChange={e => setCfg(c => ({ ...c, days_back: Number(e.target.value) }))}
                className="w-full accent-blue-500" />
              <div className="flex justify-between text-xs text-slate-600 mt-0.5"><span>5d</span><span>58d</span></div>
            </div>
          )}

          {/* Capital */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Capital ($)</label>
              <input type="number" value={cfg.initial_capital} min={100}
                onChange={e => setCfg(c => ({ ...c, initial_capital: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-2 py-2 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Monto/op ($)</label>
              <input type="number" value={cfg.trade_amount} min={1}
                onChange={e => setCfg(c => ({ ...c, trade_amount: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-2 py-2 focus:outline-none" />
            </div>
          </div>

          {/* Sliders */}
          {[
            { key: 'payout_rate',     label: `Payout ${(cfg.payout_rate*100).toFixed(0)}%`,       min: 0.5, max: 0.95, step: 0.01 },
            { key: 'min_confidence',  label: `Confianza mín ${cfg.min_confidence}%`,               min: 30,  max: 90,  step: 5    },
            { key: 'stop_loss_daily', label: `Stop-loss diario ${(cfg.stop_loss_daily*100).toFixed(0)}%`, min: 0.02, max: 0.3, step: 0.01 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key}>
              <label className="block text-xs text-slate-400 mb-1">{label}</label>
              <input type="range" min={min} max={max} step={step} value={(cfg as any)[key]}
                onChange={e => setCfg(c => ({ ...c, [key]: Number(e.target.value) }))}
                className="w-full accent-blue-500" />
            </div>
          ))}

          {/* Run button */}
          <button onClick={runBacktest} disabled={isRunning || cfg.assets.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            {isRunning
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analizando...</>
              : <><Play className="w-4 h-4" /> Ejecutar Backtesting</>}
          </button>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300">
              <AlertTriangle className="w-3 h-3 inline mr-1" /> {error}
            </div>
          )}
        </aside>

        {/* ── Results main ── */}
        <main className="flex-1 p-4 space-y-4 overflow-y-auto">

          {/* Empty / loading */}
          {!results && !isRunning && (
            <div className="flex flex-col items-center justify-center h-96 text-slate-600">
              <BarChart2 className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">Configura y ejecuta el análisis</p>
              <p className="text-sm mt-1">Selecciona estrategia, activos y período</p>
            </div>
          )}
          {isRunning && (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400">
              <RefreshCw className="w-12 h-12 animate-spin mb-4 text-blue-500" />
              <p className="text-lg font-semibold">Descargando datos y ejecutando análisis...</p>
              <p className="text-sm mt-2 text-slate-500">
                {cfg.use_real_data ? `Obteniendo ${cfg.days_back} días de Yahoo Finance` : 'Generando datos simulados'}
              </p>
            </div>
          )}

          {results && m && (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
                <MetricCard label="Retorno Total" icon={<TrendingUp className="w-4 h-4" />}
                  value={pct(m.total_return)}
                  color={m.total_return >= 0 ? 'text-green-400' : 'text-red-400'} />
                <MetricCard label="Win Rate" icon={<Target className="w-4 h-4" />}
                  value={`${m.win_rate.toFixed(1)}%`}
                  color={m.win_rate >= 55 ? 'text-green-400' : m.win_rate >= 50 ? 'text-yellow-400' : 'text-red-400'}
                  sub={`${m.winning_trades}W · ${m.losing_trades}L`} />
                <MetricCard label="Profit Factor"
                  value={m.profit_factor.toFixed(2)}
                  color={m.profit_factor >= 1.3 ? 'text-green-400' : m.profit_factor >= 1 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="Max Drawdown" icon={<TrendingDown className="w-4 h-4" />}
                  value={`${m.max_drawdown_pct.toFixed(2)}%`}
                  color={m.max_drawdown_pct <= 10 ? 'text-green-400' : m.max_drawdown_pct <= 20 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="Sharpe Ratio" icon={<Award className="w-4 h-4" />}
                  value={m.sharpe_ratio.toFixed(2)}
                  color={m.sharpe_ratio >= 1 ? 'text-green-400' : m.sharpe_ratio >= 0 ? 'text-yellow-400' : 'text-red-400'} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="P&L Total ($)" value={`${m.total_pnl >= 0 ? '+' : ''}$${m.total_pnl.toFixed(0)}`}
                  color={m.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}
                  sub={`Capital inicial $${results.start_balance.toLocaleString()}`} />
                <MetricCard label="Expectativa" value={`$${m.expectancy.toFixed(2)}/op`}
                  color={m.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <MetricCard label="Racha ganadora" value={`${m.max_consecutive_wins} seguidas`} color="text-emerald-400" />
                <MetricCard label="Racha perdedora" value={`${m.max_consecutive_losses} seguidas`} color="text-red-400" />
              </div>

              {/* Equity curve */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" /> Curva de Equity
                    {(replaying || replayIdx > 0) && (
                      <span className="text-xs text-blue-400">
                        · vela {replayIdx + 1}/{equityCurve.length}
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    <input type="range" min={20} max={300} step={10} value={replaySpeed}
                      onChange={e => setReplaySpeed(Number(e.target.value))}
                      className="w-20 accent-blue-500" title="Velocidad replay" />
                    <span className="text-xs text-slate-500">{replaySpeed}ms</span>
                    {!replaying
                      ? <button onClick={startReplay} title="Iniciar replay"
                          className="p-1.5 bg-blue-600/30 hover:bg-blue-600 border border-blue-600 rounded-lg transition-colors">
                          <Play className="w-3.5 h-3.5 text-blue-300" />
                        </button>
                      : <button onClick={stopReplay} title="Detener replay"
                          className="p-1.5 bg-red-600/30 hover:bg-red-600 border border-red-500 rounded-lg transition-colors">
                          <Square className="w-3.5 h-3.5 text-red-300" />
                        </button>
                    }
                    {replayIdx > 0 && !replaying && (
                      <button onClick={() => { setReplayIdx(0); }} title="Reiniciar"
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                        <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
                      </button>
                    )}
                    <button onClick={() => setReplayIdx(equityCurve.length - 1)} title="Ir al final"
                      className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                      <SkipForward className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                  </div>
                </div>
                <div className="h-52">
                  <Line data={equityChartData} options={chartOpts} />
                </div>
              </div>

              {/* Monthly P&L */}
              {monthlyBarData && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-400" /> P&L Mensual
                  </h3>
                  <div className="h-40">
                    <Bar data={monthlyBarData} options={chartOpts} />
                  </div>
                </div>
              )}

              {/* Trade log */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Registro de Operaciones
                    <span className="ml-2 text-xs text-slate-500">
                      ({results.trades.length} total · {m.trades_per_day.toFixed(1)}/día)
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <button onClick={() => setTradePage(p => Math.max(0, p - 1))}
                      disabled={tradePage === 0}
                      className="px-2 py-1 bg-slate-700 rounded disabled:opacity-40 hover:bg-slate-600">‹</button>
                    {tradePage + 1} / {Math.max(1, totalPages)}
                    <button onClick={() => setTradePage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={tradePage >= totalPages - 1}
                      className="px-2 py-1 bg-slate-700 rounded disabled:opacity-40 hover:bg-slate-600">›</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400">
                        <th className="text-left pb-2 pr-3">#</th>
                        <th className="text-left pb-2 pr-3">Activo</th>
                        <th className="text-left pb-2 pr-3">Fecha</th>
                        <th className="text-left pb-2 pr-3">Dir.</th>
                        <th className="text-right pb-2 pr-3">Entrada</th>
                        <th className="text-right pb-2 pr-3">Salida</th>
                        <th className="text-right pb-2 pr-3">Monto</th>
                        <th className="text-right pb-2 pr-3">P&L</th>
                        <th className="text-center pb-2">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradePage_items.map((t: any) => (
                        <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-1.5 pr-3 text-slate-500">{t.id}</td>
                          <td className="py-1.5 pr-3 font-medium">{t.asset}</td>
                          <td className="py-1.5 pr-3 text-slate-400">
                            {new Date(t.timestamp).toLocaleDateString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-1.5 pr-3">
                            {t.direction === 'call'
                              ? <span className="flex items-center gap-1 text-green-400"><TrendingUp className="w-3 h-3" />CALL</span>
                              : <span className="flex items-center gap-1 text-red-400"><TrendingDown className="w-3 h-3" />PUT</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-slate-300">{t.entry_price?.toFixed(5)}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-300">{t.exit_price?.toFixed(5)}</td>
                          <td className="py-1.5 pr-3 text-right">${t.amount?.toFixed(0)}</td>
                          <td className={`py-1.5 pr-3 text-right font-medium ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-center">
                            {t.result === 'win'
                              ? <CheckCircle className="w-3.5 h-3.5 text-green-400 inline" />
                              : t.result === 'loss'
                              ? <XCircle className="w-3.5 h-3.5 text-red-400 inline" />
                              : <span className="text-slate-500">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Execution info */}
              <div className="text-xs text-slate-600 text-right pb-2">
                Ejecutado en {results.execution_time_seconds.toFixed(2)}s
                {results.data_info && ` · ${results.data_info.timeframe} · ${results.data_info.days_back} días`}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Backtesting;
