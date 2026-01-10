import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface BacktestTrade {
  date: string;
  profit: number;
  cumulative: number;
  type: 'win' | 'loss';
}

interface BacktestingChartProps {
  trades?: BacktestTrade[];
  initialCapital?: number;
  title?: string;
  height?: number;
}

const BacktestingChart: React.FC<BacktestingChartProps> = ({
  trades = [],
  initialCapital = 1000,
  title = 'Curva de Equity - Backtesting',
  height = 350,
}) => {
  const chartData = useMemo(() => {
    if (trades.length === 0) {
      // Datos demo para visualización
      const demoTrades: BacktestTrade[] = [];
      let cumulative = initialCapital;
      for (let i = 0; i < 30; i++) {
        const isWin = Math.random() > 0.4;
        const profit = isWin ? Math.random() * 50 + 10 : -(Math.random() * 30 + 5);
        cumulative += profit;
        demoTrades.push({
          date: `Trade ${i + 1}`,
          profit,
          cumulative,
          type: isWin ? 'win' : 'loss',
        });
      }
      return {
        labels: demoTrades.map((t) => t.date),
        datasets: [
          {
            label: 'Equity',
            data: demoTrades.map((t) => t.cumulative),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: demoTrades.map((t) =>
              t.type === 'win' ? '#22C55E' : '#EF4444'
            ),
          },
          {
            label: 'Capital Inicial',
            data: Array(demoTrades.length).fill(initialCapital),
            borderColor: '#9CA3AF',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
          },
        ],
      };
    }

    return {
      labels: trades.map((t) => t.date),
      datasets: [
        {
          label: 'Equity',
          data: trades.map((t) => t.cumulative),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: trades.map((t) =>
            t.type === 'win' ? '#22C55E' : '#EF4444'
          ),
        },
        {
          label: 'Capital Inicial',
          data: Array(trades.length).fill(initialCapital),
          borderColor: '#9CA3AF',
          borderWidth: 1,
          borderDash: [5, 5],
          fill: false,
          pointRadius: 0,
        },
      ],
    };
  }, [trades, initialCapital]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { usePointStyle: true, boxWidth: 6 },
      },
      title: {
        display: true,
        text: title,
        font: { size: 16, weight: 'bold' as const },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y;
            return `${context.dataset.label}: $${value.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: { display: false },
        ticks: { maxTicksLimit: 10 },
      },
      y: {
        display: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: {
          callback: (value: any) => `$${value}`,
        },
      },
    },
  };

  // Calcular métricas
  const finalEquity = trades.length > 0 ? trades[trades.length - 1].cumulative : initialCapital;
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
  const wins = trades.filter((t) => t.type === 'win').length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div style={{ height }}>
        <Line data={chartData} options={options} />
      </div>
      
      <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase">Capital Inicial</p>
          <p className="text-lg font-bold text-gray-700">${initialCapital.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase">Capital Final</p>
          <p className={`text-lg font-bold ${finalEquity >= initialCapital ? 'text-green-600' : 'text-red-600'}`}>
            ${finalEquity.toFixed(2)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase">Retorno</p>
          <p className={`text-lg font-bold ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase">Win Rate</p>
          <p className="text-lg font-bold text-blue-600">{winRate.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
};

export default BacktestingChart;
