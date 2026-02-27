import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import api from '../../../../services/api';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Dynamic imports to avoid SSR issues
const Bar = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false });
const TradingViewChart = dynamic(() => import('../../../../components/charts/TradingViewChart'), { ssr: false });

interface MLStatus {
  xgboost_trained: boolean;
  lstm_trained: boolean;
  last_training: string | null;
}

interface Prediction {
  signal: string;
  confidence: number;
  probability: number;
  explanation?: string;
  feature_importance?: Array<{ feature: string; importance: number }>;
}

const MLDashboard = () => {
  const router = useRouter();
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureImportance, setFeatureImportance] = useState<any[]>([]);
  
  // Config
  const [config, setConfig] = useState({
    symbol: 'EURUSD',
    timeframe: '5m',
    platform: 'demo',
    model: 'ensemble' as 'xgboost' | 'lstm' | 'ensemble',
    strategy: 'ema_rsi',
  });

  // Indicators config (EMA/RSI)
  const [indicators, setIndicators] = useState({
    emaLength: 9,
    rsiLength: 21,
    emaColor: '#10B981',
    rsiColor: '#8B5CF6',
    emaLineWidth: 2,
    rsiLineWidth: 2,
    showEMA: true,
    showRSI: true,
  });

  useEffect(() => {
    loadMLStatus();
  }, []);

  const loadMLStatus = async () => {
    try {
      const data = await api.getMLStatus();
      setMlStatus(data.ml_status);
    } catch (err: any) {
      console.error('Error loading ML status:', err);
    }
  };

  const handleQuickTrain = async () => {
    setIsTraining(true);
    setError(null);
    
    try {
      const result = await api.quickTrainML();
      await loadMLStatus();
      
      if (result.models?.xgboost?.metrics) {
        alert(`Entrenamiento completado!\nAccuracy: ${(result.models.xgboost.metrics.train_accuracy * 100).toFixed(1)}%`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTraining(false);
    }
  };

  const handleFullTrain = async () => {
    setIsTraining(true);
    setError(null);
    
    try {
      const result = await api.trainML({
        platform: config.platform,
        symbol: config.symbol,
        timeframe: config.timeframe,
        candles: 1000,
        train_xgboost: true,
        train_lstm: true,
      });
      
      await loadMLStatus();
      alert('Entrenamiento completo finalizado!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTraining(false);
    }
  };

  const handlePredict = async () => {
    setIsPredicting(true);
    setError(null);
    
    try {
      const result = await api.predictML({
        platform: config.platform,
        symbol: config.symbol,
        timeframe: config.timeframe,
        candles: 100,
        model: config.model,
      });
      
      if (result.prediction) {
        setPrediction(result.prediction);
        
        // Add to signals history
        setSignals(prev => [{
          time: Date.now() / 1000,
          type: result.prediction.signal,
          confidence: result.prediction.confidence,
          price: 0,
          reasons: [result.prediction.explanation || ''],
          indicators: {},
        }, ...prev].slice(0, 20));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPredicting(false);
    }
  };

  const handleAnalyze = async () => {
    setIsPredicting(true);
    setError(null);
    
    try {
      const result = await api.analyzeML({
        symbol: config.symbol,
        timeframe: config.timeframe,
        strategy: config.strategy,
      });
      
      if (result.combined_signal) {
        setPrediction({
          signal: result.combined_signal.signal,
          confidence: result.combined_signal.confidence,
          probability: 0,
          explanation: result.combined_signal.reason,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsPredicting(false);
    }
  };

  const loadFeatureImportance = async () => {
    try {
      const data = await api.getFeatureImportance();
      if (data.feature_importance?.xgboost) {
        setFeatureImportance(data.feature_importance.xgboost);
      }
    } catch (err: any) {
      console.error('Error loading feature importance:', err);
    }
  };

  const getFeatureChartData = () => {
    if (!featureImportance.length) return null;
    
    const top10 = featureImportance.slice(0, 10);
    
    return {
      labels: top10.map(f => f.feature),
      datasets: [{
        label: 'Importancia',
        data: top10.map(f => f.importance),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      }],
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Machine Learning & XAI</h1>
          <p className="text-gray-500">Predicciones con IA explicable para IQ Option y MT5</p>
        </div>
        <button
          onClick={() => router.push('/app/dashboard')}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Volver al Dashboard
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Config & Status */}
        <div className="space-y-6">
          {/* ML Status */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Estado de Modelos</h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">XGBoost</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  mlStatus?.xgboost_trained 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {mlStatus?.xgboost_trained ? '✓ Entrenado' : '○ Sin entrenar'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">LSTM</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  mlStatus?.lstm_trained 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {mlStatus?.lstm_trained ? '✓ Entrenado' : '○ Sin entrenar'}
                </span>
              </div>
              
              {mlStatus?.last_training && (
                <p className="text-xs text-gray-500 mt-2">
                  Último entrenamiento: {new Date(mlStatus.last_training).toLocaleString()}
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={handleQuickTrain}
                disabled={isTraining}
                className={`w-full py-2 rounded-lg font-medium text-white ${
                  isTraining ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isTraining ? '⏳ Entrenando...' : '🚀 Entrenamiento Rápido'}
              </button>
              
              <button
                onClick={handleFullTrain}
                disabled={isTraining}
                className="w-full py-2 rounded-lg font-medium text-blue-600 border border-blue-600 hover:bg-blue-50"
              >
                Entrenamiento Completo (XGB + LSTM)
              </button>
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Configuración</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plataforma</label>
                <select
                  value={config.platform}
                  onChange={(e) => setConfig({ ...config, platform: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="demo">Demo</option>
                  <option value="iqoption">IQ Option</option>
                  <option value="mt5">MetaTrader 5</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Símbolo</label>
                <select
                  value={config.symbol}
                  onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="EURUSD">EUR/USD</option>
                  <option value="GBPUSD">GBP/USD</option>
                  <option value="USDJPY">USD/JPY</option>
                  <option value="AUDUSD">AUD/USD</option>
                  <option value="USDCAD">USD/CAD</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporalidad</label>
                <select
                  value={config.timeframe}
                  onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="1m">1 Minuto</option>
                  <option value="5m">5 Minutos</option>
                  <option value="15m">15 Minutos</option>
                  <option value="1h">1 Hora</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value as any })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="ensemble">Ensemble (XGB + LSTM)</option>
                  <option value="xgboost">XGBoost</option>
                  <option value="lstm">LSTM</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estrategia Base</label>
                <select
                  value={config.strategy}
                  onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="ema_rsi">EMA + RSI</option>
                  <option value="macd">MACD</option>
                  <option value="bollinger">Bollinger Bands</option>
                  <option value="ichimoku">Ichimoku</option>
                </select>
              </div>

              {/* Indicators UI */}
              <div className="border-t pt-4">
                <h3 className="text-md font-bold text-gray-800 mb-3">Indicadores (EMA / RSI)</h3>

                {/* EMA Config */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={indicators.showEMA}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showEMA: e.target.checked }))}
                    />
                    <span className="text-sm">Mostrar EMA</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={1}
                      value={indicators.emaLength}
                      onChange={(e) => setIndicators(prev => ({ ...prev, emaLength: Number(e.target.value) }))}
                      className="p-2 border rounded-lg w-full"
                      placeholder="Período"
                    />
                    <input
                      type="color"
                      value={indicators.emaColor}
                      onChange={(e) => setIndicators(prev => ({ ...prev, emaColor: e.target.value }))}
                      className="p-2 border rounded-lg w-full"
                      title="Color EMA"
                    />
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={indicators.emaLineWidth}
                      onChange={(e) => setIndicators(prev => ({ ...prev, emaLineWidth: Number(e.target.value) }))}
                      className="p-2 border rounded-lg w-full"
                      title="Grosor línea EMA"
                    />
                  </div>
                </div>

                {/* RSI Config */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={indicators.showRSI}
                      onChange={(e) => setIndicators(prev => ({ ...prev, showRSI: e.target.checked }))}
                    />
                    <span className="text-sm">Mostrar RSI</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={1}
                      value={indicators.rsiLength}
                      onChange={(e) => setIndicators(prev => ({ ...prev, rsiLength: Number(e.target.value) }))}
                      className="p-2 border rounded-lg w-full"
                      placeholder="Período"
                    />
                    <input
                      type="color"
                      value={indicators.rsiColor}
                      onChange={(e) => setIndicators(prev => ({ ...prev, rsiColor: e.target.value }))}
                      className="p-2 border rounded-lg w-full"
                      title="Color RSI"
                    />
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={indicators.rsiLineWidth}
                      onChange={(e) => setIndicators(prev => ({ ...prev, rsiLineWidth: Number(e.target.value) }))}
                      className="p-2 border rounded-lg w-full"
                      title="Grosor línea RSI"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={handlePredict}
                disabled={isPredicting || (!mlStatus?.xgboost_trained && !mlStatus?.lstm_trained)}
                className={`w-full py-3 rounded-lg font-medium text-white ${
                  isPredicting || (!mlStatus?.xgboost_trained && !mlStatus?.lstm_trained)
                    ? 'bg-gray-400' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isPredicting ? '⏳ Analizando...' : '🤖 Predicción ML'}
              </button>
              
              <button
                onClick={handleAnalyze}
                disabled={isPredicting}
                className="w-full py-2 rounded-lg font-medium text-green-600 border border-green-600 hover:bg-green-50"
              >
                📊 Análisis ML + Estrategia
              </button>
              
              <button
                onClick={loadFeatureImportance}
                className="w-full py-2 rounded-lg font-medium text-purple-600 border border-purple-600 hover:bg-purple-50"
              >
                📈 Ver Importancia de Features
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Center & Right - TradingView + Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* TradingView Chart */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <TradingViewChart
              symbol={config.symbol}
              interval={config.timeframe.replace('m', '').replace('h', '60')}
              theme="light"
              signals={signals}
              showXAI={true}
              platform={config.platform as any}
              height={400}
              emaLength={indicators.emaLength}
              rsiLength={indicators.rsiLength}
              emaColor={indicators.emaColor}
              rsiColor={indicators.rsiColor}
              emaLineWidth={indicators.emaLineWidth}
              rsiLineWidth={indicators.rsiLineWidth}
              showEMA={indicators.showEMA}
              showRSI={indicators.showRSI}
            />
          </div>

          {/* Prediction Result */}
          {prediction && (
            <div className={`rounded-xl shadow-md p-6 ${
              prediction.signal === 'call' ? 'bg-green-50 border-2 border-green-500' :
              prediction.signal === 'put' ? 'bg-red-50 border-2 border-red-500' :
              'bg-gray-50 border-2 border-gray-300'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  {prediction.signal === 'call' ? '📈 SEÑAL: CALL (COMPRA)' :
                   prediction.signal === 'put' ? '📉 SEÑAL: PUT (VENTA)' :
                   '⏸️ SIN SEÑAL CLARA'}
                </h3>
                <span className="text-3xl font-bold">
                  {prediction.confidence.toFixed(1)}%
                </span>
              </div>
              
              {/* Confidence Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Confianza</span>
                  <span>{prediction.confidence.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      prediction.confidence >= 70 ? 'bg-green-500' :
                      prediction.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${prediction.confidence}%` }}
                  />
                </div>
              </div>
              
              {/* Explanation */}
              {prediction.explanation && (
                <div className="bg-white rounded-lg p-4 mt-4">
                  <h4 className="font-bold mb-2">🧠 Explicación XAI</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {prediction.explanation}
                  </p>
                </div>
              )}
              
              {/* Feature Importance */}
              {prediction.feature_importance && prediction.feature_importance.length > 0 && (
                <div className="bg-white rounded-lg p-4 mt-4">
                  <h4 className="font-bold mb-2">📊 Factores Principales</h4>
                  <div className="space-y-2">
                    {prediction.feature_importance.slice(0, 5).map((feat, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-sm">{feat.feature}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${Math.min(feat.importance * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-12 text-right">
                            {(feat.importance * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feature Importance Chart */}
          {featureImportance.length > 0 && getFeatureChartData() && (
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                Top 10 Features Más Importantes
              </h3>
              <div className="h-64">
                <Bar
                  data={getFeatureChartData()!}
                  options={{
                    indexAxis: 'y' as const,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                    },
                    scales: {
                      x: { beginAtZero: true },
                    },
                  }}
                />
              </div>
            </div>
          )}

          {/* Empty State */}
          {!prediction && !featureImportance.length && (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <div className="text-6xl mb-4">🤖</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Listo para Predicciones ML
              </h3>
              <p className="text-gray-500 mb-4">
                {mlStatus?.xgboost_trained || mlStatus?.lstm_trained
                  ? 'Modelos entrenados. Haz clic en "Predicción ML" para analizar.'
                  : 'Primero entrena los modelos con "Entrenamiento Rápido".'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MLDashboard;
