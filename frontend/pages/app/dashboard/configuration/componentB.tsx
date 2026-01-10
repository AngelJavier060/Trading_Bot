import React from 'react';

interface RiskConfigProps {
  risk?: number;
  profitTarget?: number;
  lossLimit?: number;
  maxDailyTrades?: number;
  onRiskChange?: (value: number) => void;
  onProfitTargetChange?: (value: number) => void;
  onLossLimitChange?: (value: number) => void;
  onMaxDailyTradesChange?: (value: number) => void;
}

const RiskConfiguration: React.FC<RiskConfigProps> = ({
  risk = 2,
  profitTarget = 10,
  lossLimit = 5,
  maxDailyTrades = 10,
  onRiskChange,
  onProfitTargetChange,
  onLossLimitChange,
  onMaxDailyTradesChange,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-md">
      <h2 className="text-xl font-bold text-gray-800 mb-6">Gestión de Riesgo</h2>

      <div className="space-y-5">
        {/* Riesgo por operación */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Riesgo por Operación (% del balance)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="10"
              value={risk}
              onChange={(e) => onRiskChange?.(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-lg font-bold text-blue-600 min-w-[3rem] text-right">
              {risk}%
            </span>
          </div>
        </div>

        {/* Objetivo de ganancias */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Objetivo de Ganancias Diario (%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={profitTarget}
              onChange={(e) => onProfitTargetChange?.(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-lg font-bold text-green-600 min-w-[3rem] text-right">
              {profitTarget}%
            </span>
          </div>
        </div>

        {/* Límite de pérdidas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Límite de Pérdidas Diario (%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="2"
              max="20"
              value={lossLimit}
              onChange={(e) => onLossLimitChange?.(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-lg font-bold text-red-600 min-w-[3rem] text-right">
              {lossLimit}%
            </span>
          </div>
        </div>

        {/* Máximo de operaciones diarias */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Máximo de Operaciones Diarias
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="50"
              value={maxDailyTrades}
              onChange={(e) => onMaxDailyTradesChange?.(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-lg font-bold text-purple-600 min-w-[3rem] text-right">
              {maxDailyTrades}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-xs text-yellow-800">
          ⚠️ Se recomienda no arriesgar más del 2% por operación y establecer 
          límites de pérdida diaria para proteger tu capital.
        </p>
      </div>
    </div>
  );
};

export default RiskConfiguration;
