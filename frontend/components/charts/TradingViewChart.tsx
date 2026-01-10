import React, { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    TradingView: any;
  }
}

interface Signal {
  time: number;
  type: 'call' | 'put';
  confidence: number;
  price: number;
  reasons: string[];
  indicators: Record<string, number>;
}

interface TradingViewChartProps {
  symbol?: string;
  interval?: string;
  theme?: 'light' | 'dark';
  signals?: Signal[];
  showXAI?: boolean;
  platform?: 'iqoption' | 'mt5';
  onSymbolChange?: (symbol: string) => void;
  height?: number;
}

const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol = 'EURUSD',
  interval = '5',
  theme = 'light',
  signals = [],
  showXAI = true,
  platform = 'iqoption',
  onSymbolChange,
  height = 500,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  
  // Generate unique container ID
  const containerId = useRef(`tradingview_${Math.random().toString(36).substr(2, 9)}`);

  // Load TradingView script
  useEffect(() => {
    // Check if already loaded
    if (window.TradingView) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (window.TradingView) {
        setIsLoaded(true);
      } else {
        setLoadError(true);
      }
    };
    script.onerror = () => setLoadError(true);
    document.head.appendChild(script);

    return () => {
      // Don't remove script as it may be used by other components
    };
  }, []);

  // Initialize widget
  useEffect(() => {
    if (!isLoaded || !containerRef.current || loadError) return;
    
    // Ensure TradingView is available
    if (!window.TradingView || !window.TradingView.widget) {
      console.error('TradingView not available');
      setLoadError(true);
      return;
    }

    try {
      // Format symbol based on platform
      const formattedSymbol = platform === 'mt5' 
        ? `FX:${symbol}` 
        : `FX:${symbol}`;

      widgetRef.current = new window.TradingView.widget({
        container_id: containerId.current,
        symbol: formattedSymbol,
        interval: interval,
        timezone: 'America/New_York',
        theme: theme,
        style: '1',
        locale: 'es',
        toolbar_bg: '#f1f3f6',
        enable_publishing: false,
        allow_symbol_change: true,
        save_image: true,
        studies: [
          'MAExp@tv-basicstudies',
          'RSI@tv-basicstudies',
          'MACD@tv-basicstudies',
        ],
        disabled_features: [
          'use_localstorage_for_settings',
        ],
        enabled_features: [
          'study_templates',
        ],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#26a69a',
          'mainSeriesProperties.candleStyle.downColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
        },
        loading_screen: {
          backgroundColor: theme === 'dark' ? '#1e222d' : '#ffffff',
          foregroundColor: theme === 'dark' ? '#2962ff' : '#2962ff',
        },
        width: '100%',
        height: height,
      });
    } catch (error) {
      console.error('Error initializing TradingView:', error);
      setLoadError(true);
    }

    return () => {
      try {
        if (widgetRef.current && widgetRef.current.remove) {
          widgetRef.current.remove();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, [isLoaded, symbol, interval, theme, platform, height, loadError]);

  // Render XAI Signal Panel
  const renderSignalPanel = () => {
    if (!showXAI || signals.length === 0) return null;

    const latestSignal = signals[signals.length - 1];

    return (
      <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 w-80 z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800 dark:text-white">Señal XAI</h3>
          <span className={`px-2 py-1 rounded text-xs font-bold ${
            latestSignal.type === 'call' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {latestSignal.type === 'call' ? '📈 CALL' : '📉 PUT'}
          </span>
        </div>

        {/* Confidence Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-500">Confianza</span>
            <span className="font-bold">{latestSignal.confidence}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                latestSignal.confidence >= 70 ? 'bg-green-500' :
                latestSignal.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${latestSignal.confidence}%` }}
            />
          </div>
        </div>

        {/* Indicators */}
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-2">Indicadores</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(latestSignal.indicators).slice(0, 6).map(([key, value]) => (
              <div key={key} className="flex justify-between bg-gray-50 dark:bg-gray-700 p-1 rounded">
                <span className="text-gray-600 dark:text-gray-300">{key}:</span>
                <span className="font-medium">{typeof value === 'number' ? value.toFixed(2) : value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reasons */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Razones</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {latestSignal.reasons.map((reason, idx) => (
              <div key={idx} className="text-xs bg-blue-50 dark:bg-blue-900 p-2 rounded">
                ✓ {reason}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Signal History
  const renderSignalHistory = () => {
    if (!showXAI || signals.length <= 1) return null;

    return (
      <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4">
        <h3 className="font-bold text-gray-800 dark:text-white mb-3">Historial de Señales</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="text-left py-2 px-2">Hora</th>
                <th className="text-left py-2 px-2">Tipo</th>
                <th className="text-right py-2 px-2">Confianza</th>
                <th className="text-right py-2 px-2">Precio</th>
                <th className="text-center py-2 px-2">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {signals.slice(-10).reverse().map((signal, idx) => (
                <tr 
                  key={idx} 
                  className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => setSelectedSignal(signal)}
                >
                  <td className="py-2 px-2">
                    {new Date(signal.time * 1000).toLocaleTimeString()}
                  </td>
                  <td className="py-2 px-2">
                    <span className={signal.type === 'call' ? 'text-green-600' : 'text-red-600'}>
                      {signal.type === 'call' ? '📈 CALL' : '📉 PUT'}
                    </span>
                  </td>
                  <td className="text-right py-2 px-2 font-medium">
                    {signal.confidence}%
                  </td>
                  <td className="text-right py-2 px-2">
                    {signal.price.toFixed(5)}
                  </td>
                  <td className="text-center py-2 px-2">
                    <button className="text-blue-600 hover:underline text-xs">
                      Ver XAI
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Signal Detail Modal
  const renderSignalModal = () => {
    if (!selectedSignal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white">
              Explicación de Señal XAI
            </h3>
            <button
              onClick={() => setSelectedSignal(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Signal Type */}
            <div className={`p-4 rounded-lg ${
              selectedSignal.type === 'call' 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold">
                  {selectedSignal.type === 'call' ? '📈 CALL' : '📉 PUT'}
                </span>
                <span className="text-3xl font-bold">
                  {selectedSignal.confidence}%
                </span>
              </div>
              <p className="text-sm mt-2">
                Precio de entrada: {selectedSignal.price.toFixed(5)}
              </p>
            </div>

            {/* Indicators */}
            <div>
              <h4 className="font-bold mb-2">Indicadores Técnicos</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(selectedSignal.indicators).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    <span className="text-xs text-gray-500">{key}</span>
                    <p className="font-bold">{typeof value === 'number' ? value.toFixed(4) : String(value)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasons */}
            <div>
              <h4 className="font-bold mb-2">Razones de la Decisión</h4>
              <div className="space-y-2">
                {selectedSignal.reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900 p-3 rounded">
                    <span className="text-green-500">✓</span>
                    <span className="text-sm">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedSignal(null)}
            className="mt-4 w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Loading State */}
      {!isLoaded && !loadError && (
        <div className="flex items-center justify-center h-96 bg-gray-100 rounded-xl">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-2">⚙️</div>
            <p className="text-gray-500">Cargando TradingView...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="flex items-center justify-center h-96 bg-gray-100 rounded-xl">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-gray-700 font-bold mb-2">Gráfico no disponible</p>
            <p className="text-gray-500 text-sm">TradingView no pudo cargarse.</p>
            <p className="text-gray-400 text-xs mt-2">Símbolo: {symbol} | Timeframe: {interval}</p>
          </div>
        </div>
      )}

      {/* Chart Container */}
      <div 
        id={containerId.current} 
        ref={containerRef}
        className="rounded-xl overflow-hidden"
        style={{ minHeight: height, display: loadError ? 'none' : 'block' }}
      />

      {/* XAI Signal Panel */}
      {renderSignalPanel()}

      {/* Signal History */}
      {renderSignalHistory()}

      {/* Signal Detail Modal */}
      {renderSignalModal()}
    </div>
  );
};

export default TradingViewChart;
