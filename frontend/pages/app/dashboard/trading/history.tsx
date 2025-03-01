// pages/app/trading/history.tsx
import React from 'react';

// Historial de operaciones ficticio (puedes cargar esto desde una API más adelante)
const sampleHistory = [
  { id: 1, pair: 'EUR/USD', type: 'Compra', amount: 100, result: '+$10' },
  { id: 2, pair: 'GBP/USD', type: 'Venta', amount: 50, result: '-$5' },
  { id: 3, pair: 'AUD/USD', type: 'Compra', amount: 75, result: '+$8' },
];

const TradingHistory = () => {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-4xl font-bold text-center text-blue-900 mb-8">Historial de Operaciones</h1>
      <table className="table-auto w-full bg-white rounded shadow-lg">
        <thead>
          <tr className="bg-blue-900 text-white">
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Par de Divisas</th>
            <th className="px-4 py-2">Tipo</th>
            <th className="px-4 py-2">Monto</th>
            <th className="px-4 py-2">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {sampleHistory.map((trade) => (
            <tr key={trade.id} className="text-center border-b">
              <td className="px-4 py-2">{trade.id}</td>
              <td className="px-4 py-2">{trade.pair}</td>
              <td className="px-4 py-2">{trade.type}</td>
              <td className="px-4 py-2">${trade.amount}</td>
              <td
                className={`px-4 py-2 ${
                  trade.result.startsWith('+') ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {trade.result}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TradingHistory;

