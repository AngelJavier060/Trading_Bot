import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const LiveOrders = () => {
  const [liveOrders, setLiveOrders] = useState([]);
  const [balance, setBalance] = useState(1000.0); // Ejemplo de saldo inicial
  const [platform, setPlatform] = useState('IQ Option'); // Ejemplo de plataforma
  const [market, setMarket] = useState('Binarias'); // Ejemplo de mercado

  useEffect(() => {
    const exampleOrders = [
      {
        id: 1,
        pair: 'EUR/USD',
        type: 'Compra',
        status: 'En curso',
        startTime: new Date(Date.now() - 10000).toISOString(),
        duration: 60,
        endTime: null,
        result: null,
      },
      {
        id: 2,
        pair: 'USD/JPY',
        type: 'Venta',
        status: 'Ganada',
        startTime: new Date(Date.now() - 60000).toISOString(),
        duration: 60,
        endTime: new Date(Date.now()).toISOString(),
        result: 15.75,
      },
      {
        id: 3,
        pair: 'GBP/USD',
        type: 'Compra',
        status: 'Perdida',
        startTime: new Date(Date.now() - 120000).toISOString(),
        duration: 120,
        endTime: new Date(Date.now() - 30000).toISOString(),
        result: -10.0,
      },
    ];

    setLiveOrders(exampleOrders);
  }, []);

  const totalGanadas = liveOrders.filter((order) => order.status === 'Ganada').length;
  const totalPerdidas = liveOrders.filter((order) => order.status === 'Perdida').length;
  const totalEnCurso = liveOrders.filter((order) => order.status === 'En curso').length;
  const netProfit = liveOrders.reduce(
    (total, order) => total + (order.result !== null && order.result !== undefined ? order.result : 0),
    0
  );

  const calcularTiempoRestante = (startTime, duration) => {
    if (!startTime || !duration) return 0;
    const tiempoTranscurrido = (Date.now() - new Date(startTime).getTime()) / 1000;
    return Math.max(duration - tiempoTranscurrido, 0);
  };

  // Datos para los gráficos
  const dailyData = {
    labels: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    datasets: [
      {
        label: 'Ganancias ($)',
        data: [50, 75, 30, 120, 200],
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        tension: 0.4,
      },
      {
        label: 'Pérdidas ($)',
        data: [-20, -30, -10, -50, -60],
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
        tension: 0.4,
      },
    ],
  };

  // Solución al error: Definir `monthlyData` y `yearlyData` para evitar referencias no definidas
  const monthlyData = {
    labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
    datasets: [
      {
        label: 'Ganancias ($)',
        data: [200, 250, 300, 400],
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        tension: 0.4,
      },
      {
        label: 'Pérdidas ($)',
        data: [-50, -60, -70, -80],
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
        tension: 0.4,
      },
    ],
  };

  const yearlyData = {
    labels: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    datasets: [
      {
        label: 'Ganancias ($)',
        data: [500, 400, 600, 700, 800, 900, 1000, 950, 1100, 1200, 1300, 1400],
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        tension: 0.4,
      },
      {
        label: 'Pérdidas ($)',
        data: [-100, -200, -150, -300, -250, -400, -350, -300, -200, -100, -150, -50],
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Cabecera principal */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-900">Órdenes en Vivo</h1>
          <p className="text-gray-700 mt-1">
            Plataforma: {platform} | Mercado: {market} | Saldo: ${balance.toFixed(2)}
          </p>
        </div>
        <button
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          onClick={() => (window.location.href = '/dashboard')}
        >
          Salir al Dashboard
        </button>
      </div>

      {/* Indicadores Principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white shadow-lg p-4 rounded text-center border border-blue-900">
          <h2 className="text-xl font-bold text-blue-900">Ganadas</h2>
          <p className="text-3xl font-bold text-green-500">{totalGanadas}</p>
        </div>
        <div className="bg-white shadow-lg p-4 rounded text-center border border-blue-900">
          <h2 className="text-xl font-bold text-blue-900">Perdidas</h2>
          <p className="text-3xl font-bold text-red-500">{totalPerdidas}</p>
        </div>
        <div className="bg-white shadow-lg p-4 rounded text-center border border-blue-900">
          <h2 className="text-xl font-bold text-blue-900">En Curso</h2>
          <p className="text-3xl font-bold text-yellow-500">{totalEnCurso}</p>
        </div>
        <div className="bg-white shadow-lg p-4 rounded text-center border border-blue-900">
          <h2 className="text-xl font-bold text-blue-900">Ganancia Neta</h2>
          <p className="text-3xl font-bold text-blue-500">${netProfit.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabla de Órdenes en Vivo */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <table className="w-full border-collapse border border-gray-200">
          <thead>
            <tr>
              <th className="border-b px-4 py-2 text-left">Par</th>
              <th className="border-b px-4 py-2 text-left">Tipo</th>
              <th className="border-b px-4 py-2 text-left">Estado</th>
              <th className="border-b px-4 py-2 text-left">Inicio</th>
              <th className="border-b px-4 py-2 text-left">Fin</th>
              <th className="border-b px-4 py-2 text-left">Resultado</th>
              <th className="border-b px-4 py-2 text-left">Progreso</th>
            </tr>
          </thead>
          <tbody>
            {liveOrders.map((order) => {
              const tiempoRestante = calcularTiempoRestante(order.startTime, order.duration);
              const progreso =
                order.duration && order.duration > 0
                  ? ((order.duration - tiempoRestante) / order.duration) * 100
                  : 0;

              return (
                <tr key={order.id || Math.random()} className="border-b hover:bg-gray-100">
                  <td className="px-4 py-2">{order.pair || 'N/A'}</td>
                  <td className="px-4 py-2">{order.type || 'N/A'}</td>
                  <td
                    className={`px-4 py-2 ${
                      order.status === 'Ganada'
                        ? 'text-green-500'
                        : order.status === 'Perdida'
                        ? 'text-red-500'
                        : ''
                    }`}
                  >
                    {order.status || 'Desconocido'}
                  </td>
                  <td className="px-4 py-2">{order.startTime || 'No definido'}</td>
                  <td className="px-4 py-2">{order.endTime || 'En curso'}</td>
                  <td className="px-4 py-2">
                    {order.result !== null && order.result !== undefined
                      ? `$${order.result.toFixed(2)}`
                      : 'Pendiente'}
                  </td>
                  <td className="px-4 py-2">
                    {order.status === 'En curso' ? (
                      <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="absolute h-full bg-blue-500 transition-all"
                          style={{ width: `${progreso}%` }}
                        ></div>
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-black">
                          {tiempoRestante > 0
                            ? `${Math.ceil(tiempoRestante)}s restantes`
                            : 'Completada'}
                        </span>
                      </div>
                    ) : (
                      'Finalizada'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white shadow-lg p-4 rounded">
          <h2 className="text-lg font-bold text-blue-900 text-center mb-4">Diario</h2>
          <Line data={dailyData} height={120} />
        </div>
        <div className="bg-white shadow-lg p-4 rounded">
          <h2 className="text-lg font-bold text-blue-900 text-center mb-4">Mensual</h2>
          <Line data={monthlyData} height={120} />
        </div>
        <div className="bg-white shadow-lg p-4 rounded">
          <h2 className="text-lg font-bold text-blue-900 text-center mb-4">Anual</h2>
          <Line data={yearlyData} height={120} />
        </div>
      </div>
    </div>
  );
};

export default LiveOrders;
