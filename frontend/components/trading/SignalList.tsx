import React from 'react';

interface Signal {
  id?: string;
  asset: string;
  signal: 'call' | 'put' | null;
  confidence: number;
  timestamp?: string;
  reasons?: { rule: string; detail: string }[];
  indicators?: {
    rsi?: number;
    ema_fast?: number;
    ema_slow?: number;
  };
}

interface SignalListProps {
  signals: Signal[];
  onSignalClick?: (signal: Signal) => void;
  loading?: boolean;
}

const SignalList: React.FC<SignalListProps> = ({
  signals = [],
  onSignalClick,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-gray-400">No hay señales disponibles</p>
        <p className="text-xs text-gray-300 mt-1">Las señales aparecerán aquí cuando el sistema las genere</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3">
        <h3 className="text-white font-bold">Señales IA</h3>
      </div>
      
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {signals.map((signal, index) => (
          <div
            key={signal.id || index}
            className={`p-4 hover:bg-gray-50 transition-colors ${onSignalClick ? 'cursor-pointer' : ''}`}
            onClick={() => onSignalClick?.(signal)}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800">{signal.asset}</span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    signal.signal === 'call'
                      ? 'bg-green-100 text-green-700'
                      : signal.signal === 'put'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {signal.signal || 'NEUTRAL'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">Confianza</span>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full">
                    <div
                      className="h-1.5 bg-blue-500 rounded-full"
                      style={{ width: `${signal.confidence * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-bold text-gray-600">
                    {Math.round(signal.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {signal.reasons && signal.reasons.length > 0 && (
              <div className="mt-2 space-y-1">
                {signal.reasons.slice(0, 2).map((reason, i) => (
                  <p key={i} className="text-xs text-gray-500 truncate">
                    • {reason.detail}
                  </p>
                ))}
              </div>
            )}

            {signal.indicators && (
              <div className="mt-2 flex gap-3 text-xs text-gray-400">
                {signal.indicators.rsi && (
                  <span>RSI: {signal.indicators.rsi.toFixed(1)}</span>
                )}
                {signal.indicators.ema_fast && signal.indicators.ema_slow && (
                  <span>
                    EMA: {signal.indicators.ema_fast > signal.indicators.ema_slow ? '▲' : '▼'}
                  </span>
                )}
              </div>
            )}

            {signal.timestamp && (
              <p className="text-xs text-gray-300 mt-2">
                {new Date(signal.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SignalList;
