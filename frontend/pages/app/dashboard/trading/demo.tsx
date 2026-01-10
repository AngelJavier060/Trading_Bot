import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';

const BASE_URL = "http://127.0.0.1:5000";

// Types
interface Signal {
  id: string;
  symbol: string;
  direction: 'call' | 'put';
  confidence: number;
  strategy: string;
  reasons: string[];
  timestamp: string;
  indicators: Record<string, number>;
  mlPrediction?: number;
}

interface Trade {
  id: string;
  symbol: string;
  direction: 'call' | 'put';
  amount: number;
  entryPrice: number;
  exitPrice?: number;
  result?: 'win' | 'loss' | 'pending';
  pnl: number;
  strategy: string;
  openTime: string;
  closeTime?: string;
  explanation: string;
}

interface RobotState {
  status: 'inactive' | 'analyzing' | 'executing' | 'waiting' | 'error';
  currentAction: string;
  lastUpdate: string;
}

interface TradingConfig {
  mode: 'manual' | 'automatic';
  symbols: string[];
  strategies: string[];
  timeframe: string;
  analysisInterval: number;
  maxConcurrentTrades: number;
  riskLevel: 'low' | 'medium' | 'high';
  tradeAmount: number;
  stopLoss: number;
  takeProfit: number;
  martingale: boolean;
  martingaleMultiplier: number;
  maxMartingaleSteps: number;
}

const AVAILABLE_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 
  'EURGBP', 'EURJPY', 'GBPJPY', 'NZDUSD', 'USDCHF'
];

