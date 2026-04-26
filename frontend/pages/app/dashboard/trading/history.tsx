// pages/app/dashboard/trading/history.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import api from '@/services/api';

interface TradeEntry {
  timestamp?: string;
  event_type?: string;
  source?: string;
  account_type?: string;
  email?: string;
  asset?: string;
  amount?: number;
  direction?: string;
  expiration?: number;
  order_id?: number;
  result?: string;
  profit?: number;
  extra?: any;
}

const TradingHistory = () => {
  const router = useRouter();
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterMode, setFilterMode] = useState<'ALL' | 'DEMO' | 'REAL'>('ALL');
  const [filterAsset, setFilterAsset] = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    const fetchTrades = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getTrades(500);
        setTrades(data.trades || []);
      } catch (err: any) {
        setError(err.message || 'Error al cargar el historial');
      } finally {
        setLoading(false);
      }
    };
    fetchTrades();
  }, []);

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'N/A';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  };

  // Unique asset list for filter dropdown
  const assetOptions = useMemo(() =>
    Array.from(new Set(trades.map(t => t.asset).filter(Boolean) as string[])).sort(),
    [trades]
  );

  // Filtered trades
  const filtered = useMemo(() => {
    return trades.filter(t => {
      if (filterMode !== 'ALL') {
        const at = (t.account_type || '').toUpperCase();
        if (filterMode === 'DEMO' && at === 'REAL') return false;
        if (filterMode === 'REAL' && at !== 'REAL') return false;
      }
      if (filterAsset && t.asset !== filterAsset) return false;
      if (filterDirection && (t.direction || '').toUpperCase() !== filterDirection) return false;
      if (filterResult && (t.result || '').toLowerCase() !== filterResult) return false;
      if (filterDateFrom && t.timestamp && t.timestamp < filterDateFrom) return false;
      if (filterDateTo && t.timestamp && t.timestamp > filterDateTo + 'T23:59:59') return false;
      return true;
    });
  }, [trades, filterMode, filterAsset, filterDirection, filterResult, filterDateFrom, filterDateTo]);

  // Stats from filtered trades
  const stats = useMemo(() => {
    const withResult = filtered.filter(t => t.result);
    const wins = withResult.filter(t => t.result === 'win').length;
    const losses = withResult.filter(t => t.result === 'loss').length;
    const total = withResult.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const totalPnl = filtered.reduce((sum, t) => sum + (t.profit ?? 0), 0);

    // Max drawdown (running)
    let peak = 0, trough = 0, maxDD = 0, running = 0;
    for (const t of filtered) {
      running += t.profit ?? 0;
      if (running > peak) { peak = running; trough = running; }
      if (running < trough) {
        trough = running;
        const dd = peak - trough;
        if (dd > maxDD) maxDD = dd;
      }
    }

    return { wins, losses, total, winRate, totalPnl, maxDD };
  }, [filtered]);

  // CSV export
  const exportCSV = () => {
    const header = ['Fecha/Hora', 'Modo', 'Activo', 'Dirección', 'Monto', 'Expiración', 'Resultado', 'P&L', 'Confianza', 'Fuente'];
    const rows = filtered.map(t => {
      const decision = t.extra?.decision;
      const confidence = decision?.confidence != null ? `${Math.round(decision.confidence * 100)}%` : '';
      return [
        t.timestamp || '',
        t.account_type || '',
        t.asset || '',
        t.direction || '',
        t.amount != null ? t.amount.toFixed(2) : '',
        t.expiration != null ? String(t.expiration) : '',
        t.result || '',
        t.profit != null ? t.profit.toFixed(2) : '',
        confidence,
        t.source || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_${filterMode.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">📜 Historial de Operaciones</h1>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} de {trades.length} operaciones</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium">
              ⬇️ Exportar CSV
            </button>
            <button onClick={() => router.push('/app/dashboard')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm">
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-4">

        {/* Demo / Real selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 font-medium">Modo:</span>
          {(['ALL', 'DEMO', 'REAL'] as const).map(m => (
            <button key={m} onClick={() => setFilterMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-bold ${
                filterMode === m
                  ? m === 'REAL' ? 'bg-red-700 text-white' : m === 'DEMO' ? 'bg-emerald-700 text-white' : 'bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}>
              {m === 'REAL' ? '🔴 REAL' : m === 'DEMO' ? '🟢 DEMO' : 'Todos'}
            </button>
          ))}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total ops', value: String(stats.total), color: 'text-white' },
            { label: 'Ganadas', value: String(stats.wins), color: 'text-green-400' },
            { label: 'Perdidas', value: String(stats.losses), color: 'text-red-400' },
            { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 55 ? 'text-green-400' : 'text-yellow-400' },
            { label: 'P&L Total', value: `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center border border-gray-700">
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        {stats.maxDD > 0 && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-sm">
            ⚠️ Drawdown máximo (filtro actual): <strong className="text-red-400">${stats.maxDD.toFixed(2)}</strong>
          </div>
        )}

        {/* Filters row */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Activo</label>
              <select value={filterAsset} onChange={e => setFilterAsset(e.target.value)}
                className="w-full bg-gray-700 rounded p-2 text-sm">
                <option value="">Todos</option>
                {assetOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Dirección</label>
              <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)}
                className="w-full bg-gray-700 rounded p-2 text-sm">
                <option value="">Todas</option>
                <option value="CALL">CALL ↑</option>
                <option value="PUT">PUT ↓</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Resultado</label>
              <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
                className="w-full bg-gray-700 rounded p-2 text-sm">
                <option value="">Todos</option>
                <option value="win">Win ✓</option>
                <option value="loss">Loss ✗</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Desde</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full bg-gray-700 rounded p-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Hasta</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                className="w-full bg-gray-700 rounded p-2 text-sm" />
            </div>
          </div>
          <button onClick={() => {
            setFilterAsset(''); setFilterDirection(''); setFilterResult('');
            setFilterDateFrom(''); setFilterDateTo('');
          }}
            className="mt-3 text-xs text-gray-400 hover:text-gray-200 underline">
            Limpiar filtros
          </button>
        </div>

        {loading && <p className="text-center text-gray-400 py-12">Cargando historial...</p>}
        {error && <p className="text-center text-red-400 py-6">{error}</p>}

        {!loading && !error && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="bg-gray-700 text-gray-300 text-left">
                  <th className="px-3 py-2">Fecha/Hora</th>
                  <th className="px-3 py-2">Modo</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2">Dir.</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Exp.</th>
                  <th className="px-3 py-2">Resultado</th>
                  <th className="px-3 py-2">P&L</th>
                  <th className="px-3 py-2">Confianza</th>
                  <th className="px-3 py-2">Razones IA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500">
                      No hay operaciones con los filtros actuales.
                    </td>
                  </tr>
                )}
                {filtered.map((trade, idx) => {
                  const decision = trade.extra?.decision;
                  const reasons: string[] = decision?.reasons || [];
                  const confidence = decision?.confidence;
                  const isReal = (trade.account_type || '').toUpperCase() === 'REAL';
                  const isWin = trade.result === 'win';
                  const isLoss = trade.result === 'loss';

                  return (
                    <tr key={trade.order_id || `${trade.timestamp}-${idx}`}
                      className={`border-b border-gray-700 align-top hover:bg-gray-700/40 ${
                        isWin ? 'bg-green-900/10' : isLoss ? 'bg-red-900/10' : ''
                      }`}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-300 text-xs">{formatTimestamp(trade.timestamp)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isReal ? 'bg-red-800 text-red-200' : 'bg-emerald-900 text-emerald-300'}`}>
                          {isReal ? 'REAL' : 'DEMO'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-blue-300">{trade.asset || '-'}</td>
                      <td className="px-3 py-2">
                        {trade.direction ? (
                          <span className={`font-bold ${trade.direction.toUpperCase() === 'CALL' ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.direction.toUpperCase() === 'CALL' ? '↑ CALL' : '↓ PUT'}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 font-mono">{trade.amount != null ? `$${trade.amount.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2 text-gray-400">{trade.expiration != null ? `${trade.expiration}m` : '-'}</td>
                      <td className="px-3 py-2">
                        {trade.result ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${isWin ? 'bg-green-700 text-green-100' : 'bg-red-700 text-red-100'}`}>
                            {isWin ? '✓ WIN' : '✗ LOSS'}
                          </span>
                        ) : <span className="text-gray-500 text-xs">Pendiente</span>}
                      </td>
                      <td className={`px-3 py-2 font-mono font-bold ${
                        (trade.profit ?? 0) > 0 ? 'text-green-400' : (trade.profit ?? 0) < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {trade.profit != null ? `${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {confidence != null ? (
                          <span className={`text-xs font-mono ${confidence >= 0.7 ? 'text-green-400' : confidence >= 0.55 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {Math.round(confidence * 100)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        {reasons.length > 0 ? (
                          <ul className="text-xs text-gray-400 space-y-0.5">
                            {reasons.slice(0, 3).map((r, i) => <li key={i}>· {r}</li>)}
                            {reasons.length > 3 && <li className="text-gray-600">+{reasons.length - 3} más</li>}
                          </ul>
                        ) : (
                          <span className="text-gray-600 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingHistory;

