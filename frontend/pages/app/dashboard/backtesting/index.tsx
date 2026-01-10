import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import api from "../../../../services/api";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Strategy {
  id: string;
  name: string;
  description: string;
  version: string;
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
  expectancy: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
}

interface BacktestResult {
  metrics: BacktestMetrics;
  trades: any[];
  equity_curve: any[];
  daily_pnl: any[];
  start_balance: number;
  end_balance: number;
  execution_time_seconds: number;
}

const Backtesting = () => {
  const router = useRouter();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState("ema_rsi");
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Config state
  const [config, setConfig] = useState({
    initial_capital: 10000,
    trade_amount: 100,
    payout_rate: 0.85,
    min_confidence: 50,
    num_candles: 500,
  });

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      const data = await api.getStrategies();
      setStrategies(data.strategies || []);
    } catch (err: any) {
      console.error("Error loading strategies:", err);
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      const data = await api.runQuickBacktest({
        strategy_name: selectedStrategy,
        num_candles: config.num_candles,
        initial_capital: config.initial_capital,
        trade_amount: config.trade_amount,
        payout_rate: config.payout_rate,
        min_confidence: config.min_confidence,
      });

      setResults(data.result);
    } catch (err: any) {
      setError(err.message || "Error al ejecutar backtesting");
    } finally {
      setIsRunning(false);
    }
  };

  const compareStrategies = async () => {
    setIsRunning(true);
    setError(null);

    try {
      const strategyIds = strategies.map(s => s.id);
      const data = await api.compareStrategies(strategyIds, {
        initial_capital: config.initial_capital,
        trade_amount: config.trade_amount,
        payout_rate: config.payout_rate,
        min_confidence: config.min_confidence,
      });

      alert(`Ranking:\n${data.ranking.map((r: any, i: number) => 
        `${i + 1}. ${r.strategy}: ${r.return.toFixed(2)}%`
      ).join('\n')}`);
    } catch (err: any) {
      setError(err.message || "Error al comparar estrategias");
    } finally {
      setIsRunning(false);
    }
  };

  const getEquityChartData = () => {
    if (!results?.equity_curve?.length) return null;

    return {
      labels: results.equity_curve.map((_, i) => i.toString()),
      datasets: [
        {
          label: "Balance ($)",
          data: results.equity_curve.map((e: any) => e.balance),
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Curva de Equity' },
    },
    scales: {
      y: { beginAtZero: false },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Backtesting Profesional</h1>
          <p className="text-gray-500">Prueba estrategias con datos históricos</p>
        </div>
        <button
          onClick={() => router.push("/app/dashboard")}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Volver al Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Configuración</h2>

          {/* Strategy Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estrategia
            </label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} - {s.description.substring(0, 40)}...
                </option>
              ))}
            </select>
          </div>

          {/* Capital Inicial */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Capital Inicial ($)
            </label>
            <input
              type="number"
              value={config.initial_capital}
              onChange={(e) => setConfig({ ...config, initial_capital: Number(e.target.value) })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Monto por operación */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Monto por Operación ($)
            </label>
            <input
              type="number"
              value={config.trade_amount}
              onChange={(e) => setConfig({ ...config, trade_amount: Number(e.target.value) })}
              className="w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Payout */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payout Rate ({(config.payout_rate * 100).toFixed(0)}%)
            </label>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={config.payout_rate}
              onChange={(e) => setConfig({ ...config, payout_rate: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Min Confidence */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confianza Mínima ({config.min_confidence}%)
            </label>
            <input
              type="range"
              min="30"
              max="90"
              step="5"
              value={config.min_confidence}
              onChange={(e) => setConfig({ ...config, min_confidence: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Candles */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período de Prueba ({config.num_candles} velas)
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={config.num_candles}
              onChange={(e) => setConfig({ ...config, num_candles: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={runBacktest}
              disabled={isRunning}
              className={`w-full py-3 rounded-lg font-medium text-white transition-colors ${
                isRunning
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isRunning ? "Ejecutando..." : "🚀 Ejecutar Backtesting"}
            </button>

            <button
              onClick={compareStrategies}
              disabled={isRunning}
              className="w-full py-3 rounded-lg font-medium text-blue-600 border border-blue-600 hover:bg-blue-50"
            >
              📊 Comparar Todas las Estrategias
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metrics Cards */}
          {results && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-md p-4 text-center">
                  <p className="text-sm text-gray-500">Retorno Total</p>
                  <p className={`text-2xl font-bold ${results.metrics.total_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {results.metrics.total_return >= 0 ? '+' : ''}{results.metrics.total_return.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-md p-4 text-center">
                  <p className="text-sm text-gray-500">Win Rate</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {results.metrics.win_rate.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-md p-4 text-center">
                  <p className="text-sm text-gray-500">Profit Factor</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {results.metrics.profit_factor.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-md p-4 text-center">
                  <p className="text-sm text-gray-500">Max Drawdown</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {results.metrics.max_drawdown_pct.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Detailed Stats */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Estadísticas Detalladas</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Operaciones:</span>
                    <span className="font-medium">{results.metrics.total_trades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ganadas:</span>
                    <span className="font-medium text-green-600">{results.metrics.winning_trades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Perdidas:</span>
                    <span className="font-medium text-red-600">{results.metrics.losing_trades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">P&L Total:</span>
                    <span className={`font-medium ${results.metrics.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${results.metrics.total_pnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expectativa:</span>
                    <span className="font-medium">${results.metrics.expectancy.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sharpe Ratio:</span>
                    <span className="font-medium">{results.metrics.sharpe_ratio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Racha Ganadora:</span>
                    <span className="font-medium text-green-600">{results.metrics.max_consecutive_wins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Racha Perdedora:</span>
                    <span className="font-medium text-red-600">{results.metrics.max_consecutive_losses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tiempo Ejecución:</span>
                    <span className="font-medium">{results.execution_time_seconds.toFixed(2)}s</span>
                  </div>
                </div>
              </div>

              {/* Equity Chart */}
              {getEquityChartData() && (
                <div className="bg-white rounded-xl shadow-md p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Curva de Equity</h3>
                  <div className="h-64">
                    <Line data={getEquityChartData()!} options={chartOptions} />
                  </div>
                </div>
              )}

              {/* Recent Trades */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Últimas Operaciones ({Math.min(10, results.trades.length)} de {results.trades.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">#</th>
                        <th className="text-left py-2">Activo</th>
                        <th className="text-left py-2">Dirección</th>
                        <th className="text-right py-2">Monto</th>
                        <th className="text-right py-2">P&L</th>
                        <th className="text-center py-2">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.trades.slice(-10).reverse().map((trade: any) => (
                        <tr key={trade.id} className="border-b hover:bg-gray-50">
                          <td className="py-2">{trade.id}</td>
                          <td className="py-2">{trade.asset}</td>
                          <td className="py-2">
                            <span className={trade.direction === 'call' ? 'text-green-600' : 'text-red-600'}>
                              {trade.direction === 'call' ? '📈 CALL' : '📉 PUT'}
                            </span>
                          </td>
                          <td className="text-right py-2">${trade.amount}</td>
                          <td className={`text-right py-2 font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                          </td>
                          <td className="text-center py-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              trade.result === 'win' ? 'bg-green-100 text-green-800' :
                              trade.result === 'loss' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {trade.result === 'win' ? '✓ WIN' : trade.result === 'loss' ? '✗ LOSS' : '- TIE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Empty State */}
          {!results && !isRunning && (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Listo para Backtesting
              </h3>
              <p className="text-gray-500">
                Configura los parámetros y ejecuta el backtesting para ver los resultados
              </p>
            </div>
          )}

          {/* Loading State */}
          {isRunning && (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <div className="animate-spin text-6xl mb-4">⚙️</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Ejecutando Backtesting...
              </h3>
              <p className="text-gray-500">
                Analizando {config.num_candles} velas con estrategia {selectedStrategy}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Backtesting;
