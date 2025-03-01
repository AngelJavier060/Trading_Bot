import React, { useState } from 'react';
import { useRouter } from 'next/router';

const Configuration = () => {
  const [tradingType, setTradingType] = useState('');
  const [accountType, setAccountType] = useState('');
  const [market, setMarket] = useState('');
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [currencyPairs, setCurrencyPairs] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [backtesting, setBacktesting] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Aquí puedes manejar la lógica de configuración
    console.log({
      tradingType,
      accountType,
      market,
      timeframes,
      currencyPairs,
      strategies,
      backtesting,
    });
    router.push('/app/dashboard'); // Redirige de vuelta al dashboard
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-bold text-center text-blue-900 mb-8">Configurar mi Trading</h1>
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-white p-6 rounded shadow-lg">
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2">Seleccione Tipo de Trading</label>
          <select
            value={tradingType}
            onChange={(e) => setTradingType(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Seleccione</option>
            <option value="scalping">Scalping (Ip option)</option>
            <option value="day-trading">Day Trading (Binance, MT5)</option>
            <option value="swing-trading">Swing Trading (MT5)</option>
          </select>
        </div>

        {tradingType === 'scalping' && (
          <>
            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Seleccione Tipo de Cuenta</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">Seleccione</option>
                <option value="real">Real</option>
                <option value="demo">Demo</option>
                <option value="torneo">Torneo</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Seleccione Mercado</label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">Seleccione</option>
                <option value="binarias">Binarias</option>
                <option value="otc">OTC</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Temporalidades</label>
              <select
                multiple
                value={timeframes}
                onChange={(e) => setTimeframes(Array.from(e.target.selectedOptions, option => option.value))}
                className="w-full p-2 border rounded"
              >
                <option value="1m">1 Minuto</option>
                <option value="5m">5 Minutos</option>
                <option value="15m">15 Minutos</option>
                <option value="1h">1 Hora</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Par de Divisas</label>
              <select
                multiple
                value={currencyPairs}
                onChange={(e) => setCurrencyPairs(Array.from(e.target.selectedOptions, option => option.value))}
                className="w-full p-2 border rounded"
              >
                <option value="eurusd">EUR/USD</option>
                <option value="usdjpy">USD/JPY</option>
                <option value="gbpusd">GBP/USD</option>
                <option value="audusd">AUD/USD</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Tipo de Estrategias</label>
              <select
                multiple
                value={strategies}
                onChange={(e) => setStrategies(Array.from(e.target.selectedOptions, option => option.value))}
                className="w-full p-2 border rounded"
              >
                <option value="estrategia1">Estrategia 1</option>
                <option value="estrategia2">Estrategia 2</option>
                <option value="estrategia3">Estrategia 3</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">Opciones</label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={backtesting}
                  onChange={(e) => setBacktesting(e.target.checked)}
                  className="mr-2"
                />
                <span>Backtesting</span>
              </div>
            </div>
          </>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition duration-300 shadow-md"
        >
          Aplicar
        </button>
      </form>
    </div>
  );
};

export default Configuration;