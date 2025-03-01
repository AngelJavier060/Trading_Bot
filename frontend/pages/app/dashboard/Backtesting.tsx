// src/app/dashboard/Backtesting.tsx
import React from 'react';

const Backtesting: React.FC = () => {
  const handleBacktest = () => {
    // Lógica para realizar backtesting
    console.log('Realizando backtesting...');
  };

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4">Backtesting</h2>
      <button
        onClick={handleBacktest}
        className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300"
      >
        Realizar Backtesting
      </button>
    </div>
  );
};

export default Backtesting;