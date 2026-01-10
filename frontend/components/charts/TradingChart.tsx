import React, { useEffect, useState } from 'react';
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
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradingChartProps {
  data?: CandleData[];
  asset?: string;
  indicators?: {
    ema_fast?: number[];
    ema_slow?: number[];
    entry?: { price: number; type: 'call' | 'put'; time: string };
    stopLoss?: number;
    takeProfit?: number;
  };
  height?: number;
}

const TradingChart: React.FC<TradingChartProps> = ({
  data = [],
  asset = 'EURUSD',
  indicators,
  height = 400,
}) => {
  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    if (data.length === 0) {
      const demoLabels = Array.from({ length: 50 }, (_, i) => `${i + 1}`);
      const basePrice = 1.0850;
      const demoData = demoLabels.map((_, i) => 
        basePrice + Math.sin(i / 5) * 0.002 + Math.random() * 0.001
      );

      setChartData({
        labels: demoLabels,
        datasets: [
          {
            label: `${asset} - Precio`,
            data: demoData,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
          },
        ],
      });
      return;
    }

    const labels = data.map((c) => c.time);
    const closes = data.map((c) => c.close);

    const datasets: any[] = [
      {
        label: `${asset} - Precio`,
        data: closes,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
      },
    ];

    if (indicators?.ema_fast) {
      datasets.push({
        label: 'EMA Rápida (9)',
        data: indicators.ema_fast,
        borderColor: '#10B981',
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
      });
    }

    if (indicators?.ema_slow) {
      datasets.push({
        label: 'EMA Lenta (21)',
        data: indicators.ema_slow,
        borderColor: '#F59E0B',
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
      });
    }

    if (indicators?.stopLoss) {
      datasets.push({
        label: 'Stop Loss',
        data: Array(labels.length).fill(indicators.stopLoss),
        borderColor: '#EF4444',
        borderWidth: 1,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
      });
    }

    if (indicators?.takeProfit) {
      datasets.push({
        label: 'Take Profit',
        data: Array(labels.length).fill(indicators.takeProfit),
        borderColor: '#22C55E',
        borderWidth: 1,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
      });
    }

    setChartData({ labels, datasets });
  }, [data, asset, indicators]);

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
        text: `Gráfico de ${asset}`,
        font: { size: 16, weight: 'bold' as const },
      },
    },
    scales: {
      x: { display: true, grid: { display: false } },
      y: { display: true, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
    },
  };

  if (!chartData) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg" style={{ height }}>
        <div className="animate-pulse text-gray-400">Cargando gráfico...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4" style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default TradingChart;
