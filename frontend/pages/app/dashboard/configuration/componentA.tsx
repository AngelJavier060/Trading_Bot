import React from 'react';

interface ConfigurationProps {
  estado?: any;
  setEstado?: (estado: any) => void;
  aplicarEstrategias?: () => void;
}

const Configuration: React.FC<ConfigurationProps> = ({
  estado,
  setEstado,
  aplicarEstrategias,
}) => {
  const timeframes = ['1m', '5m', '15m', '30m', '1h'];
  const strategies = ['EMA + RSI', 'MACD', 'Bollinger Bands', 'Price Action'];
  const marketTypes = ['Binarias', 'OTC', 'Forex'];

  const toggleOption = (option: string, list: string[], key: string) => {
    if (!setEstado || !estado) return;
    const newList = list.includes(option)
      ? list.filter((item) => item !== option)
      : [...list, option];
    setEstado({ ...estado, [key]: newList });
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-4xl">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Configuración de Estrategias</h2>

      {/* Tipo de Mercado */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tipo de Mercado
        </label>
        <div className="flex flex-wrap gap-2">
          {marketTypes.map((type) => (
            <button
              key={type}
              onClick={() => setEstado && setEstado({ ...estado, tipoMercado: type })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                estado?.tipoMercado === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Temporalidades */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Temporalidades
        </label>
        <div className="flex flex-wrap gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() =>
                toggleOption(tf, estado?.temporalidadesSeleccionadas || [], 'temporalidadesSeleccionadas')
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                estado?.temporalidadesSeleccionadas?.includes(tf)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Estrategias */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Estrategias
        </label>
        <div className="flex flex-wrap gap-2">
          {strategies.map((strategy) => (
            <button
              key={strategy}
              onClick={() =>
                toggleOption(strategy, estado?.estrategiasSeleccionadas || [], 'estrategiasSeleccionadas')
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                estado?.estrategiasSeleccionadas?.includes(strategy)
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {strategy}
            </button>
          ))}
        </div>
      </div>

      {/* Botón Aplicar */}
      {aplicarEstrategias && (
        <button
          onClick={aplicarEstrategias}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Aplicar Configuración
        </button>
      )}
    </div>
  );
};

export default Configuration;
