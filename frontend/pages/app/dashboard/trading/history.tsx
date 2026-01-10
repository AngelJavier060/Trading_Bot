// pages/app/dashboard/trading/history.tsx
import React, { useEffect, useState } from 'react';
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
  extra?: any;
}

const TradingHistory = () => {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrades = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getTrades(200);
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
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-bold text-center text-blue-900 mb-4">Historial de Operaciones</h1>
      <p className="text-center text-gray-600 mb-6">
        Datos obtenidos desde el backend (/api/trading/trades) con explicación de la estrategia.
      </p>

      {loading && <p className="text-center">Cargando historial...</p>}
      {error && <p className="text-center text-red-500 mb-4">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded shadow-lg overflow-x-auto">
          <table className="table-auto w-full">
            <thead>
              <tr className="bg-blue-900 text-white text-left">
                <th className="px-4 py-2">Fecha/Hora</th>
                <th className="px-4 py-2">Tipo evento</th>
                <th className="px-4 py-2">Fuente</th>
                <th className="px-4 py-2">Activo</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Dirección</th>
                <th className="px-4 py-2">Explicación IA</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, idx) => {
                const decision = trade.extra?.decision;
                const indicators = decision?.indicators;
                const reasons: string[] = decision?.reasons || [];

                return (
                  <tr key={trade.order_id || `${trade.timestamp}-${idx}`} className="border-b align-top">
                    <td className="px-4 py-2 whitespace-nowrap">{formatTimestamp(trade.timestamp)}</td>
                    <td className="px-4 py-2">{trade.event_type || 'N/A'}</td>
                    <td className="px-4 py-2">{trade.source || 'N/A'}</td>
                    <td className="px-4 py-2">{trade.asset || '-'}</td>
                    <td className="px-4 py-2">{trade.amount != null ? `$${trade.amount.toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-2">{trade.direction || '-'}</td>
                    <td className="px-4 py-2">
                      {decision ? (
                        <div className="text-sm space-y-1">
                          <div>
                            <span className="font-semibold">Señal:</span>{' '}
                            <span className="uppercase">{decision.signal || '-'}</span>{' '}
                            {decision.confidence != null && (
                              <span className="ml-2 text-gray-600">({Math.round(decision.confidence * 100)}% confianza)</span>
                            )}
                          </div>
                          {reasons.length > 0 && (
                            <div>
                              <span className="font-semibold">Razones:</span>
                              <ul className="list-disc list-inside text-gray-700">
                                {reasons.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {indicators && (
                            <div className="text-gray-600">
                              <span className="font-semibold">Indicadores:</span>{' '}
                              <span>
                                Cierre: {indicators.close?.toFixed?.(5) ?? indicators.close}{' '}
                                | EMA rápida: {indicators.ema_fast?.toFixed?.(5) ?? indicators.ema_fast}{' '}
                                | EMA lenta: {indicators.ema_slow?.toFixed?.(5) ?? indicators.ema_slow}{' '}
                                | RSI: {indicators.rsi?.toFixed?.(2) ?? indicators.rsi}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Sin explicación</span>
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
  );
};

export default TradingHistory;

