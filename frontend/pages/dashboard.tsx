import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

// Registrar componentes de Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const Dashboard = () => {
  const router = useRouter();

  const handleLogout = () => {
    router.push("/"); // Redirige al login
  };

  // Datos para el gráfico de barras
  const barData = {
    labels: ["Enero", "Febrero", "Marzo", "Abril"],
    datasets: [
      {
        label: "Ingresos",
        data: [12000, 15000, 18000, 20000],
        backgroundColor: "#003f87", // Azul corporativo
        borderColor: "#ffcc00", // Dorado
        borderWidth: 2,
      },
      {
        label: "Gastos",
        data: [8000, 9000, 10000, 12000],
        backgroundColor: "#ffcc00", // Dorado corporativo
        borderColor: "#003f87", // Azul
        borderWidth: 2,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
      title: {
        display: true,
        text: "Ingresos y Gastos Mensuales",
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Meses",
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Cantidad ($)",
        },
      },
    },
  };

  // Datos para el gráfico de torta
  const pieData = {
    labels: ["Alimentos", "Préstamo", "Colegio Hijos"],
    datasets: [
      {
        data: [18000, 13200, 10800],
        backgroundColor: ["#003f87", "#ffcc00", "#ffffff"], // Azul, Dorado, Blanco
        hoverBackgroundColor: ["#003f87", "#ffcc00", "#e6e6e6"], // Tonos más claros
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
      },
    },
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Menú Lateral */}
      <aside className="w-64 bg-blue-900 text-white flex flex-col">
        <div className="py-4 px-6 text-center">
          <h2 className="text-2xl font-bold">Opciones</h2>
        </div>
        <nav className="flex-1">
          <ul>
            <li>
              {/* Enlace actualizado sin etiqueta <a> */}
              <Link href="/app/dashboard/configuration" className="block py-3 px-6 hover:bg-blue-800">
                Configurar mi trading
              </Link>
            </li>
            <li>
              <Link href="app/dashboard/trading/live" className="block py-3 px-6 hover:bg-blue-800">
              Operaciones en Vivo
              </Link>
            </li>
            <li>
              <Link href="/app/dashboard/backtesting" className="block py-3 px-6 hover:bg-blue-800">
              Backtesting
              </Link>
            </li>
             <li>
              <Link href="#" className="block py-3 px-6 hover:bg-blue-800">
              Historial de Operaciones
              </Link>
            </li> 
            <li>
              <Link href="#" className="block py-3 px-6 hover:bg-blue-800">
              Gráficos y Estadísticas
              </Link>
            </li>


          </ul>
        </nav>
        <button
          onClick={handleLogout}
          className="m-4 py-2 px-6 bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          Salir
        </button>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 p-6">
        {/* Título de Bienvenida */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-center text-blue-900">
            Bienvenido a AI Trading
          </h1>
          <p className="text-center text-gray-600 mt-2">
            Optimiza tus estrategias con inteligencia artificial.
          </p>
        </header>

        {/* Indicadores */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white shadow-lg p-4 rounded text-center border border-blue-900">
            <h2 className="text-xl font-bold text-blue-900">Indicadores Éxitos</h2>
            <p className="text-2xl font-bold">15</p>
          </div>
          <div className="bg-white shadow-lg p-4 rounded text-center border border-blue-900">
            <h2 className="text-xl font-bold text-blue-900">Indicadores Ingresos</h2>
            <p className="text-2xl font-bold">10</p>
          </div>
          <div className="bg-white shadow-lg p-4 rounded text-center border border-yellow-500">
            <h2 className="text-xl font-bold text-yellow-500">Ingresos Totales</h2>
            <p className="text-2xl font-bold">$92,500.00</p>
          </div>
          <div className="bg-white shadow-lg p-4 rounded text-center border border-yellow-500">
            <h2 className="text-xl font-bold text-yellow-500">Gastos Totales</h2>
            <p className="text-2xl font-bold">$54,300.00</p>
          </div>
        </section>

        {/* Gráficos */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Gráfico de barras */}
          <div className="bg-white shadow-lg p-6 rounded">
            <h2 className="text-lg font-bold mb-4 text-center text-blue-900">Resumen Mensual</h2>
            <Bar data={barData} options={barOptions} />
          </div>

          {/* Gráfico de torta */}
          <div className="bg-white shadow-lg p-6 rounded flex justify-center">
            <div className="w-48 h-48">
              <h2 className="text-lg font-bold mb-4 text-center text-blue-900">Distribución de Presupuesto</h2>
              <Pie data={pieData} options={pieOptions} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;