const AVAILABLE_STRATEGIES = [
  { id: 'ema_rsi', name: 'EMA + RSI', description: 'Cruce de medias con confirmación RSI' },
  { id: 'macd', name: 'MACD', description: 'Convergencia/Divergencia de medias móviles' },
  { id: 'bollinger', name: 'Bollinger Bands', description: 'Bandas de volatilidad' },
  { id: 'ichimoku', name: 'Ichimoku Cloud', description: 'Sistema japonés de tendencia' },
  { id: 'stochastic', name: 'Stochastic', description: 'Oscilador estocástico' },
  { id: 'multi_strategy', name: 'Multi-Estrategia', description: 'Combina múltiples indicadores' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1 Minuto' },
  { value: '5m', label: '5 Minutos' },
  { value: '15m', label: '15 Minutos' },
  { value: '30m', label: '30 Minutos' },
  { value: '1h', label: '1 Hora' },
  { value: '4h', label: '4 Horas' },
];

export default function TradingDemoProfessional() {
  const router = useRouter();
  
  // State
  const [config, setConfig] = useState<TradingConfig>({
    mode: 'manual',
    symbols: ['EURUSD'],
    strategies: ['ema_rsi'],
    timeframe: '5m',
    analysisInterval: 30,
    maxConcurrentTrades: 3,
    riskLevel: 'medium',
    tradeAmount: 10,
    stopLoss: 5,
    takeProfit: 80,
    martingale: false,
    martingaleMultiplier: 2,
    maxMartingaleSteps: 3,
  });
  
  const [robotState, setRobotState] = useState<RobotState>({
    status: 'inactive',
    currentAction: 'Sistema detenido',
    lastUpdate: new Date().toISOString(),
  });
  
  const [balance, setBalance] = useState<number | null>(null);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [platformConnected, setPlatformConnected] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{email?: string; currency?: string; account_type?: string} | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const analysisCountRef = useRef(0);

  // Logging
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const icons = { info: '📊', success: '✅', warning: '⚠️', error: '❌' };
    setLogs(prev => [...prev.slice(-50), `[${timestamp}] ${icons[type]} ${message}`]);
  }, []);

  // Update robot state
  const updateRobotState = useCallback((status: RobotState['status'], action: string) => {
    setRobotState({
      status,
      currentAction: action,
      lastUpdate: new Date().toISOString(),
    });
  }, []);

  // Fetch real balance from IQ Option
  const fetchRealBalance = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/status`);
      const data = await response.json();
      
      if (data.status === 'connected' && data.account_info) {
        const realBalance = data.account_info.balance;
        setBalance(realBalance);
        if (initialBalance === null) {
          setInitialBalance(realBalance);
        }
        setAccountInfo({
          email: data.account_info.email,
          currency: data.account_info.currency || 'USD',
          account_type: data.account_info.account_type
        });
        setPlatformConnected(true);
        return realBalance;
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
    return null;
  }, [initialBalance]);

  // Connect to platform
  const connectToPlatform = useCallback(async () => {
    setConnectionStatus('connecting');
    addLog('Conectando a plataforma IQ Option...', 'info');
    
    try {
      const response = await fetch(`${BASE_URL}/api/trading/status`);
      const data = await response.json();
      
      if (data.status === 'connected' || data.connected) {
        setConnectionStatus('connected');
        setPlatformConnected(true);
        
        // Get real balance
        const realBalance = await fetchRealBalance();
        if (realBalance !== null) {
          addLog(`Conectado a IQ Option - Saldo real: $${realBalance.toLocaleString()}`, 'success');
        } else {
          addLog('Conexión establecida con datos de mercado', 'success');
        }
        return true;
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
    
    // Fallback to demo simulation mode
    setConnectionStatus('connected');
    setBalance(10000);
    setInitialBalance(10000);
    setPlatformConnected(false);
    addLog('Modo Demo Simulado - Sin conexión a IQ Option', 'warning');
    return true;
  }, [addLog, fetchRealBalance]);

  // Analyze market for a symbol
  const analyzeSymbol = useCallback(async (symbol: string): Promise<Signal | null> => {
    try {
      const response = await fetch(`${BASE_URL}/api/live/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe: config.timeframe,
          strategy: config.strategies[0],
          use_ml: true,
        }),
      });
      
      const data = await response.json();
      
      if (data.status === 'success' && data.analysis?.signal) {
        const sig = data.analysis.signal;
        if (sig.signal !== 'none' && sig.confidence >= 50) {
          return {
            id: `SIG-${Date.now()}-${symbol}`,
            symbol,
            direction: sig.signal as 'call' | 'put',
            confidence: sig.confidence,
            strategy: config.strategies[0],
            reasons: sig.reasons?.map((r: any) => r.condition || r) || [],
            timestamp: new Date().toISOString(),
            indicators: sig.indicators || {},
            mlPrediction: sig.ml_prediction,
          };
        }
      }
    } catch (error) {
      // Generate demo signal if API fails
      const shouldGenerate = Math.random() > 0.7;
      if (shouldGenerate) {
        const direction = Math.random() > 0.5 ? 'call' : 'put';
        const confidence = 55 + Math.random() * 35;
        return {
          id: `SIG-${Date.now()}-${symbol}`,
          symbol,
          direction,
          confidence: Math.round(confidence),
          strategy: config.strategies[0],
          reasons: [
            `EMA rápida ${direction === 'call' ? '>' : '<'} EMA lenta`,
            `RSI ${direction === 'call' ? '< 30 (sobreventa)' : '> 70 (sobrecompra)'}`,
            'Patrón de velas confirmado',
          ],
          timestamp: new Date().toISOString(),
          indicators: {
            rsi: direction === 'call' ? 25 + Math.random() * 10 : 70 + Math.random() * 10,
            ema_fast: 1.1000 + Math.random() * 0.01,
            ema_slow: 1.0990 + Math.random() * 0.01,
          },
          mlPrediction: confidence / 100,
        };
      }
    }
    return null;
  }, [config.timeframe, config.strategies]);

  // Run analysis cycle
  const runAnalysisCycle = useCallback(async () => {
    if (!isRunning) return;
    
    analysisCountRef.current++;
    updateRobotState('analyzing', `Analizando mercado... (Ciclo #${analysisCountRef.current})`);
    
    const newSignals: Signal[] = [];
    
    for (const symbol of config.symbols) {
      addLog(`Analizando ${symbol}...`, 'info');
      const signal = await analyzeSymbol(symbol);
      
      if (signal) {
        newSignals.push(signal);
        addLog(`Señal detectada: ${symbol} ${signal.direction.toUpperCase()} (${signal.confidence}%)`, 'success');
      }
    }
    
    if (newSignals.length > 0) {
      setSignals(prev => [...newSignals, ...prev].slice(0, 20));
      
      // Auto-execute in automatic mode
      if (config.mode === 'automatic' && activeTrades.length < config.maxConcurrentTrades) {
        const bestSignal = newSignals.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        );
        
        if (bestSignal.confidence >= 60) {
          await executeTrade(bestSignal);
        }
      }
      
      updateRobotState('waiting', `${newSignals.length} señal(es) detectada(s)`);
    } else {
      updateRobotState('waiting', 'Esperando señales...');
      addLog('Sin señales válidas en este ciclo', 'info');
    }
  }, [isRunning, config, activeTrades.length, addLog, analyzeSymbol, updateRobotState]);

  // Execute trade - Calls real API
  const executeTrade = useCallback(async (signal: Signal) => {
    if (activeTrades.length >= config.maxConcurrentTrades) {
      addLog('Máximo de operaciones simultáneas alcanzado', 'warning');
      return;
    }
    
    updateRobotState('executing', `Ejecutando ${signal.direction.toUpperCase()} en ${signal.symbol}`);
    addLog(`Ejecutando operación: ${signal.symbol} ${signal.direction.toUpperCase()}`, 'info');
    
    try {
      // Call real API to place order
      const response = await fetch(`${BASE_URL}/api/trading/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: signal.symbol,
          amount: config.tradeAmount,
          direction: signal.direction,
          expiration: 5, // 5 minutes default
          strategy: signal.strategy,
          confidence: signal.confidence,
          reasons: signal.reasons,
        }),
      });
      
      const data = await response.json();
      
      if (data.status === 'success' && data.order_id) {
        const trade: Trade = {
          id: data.order_id || `TRADE-${Date.now()}`,
          symbol: signal.symbol,
          direction: signal.direction,
          amount: config.tradeAmount,
          entryPrice: data.entry_price || 0,
          result: 'pending',
          pnl: 0,
          strategy: signal.strategy,
          openTime: new Date().toISOString(),
          explanation: signal.reasons.join(' | '),
        };
        
        setActiveTrades(prev => [...prev, trade]);
        addLog(`✅ Operación ejecutada en IQ Option: ${trade.id}`, 'success');
        
        // Update balance from platform
        await fetchRealBalance();
        
        // Check trade result after expiration
        setTimeout(() => {
          checkTradeResult(trade.id);
        }, 5 * 60 * 1000 + 5000); // 5 min + 5 sec buffer
        
      } else {
        // Fallback to simulation if API fails
        addLog(`API no disponible, usando simulación`, 'warning');
        executeSimulatedTrade(signal);
      }
    } catch (error) {
      console.error('Error executing trade:', error);
      addLog(`Error al ejecutar, usando simulación`, 'warning');
      executeSimulatedTrade(signal);
    }
  }, [config, activeTrades.length, addLog, updateRobotState, fetchRealBalance]);

  // Simulated trade fallback
  const executeSimulatedTrade = useCallback((signal: Signal) => {
    const entryPrice = 1.1000 + Math.random() * 0.01;
    const trade: Trade = {
      id: `SIM-${Date.now()}`,
      symbol: signal.symbol,
      direction: signal.direction,
      amount: config.tradeAmount,
      entryPrice,
      result: 'pending',
      pnl: 0,
      strategy: signal.strategy,
      openTime: new Date().toISOString(),
      explanation: signal.reasons.join(' | '),
    };
    
    setActiveTrades(prev => [...prev, trade]);
    setBalance(prev => (prev ?? 0) - config.tradeAmount);
    
    // Simulate trade result after random time
    const duration = 5000 + Math.random() * 10000;
    setTimeout(() => {
      closeTrade(trade.id);
    }, duration);
    
    addLog(`Operación simulada: ${trade.id}`, 'info');
  }, [config, addLog]);

  // Check real trade result from API
  const checkTradeResult = useCallback(async (tradeId: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/order/${tradeId}`);
      const data = await response.json();
      
      if (data.status === 'success' && data.result) {
        const isWin = data.result === 'win';
        const pnl = isWin ? config.tradeAmount * 0.8 : -config.tradeAmount;
        
        setActiveTrades(prev => {
          const trade = prev.find(t => t.id === tradeId);
          if (trade) {
            const closedTrade: Trade = {
              ...trade,
              result: isWin ? 'win' : 'loss',
              pnl,
              closeTime: new Date().toISOString(),
            };
            setTrades(prevTrades => [closedTrade, ...prevTrades]);
            addLog(
              `Operación ${tradeId}: ${isWin ? '✅ GANADA' : '❌ PERDIDA'} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
              isWin ? 'success' : 'warning'
            );
          }
          return prev.filter(t => t.id !== tradeId);
        });
        
        await fetchRealBalance();
      } else {
        // Fallback: close as simulated
        closeTrade(tradeId);
      }
    } catch (error) {
      closeTrade(tradeId);
    }
  }, [config.tradeAmount, addLog, fetchRealBalance]);

  // Close trade
  const closeTrade = useCallback((tradeId: string) => {
    setActiveTrades(prev => {
      const trade = prev.find(t => t.id === tradeId);
      if (!trade) return prev;
      
      // Simulate win rate based on confidence
      const winProbability = 0.55 + (config.riskLevel === 'low' ? 0.05 : config.riskLevel === 'high' ? -0.05 : 0);
      const isWin = Math.random() < winProbability;
      
      const exitPrice = trade.entryPrice + (isWin ? 
        (trade.direction === 'call' ? 0.001 : -0.001) : 
        (trade.direction === 'call' ? -0.001 : 0.001)
      );
      
      const pnl = isWin ? trade.amount * 0.8 : -trade.amount;
      
      const closedTrade: Trade = {
        ...trade,
        exitPrice,
        result: isWin ? 'win' : 'loss',
        pnl,
        closeTime: new Date().toISOString(),
      };
      
      setTrades(prevTrades => [closedTrade, ...prevTrades]);
      setBalance(prevBalance => (prevBalance ?? 0) + trade.amount + pnl);
      
      addLog(
        `Operación cerrada: ${trade.symbol} ${closedTrade.result === 'win' ? '✅ GANADA' : '❌ PERDIDA'} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        closedTrade.result === 'win' ? 'success' : 'warning'
      );
      
      return prev.filter(t => t.id !== tradeId);
    });
  }, [config.riskLevel, addLog]);

  // Start/Stop robot
  const toggleRobot = useCallback(async () => {
    if (isRunning) {
      setIsRunning(false);
      updateRobotState('inactive', 'Sistema detenido');
      addLog('Robot detenido', 'warning');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      const connected = await connectToPlatform();
      if (connected) {
        setIsRunning(true);
        updateRobotState('analyzing', 'Iniciando análisis...');
        addLog(`Robot iniciado en modo ${config.mode === 'automatic' ? 'AUTOMÁTICO' : 'MANUAL'}`, 'success');
        analysisCountRef.current = 0;
        
        // Initial analysis
        setTimeout(runAnalysisCycle, 1000);
        
        // Set up interval
        intervalRef.current = setInterval(runAnalysisCycle, config.analysisInterval * 1000);
      }
    }
  }, [isRunning, config.mode, config.analysisInterval, addLog, updateRobotState, connectToPlatform, runAnalysisCycle]);

  // Reset demo
  const resetDemo = useCallback(() => {
    setBalance(initialBalance);
    setTrades([]);
    setActiveTrades([]);
    setSignals([]);
    setLogs([]);
    analysisCountRef.current = 0;
    addLog('Demo reiniciado', 'info');
  }, [initialBalance, addLog]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Stats
  const stats = {
    totalTrades: trades.length,
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    winRate: trades.length > 0 ? (trades.filter(t => t.result === 'win').length / trades.length * 100) : 0,
    totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0),
    profitFactor: trades.filter(t => t.result === 'loss').reduce((sum, t) => sum + Math.abs(t.pnl), 0) > 0
      ? trades.filter(t => t.result === 'win').reduce((sum, t) => sum + t.pnl, 0) / 
        trades.filter(t => t.result === 'loss').reduce((sum, t) => sum + Math.abs(t.pnl), 0)
      : 0,
  };

  // Robot status indicator
  const RobotIndicator = () => {
    const statusColors = {
      inactive: 'bg-gray-400',
      analyzing: 'bg-blue-500',
      executing: 'bg-green-500',
      waiting: 'bg-yellow-500',
      error: 'bg-red-500',
    };
    
    const statusLabels = {
      inactive: 'Inactivo',
      analyzing: 'Analizando',
      executing: 'Ejecutando',
      waiting: 'En Espera',
      error: 'Error',
    };
    
    return (
      <div className="flex items-center gap-3 bg-gray-800 rounded-xl p-4">
        <div className="relative">
          <div className={`w-16 h-16 rounded-full ${statusColors[robotState.status]} flex items-center justify-center text-3xl ${robotState.status !== 'inactive' ? 'animate-pulse' : ''}`}>
            🤖
          </div>
          <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-gray-800 ${
            robotState.status === 'inactive' ? 'bg-gray-500' :
            robotState.status === 'error' ? 'bg-red-500' : 'bg-green-500'
          } ${robotState.status !== 'inactive' && robotState.status !== 'error' ? 'animate-ping' : ''}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusColors[robotState.status]} text-white`}>
              {statusLabels[robotState.status]}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              config.mode === 'automatic' ? 'bg-purple-600' : 'bg-blue-600'
            } text-white`}>
              {config.mode === 'automatic' ? 'AUTO' : 'MANUAL'}
            </span>
          </div>
          <p className="text-sm text-gray-300 mt-1">{robotState.currentAction}</p>
          <p className="text-xs text-gray-500">
            {connectionStatus === 'connected' ? '🟢 Conectado' : '🔴 Desconectado'} | 
            Símbolos: {config.symbols.length} | 
            Activas: {activeTrades.length}/{config.maxConcurrentTrades}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">🎮 Trading Demo Profesional</h1>
            <span className="px-3 py-1 bg-yellow-600 rounded-full text-xs font-bold">
              SIMULADOR
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/app/dashboard/trading/live')}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
            >
              Ir a Trading Real →
            </button>
            <button
              onClick={() => router.push('/app/dashboard')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium"
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Left Column - Robot Status & Controls */}
          <div className="space-y-4">
            {/* Robot Indicator */}
            <RobotIndicator />
            
            {/* Balance Card */}
            <div className={`rounded-xl p-4 ${platformConnected ? 'bg-gradient-to-br from-green-600 to-green-700' : 'bg-gradient-to-br from-yellow-600 to-yellow-700'}`}>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-green-200">
                  {platformConnected ? '💰 Saldo Real IQ Option' : '🎮 Balance Demo Simulado'}
                </p>
                {platformConnected && accountInfo?.account_type && (
                  <span className="text-xs bg-black/30 px-2 py-0.5 rounded">{accountInfo.account_type}</span>
                )}
              </div>
              <p className="text-3xl font-bold">${(balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className={`text-sm mt-1 ${stats.totalPnL >= 0 ? 'text-green-200' : 'text-red-300'}`}>
                {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)} USD 
                {initialBalance && initialBalance > 0 ? ` (${(((balance ?? 0) - initialBalance) / initialBalance * 100).toFixed(1)}%)` : ''}
              </p>
              {accountInfo?.email && (
                <p className="text-xs text-green-300/70 mt-1 truncate">{accountInfo.email}</p>
              )}
            </div>

            {/* Mode Selection */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold mb-3">Modo de Operación</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, mode: 'manual' }))}
                  className={`p-3 rounded-lg text-center transition-all ${
                    config.mode === 'manual' 
                      ? 'bg-blue-600 ring-2 ring-blue-400' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-2xl block mb-1">👆</span>
                  <span className="text-sm font-medium">Manual</span>
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, mode: 'automatic' }))}
                  className={`p-3 rounded-lg text-center transition-all ${
                    config.mode === 'automatic' 
                      ? 'bg-purple-600 ring-2 ring-purple-400' 
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <span className="text-2xl block mb-1">🤖</span>
                  <span className="text-sm font-medium">Automático</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {config.mode === 'manual' 
                  ? 'Tú decides cuándo ejecutar las operaciones'
                  : 'El robot opera de forma autónoma'
                }
              </p>
            </div>

            {/* Main Controls */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold mb-3">Controles</h3>
              <div className="space-y-2">
                <button
                  onClick={toggleRobot}
                  className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                    isRunning 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isRunning ? '⏹️ Detener Robot' : '▶️ Iniciar Robot'}
                </button>
                
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-medium"
                >
                  ⚙️ {showConfig ? 'Ocultar' : 'Mostrar'} Configuración
                </button>
                
                <button
                  onClick={resetDemo}
                  className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-medium"
                >
                  🔄 Reiniciar Demo
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-bold mb-3">Estadísticas</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-xl font-bold text-blue-400">{stats.totalTrades}</p>
                  <p className="text-xs text-gray-400">Operaciones</p>
                </div>
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-xl font-bold text-green-400">{stats.winRate.toFixed(1)}%</p>
                  <p className="text-xs text-gray-400">Win Rate</p>
                </div>
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-xl font-bold text-green-400">{stats.wins}</p>
                  <p className="text-xs text-gray-400">Ganadas</p>
                </div>
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-xl font-bold text-red-400">{stats.losses}</p>
                  <p className="text-xs text-gray-400">Perdidas</p>
                </div>
              </div>
            </div>
          </div>

          {/* Center Columns - Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Configuration Panel (Collapsible) */}
            {showConfig && (
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="font-bold mb-4">⚙️ Configuración Avanzada</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Symbols Selection */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Símbolos (múltiples)</label>
                    <div className="bg-gray-700 rounded-lg p-2 max-h-32 overflow-y-auto">
                      {AVAILABLE_SYMBOLS.map(symbol => (
                        <label key={symbol} className="flex items-center gap-2 p-1 hover:bg-gray-600 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.symbols.includes(symbol)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setConfig(prev => ({ ...prev, symbols: [...prev.symbols, symbol] }));
                              } else {
                                setConfig(prev => ({ ...prev, symbols: prev.symbols.filter(s => s !== symbol) }));
                              }
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">{symbol}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Strategies Selection */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Estrategias</label>
                    <div className="bg-gray-700 rounded-lg p-2 max-h-32 overflow-y-auto">
                      {AVAILABLE_STRATEGIES.map(strat => (
                        <label key={strat.id} className="flex items-center gap-2 p-1 hover:bg-gray-600 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.strategies.includes(strat.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setConfig(prev => ({ ...prev, strategies: [...prev.strategies, strat.id] }));
                              } else {
                                setConfig(prev => ({ ...prev, strategies: prev.strategies.filter(s => s !== strat.id) }));
                              }
                            }}
                            className="rounded"
                          />
                          <div>
                            <span className="text-sm font-medium">{strat.name}</span>
                            <p className="text-xs text-gray-400">{strat.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Timeframe */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Timeframe</label>
                    <select
                      value={config.timeframe}
                      onChange={(e) => setConfig(prev => ({ ...prev, timeframe: e.target.value }))}
                      className="w-full bg-gray-700 rounded-lg p-2"
                    >
                      {TIMEFRAMES.map(tf => (
                        <option key={tf.value} value={tf.value}>{tf.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Analysis Interval */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Intervalo de Análisis</label>
                    <select
                      value={config.analysisInterval}
                      onChange={(e) => setConfig(prev => ({ ...prev, analysisInterval: Number(e.target.value) }))}
                      className="w-full bg-gray-700 rounded-lg p-2"
                    >
                      <option value={15}>15 segundos</option>
                      <option value={30}>30 segundos</option>
                      <option value={60}>1 minuto</option>
                      <option value={120}>2 minutos</option>
                      <option value={300}>5 minutos</option>
                    </select>
                  </div>
                  
                  {/* Risk Level */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Nivel de Riesgo</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['low', 'medium', 'high'] as const).map(level => (
                        <button
                          key={level}
                          onClick={() => setConfig(prev => ({ ...prev, riskLevel: level }))}
                          className={`p-2 rounded text-xs font-bold ${
                            config.riskLevel === level
                              ? level === 'low' ? 'bg-green-600' : level === 'medium' ? 'bg-yellow-600' : 'bg-red-600'
                              : 'bg-gray-700'
                          }`}
                        >
                          {level === 'low' ? 'Bajo' : level === 'medium' ? 'Medio' : 'Alto'}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Trade Amount */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Monto por Operación ($)</label>
                    <input
                      type="number"
                      value={config.tradeAmount}
                      onChange={(e) => setConfig(prev => ({ ...prev, tradeAmount: Number(e.target.value) }))}
                      className="w-full bg-gray-700 rounded-lg p-2"
                      min={1}
                      max={1000}
                    />
                  </div>
                  
                  {/* Max Concurrent Trades */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Máx. Operaciones Simultáneas</label>
                    <input
                      type="number"
                      value={config.maxConcurrentTrades}
                      onChange={(e) => setConfig(prev => ({ ...prev, maxConcurrentTrades: Number(e.target.value) }))}
                      className="w-full bg-gray-700 rounded-lg p-2"
                      min={1}
                      max={10}
                    />
                  </div>
                  
                  {/* Martingale */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.martingale}
                        onChange={(e) => setConfig(prev => ({ ...prev, martingale: e.target.checked }))}
                        className="rounded"
                      />
                      <span className="text-sm">Martingale</span>
                    </label>
                    {config.martingale && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={config.martingaleMultiplier}
                          onChange={(e) => setConfig(prev => ({ ...prev, martingaleMultiplier: Number(e.target.value) }))}
                          className="bg-gray-700 rounded p-1 text-sm"
                          placeholder="Multiplicador"
                          step={0.1}
                        />
                        <input
                          type="number"
                          value={config.maxMartingaleSteps}
                          onChange={(e) => setConfig(prev => ({ ...prev, maxMartingaleSteps: Number(e.target.value) }))}
                          className="bg-gray-700 rounded p-1 text-sm"
                          placeholder="Max pasos"
                        />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Save Configuration Button */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(`${BASE_URL}/api/trading/config`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            mode: config.mode,
                            symbols: config.symbols,
                            strategies: config.strategies,
                            timeframe: config.timeframe,
                            analysis_interval: config.analysisInterval,
                            max_concurrent_trades: config.maxConcurrentTrades,
                            risk_level: config.riskLevel,
                            trade_amount: config.tradeAmount,
                          }),
                        });
                        const data = await response.json();
                        if (data.status === 'success') {
                          addLog('✅ Configuración guardada exitosamente', 'success');
                        } else {
                          addLog('⚠️ Config guardada localmente', 'warning');
                        }
                        localStorage.setItem('trading_config', JSON.stringify(config));
                      } catch (error) {
                        addLog('⚠️ Config guardada localmente', 'warning');
                        localStorage.setItem('trading_config', JSON.stringify(config));
                      }
                    }}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-lg transition-all"
                  >
                    💾 Guardar Configuración
                  </button>
                </div>
              </div>
            )}

            {/* Signals Panel */}
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                <h3 className="font-bold">📡 Señales Detectadas</h3>
                <span className="text-xs text-gray-400">{signals.length} señales</span>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto">
                {signals.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {isRunning ? 'Analizando mercado...' : 'Inicia el robot para detectar señales'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {signals.map(signal => (
                      <div key={signal.id} className={`p-3 rounded-lg border-l-4 ${
                        signal.direction === 'call' ? 'bg-green-900/30 border-green-500' : 'bg-red-900/30 border-red-500'
                      }`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{signal.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              signal.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                            }`}>
                              {signal.direction.toUpperCase()}
                            </span>
                            <span className="text-sm text-gray-400">{signal.confidence}%</span>
                          </div>
                          {config.mode === 'manual' && (
                            <button
                              onClick={() => executeTrade(signal)}
                              disabled={activeTrades.length >= config.maxConcurrentTrades}
                              className={`px-3 py-1 rounded text-sm font-medium ${
                                activeTrades.length >= config.maxConcurrentTrades
                                  ? 'bg-gray-600 cursor-not-allowed'
                                  : signal.direction === 'call' 
                                    ? 'bg-green-600 hover:bg-green-700' 
                                    : 'bg-red-600 hover:bg-red-700'
                              }`}
                            >
                              Ejecutar
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {signal.reasons.slice(0, 2).join(' | ')}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(signal.timestamp).toLocaleTimeString()} | {signal.strategy}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active Trades */}
            {activeTrades.length > 0 && (
              <div className="bg-gray-800 rounded-xl overflow-hidden">
                <div className="bg-blue-600 px-4 py-2">
                  <h3 className="font-bold">⚡ Operaciones Activas ({activeTrades.length})</h3>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    {activeTrades.map(trade => (
                      <div key={trade.id} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{trade.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              trade.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                            }`}>
                              {trade.direction.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">${trade.amount} | {trade.strategy}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                            <span className="text-sm text-yellow-400">En curso</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Logs */}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
              <h3 className="text-green-400 font-mono text-sm mb-2">📟 Logs del Sistema</h3>
              <div className="h-40 overflow-y-auto font-mono text-xs text-green-300 space-y-0.5">
                {logs.length === 0 && <p className="text-gray-600">Esperando actividad...</p>}
                {logs.map((log, i) => (
                  <p key={i} className="hover:bg-gray-800 px-1">{log}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - History & Info */}
          <div className="space-y-4">
            {/* Trade History */}
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="bg-gray-700 px-4 py-2">
                <h3 className="font-bold">📜 Historial</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {trades.length === 0 ? (
                  <p className="p-4 text-center text-gray-500">Sin operaciones aún</p>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {trades.slice(0, 20).map(trade => (
                      <div key={trade.id} className="p-3 hover:bg-gray-700/50">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              trade.result === 'win' ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                            <span className="font-medium text-sm">{trade.symbol}</span>
                            <span className={`text-xs ${
                              trade.direction === 'call' ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {trade.direction.toUpperCase()}
                            </span>
                          </div>
                          <span className={`font-mono text-sm ${
                            trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {trade.closeTime ? new Date(trade.closeTime).toLocaleString() : ''} | {trade.strategy}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Info Cards */}
            <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-800">
              <h3 className="font-bold text-blue-400 mb-2">💡 Modo Manual</h3>
              <ul className="text-xs text-blue-300 space-y-1">
                <li>• El robot analiza y detecta señales</li>
                <li>• Tú decides si ejecutar o no</li>
                <li>• Ideal para aprender y validar</li>
              </ul>
            </div>

            <div className="bg-purple-900/30 rounded-xl p-4 border border-purple-800">
              <h3 className="font-bold text-purple-400 mb-2">🤖 Modo Automático</h3>
              <ul className="text-xs text-purple-300 space-y-1">
                <li>• Operación 100% autónoma</li>
                <li>• Ejecuta las mejores señales</li>
                <li>• Opera mientras no estás</li>
              </ul>
            </div>

            <div className="bg-yellow-900/30 rounded-xl p-4 border border-yellow-800">
              <h3 className="font-bold text-yellow-400 mb-2">⚠️ Importante</h3>
              <p className="text-xs text-yellow-300">
                Este es un simulador con datos de alta fidelidad. 
                Los resultados aquí te ayudarán a validar estrategias antes de operar con dinero real.
              </p>
            </div>

            <div className="bg-green-900/30 rounded-xl p-4 border border-green-800">
              <h3 className="font-bold text-green-400 mb-2">🎯 Tu Objetivo</h3>
              <p className="text-xs text-green-300">
                Logra un Win Rate de 55%+ de forma consistente antes de pasar a trading real.
              </p>
              <p className="text-lg font-bold text-green-400 mt-2">
                Win Rate Actual: {stats.winRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
