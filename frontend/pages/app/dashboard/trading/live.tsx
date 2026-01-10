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
  platform: string;
  orderId?: string;
}

interface AccountInfo {
  balance: number;
  currency: string;
  accountType: 'DEMO' | 'REAL';
  email?: string;
  platform: string;
}

interface RobotState {
  status: 'inactive' | 'analyzing' | 'executing' | 'waiting' | 'error' | 'syncing';
  currentAction: string;
  lastUpdate: string;
}

interface TradingConfig {
  mode: 'manual' | 'automatic';
  platform: 'iqoption' | 'mt5';
  accountType: 'DEMO' | 'REAL';
  symbols: string[];
  strategies: string[];
  timeframe: string;
  analysisInterval: number;
  maxConcurrentTrades: number;
  riskLevel: 'low' | 'medium' | 'high';
  tradeAmount: number;
  expirationTime: number;
}

interface PlatformSync {
  lastSync: string;
  status: 'synced' | 'syncing' | 'error';
  platformTrades: number;
  systemTrades: number;
}

const AVAILABLE_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 
  'EURGBP', 'EURJPY', 'GBPJPY', 'NZDUSD', 'USDCHF',
  'EURUSD-OTC', 'GBPUSD-OTC', 'USDJPY-OTC'
];

const AVAILABLE_STRATEGIES = [
  { id: 'ema_rsi', name: 'EMA + RSI', description: 'Cruce de medias con RSI' },
  { id: 'macd', name: 'MACD', description: 'Convergencia/Divergencia' },
  { id: 'bollinger', name: 'Bollinger', description: 'Bandas de volatilidad' },
  { id: 'ichimoku', name: 'Ichimoku', description: 'Sistema de tendencia' },
  { id: 'multi_strategy', name: 'Multi-Estrategia', description: 'Combinación ML' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1 Min' },
  { value: '5m', label: '5 Min' },
  { value: '15m', label: '15 Min' },
  { value: '1h', label: '1 Hora' },
];

export default function TradingLiveProfessional() {
  const router = useRouter();
  
  // State
  const [config, setConfig] = useState<TradingConfig>({
    mode: 'manual',
    platform: 'iqoption',
    accountType: 'DEMO',
    symbols: ['EURUSD'],
    strategies: ['ema_rsi'],
    timeframe: '5m',
    analysisInterval: 30,
    maxConcurrentTrades: 3,
    riskLevel: 'medium',
    tradeAmount: 1,
    expirationTime: 5,
  });
  
  const [robotState, setRobotState] = useState<RobotState>({
    status: 'inactive',
    currentAction: 'Sistema detenido',
    lastUpdate: new Date().toISOString(),
  });
  
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [platformSync, setPlatformSync] = useState<PlatformSync>({
    lastSync: '',
    status: 'synced',
    platformTrades: 0,
    systemTrades: 0,
  });
  
  // Credentials state
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Economic news state
  const [economicNews, setEconomicNews] = useState<Array<{
    time: string;
    currency: string;
    event: string;
    impact: 'high' | 'medium' | 'low';
    forecast?: string;
    previous?: string;
  }>>([]);
  const [showNews, setShowNews] = useState(true);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Logging
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const icons = { info: '📊', success: '✅', warning: '⚠️', error: '❌' };
    setLogs(prev => [...prev.slice(-100), `[${timestamp}] ${icons[type]} ${message}`]);
  }, []);

  // Update robot state
  const updateRobotState = useCallback((status: RobotState['status'], action: string) => {
    setRobotState({
      status,
      currentAction: action,
      lastUpdate: new Date().toISOString(),
    });
  }, []);

  // Check platform connection
  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/status`);
      const data = await response.json();
      
      if (data.status === 'connected' || data.connected) {
        setIsConnected(true);
        if (data.account_info) {
          setAccountInfo({
            balance: data.account_info.balance || 0,
            currency: data.account_info.currency || 'USD',
            accountType: data.account_info.account_type || config.accountType,
            email: data.account_info.email,
            platform: config.platform,
          });
        }
        return true;
      }
    } catch (error) {
      console.error('Connection check failed:', error);
    }
    setIsConnected(false);
    return false;
  }, [config.platform, config.accountType]);

  // Load saved credentials on mount
  useEffect(() => {
    const savedCreds = localStorage.getItem('iq_credentials');
    if (savedCreds) {
      try {
        const parsed = JSON.parse(savedCreds);
        setCredentials(parsed);
      } catch (e) {}
    }
    // Load economic news
    fetchEconomicNews();
  }, []);

  // Fetch economic news
  const fetchEconomicNews = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/economic-calendar`);
      const data = await response.json();
      if (data.events) {
        setEconomicNews(data.events);
      }
    } catch (error) {
      // Use mock data if API fails
      setEconomicNews([
        { time: '08:30', currency: 'USD', event: 'Non-Farm Payrolls', impact: 'high', forecast: '200K', previous: '187K' },
        { time: '10:00', currency: 'USD', event: 'ISM Manufacturing PMI', impact: 'high', forecast: '47.5', previous: '46.7' },
        { time: '14:00', currency: 'EUR', event: 'ECB Interest Rate Decision', impact: 'high', forecast: '4.50%', previous: '4.50%' },
        { time: '15:30', currency: 'GBP', event: 'BoE Governor Speech', impact: 'medium' },
      ]);
    }
  }, []);

  // Connect to platform with credentials
  const connectToPlatform = useCallback(async (email?: string, password?: string) => {
    const useEmail = email || credentials.email;
    const usePassword = password || credentials.password;
    
    if (!useEmail || !usePassword) {
      setShowLoginModal(true);
      return false;
    }
    
    setIsConnecting(true);
    addLog(`Conectando a ${config.platform.toUpperCase()}...`, 'info');
    updateRobotState('syncing', 'Estableciendo conexión...');
    
    try {
      const response = await fetch(`${BASE_URL}/api/trading/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: config.platform,
          account_type: config.accountType,
          credentials: {
            email: useEmail,
            password: usePassword,
          },
        }),
      });
      
      const data = await response.json();
      
      if (data.status === 'connected' || data.accountInfo) {
        setIsConnected(true);
        setShowLoginModal(false);
        // Save credentials
        localStorage.setItem('iq_credentials', JSON.stringify({ email: useEmail, password: usePassword }));
        setCredentials({ email: useEmail, password: usePassword });
        
        if (data.accountInfo) {
          setAccountInfo({
            balance: data.accountInfo.balance || 0,
            currency: data.accountInfo.currency || 'USD',
            accountType: data.accountInfo.account_type || config.accountType,
            email: data.accountInfo.email,
            platform: config.platform,
          });
        }
        
        addLog(`✅ Conectado a ${config.platform.toUpperCase()} (${config.accountType})`, 'success');
        updateRobotState('inactive', 'Conectado - Listo para operar');
        return true;
      } else {
        throw new Error(data.message || 'Error de autenticación');
      }
    } catch (error: any) {
      addLog(`❌ Error de conexión: ${error.message}`, 'error');
      updateRobotState('error', 'Error de conexión');
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [config.platform, config.accountType, credentials, addLog, updateRobotState]);

  // Sync with platform
  const syncWithPlatform = useCallback(async () => {
    if (!isConnected) return;
    
    setPlatformSync(prev => ({ ...prev, status: 'syncing' }));
    
    try {
      // Get account info
      const accountResponse = await fetch(`${BASE_URL}/api/trading/account`);
      const accountData = await accountResponse.json();
      
      if (accountData.balance !== undefined) {
        setAccountInfo(prev => prev ? { ...prev, balance: accountData.balance } : null);
      }
      
      // Get trade history from platform
      const historyResponse = await fetch(`${BASE_URL}/api/trading/history?limit=50`);
      const historyData = await historyResponse.json();
      
      if (historyData.trades) {
        // Merge platform trades with local trades
        const platformTrades = historyData.trades.map((t: any) => ({
          id: t.id || `PLT-${Date.now()}`,
          symbol: t.symbol || t.active,
          direction: t.direction || (t.type === 'call' ? 'call' : 'put'),
          amount: t.amount,
          entryPrice: t.open_price || t.entry_price,
          exitPrice: t.close_price || t.exit_price,
          result: t.win ? 'win' : 'loss',
          pnl: t.profit || t.pnl || 0,
          strategy: t.strategy || 'manual',
          openTime: t.open_time || t.created_at,
          closeTime: t.close_time,
          explanation: t.explanation || '',
          platform: config.platform,
          orderId: t.order_id,
        }));
        
        setTrades(platformTrades);
        setPlatformSync({
          lastSync: new Date().toISOString(),
          status: 'synced',
          platformTrades: platformTrades.length,
          systemTrades: trades.length,
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      setPlatformSync(prev => ({ ...prev, status: 'error' }));
    }
  }, [isConnected, config.platform, trades.length]);

  // Analyze market
  const analyzeMarket = useCallback(async () => {
    if (!isRunning || !isConnected) return;
    
    updateRobotState('analyzing', 'Analizando mercado...');
    
    const newSignals: Signal[] = [];
    
    for (const symbol of config.symbols) {
      try {
        const response = await fetch(`${BASE_URL}/api/live/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            timeframe: config.timeframe,
            strategy: config.strategies[0],
            use_ml: true,
            platform: config.platform,
          }),
        });
        
        const data = await response.json();
        
        if (data.status === 'success' && data.analysis?.signal) {
          const sig = data.analysis.signal;
          if (sig.signal !== 'none' && sig.confidence >= 45) {
            const signal: Signal = {
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
            newSignals.push(signal);
            addLog(`Señal: ${symbol} ${sig.signal.toUpperCase()} (${sig.confidence}%)`, 'success');
          }
        }
      } catch (error) {
        addLog(`Error analizando ${symbol}`, 'warning');
      }
    }
    
    if (newSignals.length > 0) {
      setSignals(prev => [...newSignals, ...prev].slice(0, 30));
      
      // Auto-execute in automatic mode
      if (config.mode === 'automatic' && activeTrades.length < config.maxConcurrentTrades) {
        const bestSignal = newSignals.reduce((best, curr) => 
          curr.confidence > best.confidence ? curr : best
        );
        
        if (bestSignal.confidence >= 50) {
          // Execute trade inline to avoid circular dependency
          try {
            addLog(`Auto-ejecutando: ${bestSignal.symbol} ${bestSignal.direction.toUpperCase()} $${config.tradeAmount}`, 'info');
            const orderResponse = await fetch(`${BASE_URL}/api/trading/order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: bestSignal.symbol,
                direction: bestSignal.direction,
                amount: config.tradeAmount,
                expiration: config.expirationTime,
                strategy: bestSignal.strategy,
                explanation: bestSignal.reasons.join(' | '),
              }),
            });
            const orderData = await orderResponse.json();
            if (orderData.status === 'success' || orderData.order_id) {
              const trade: Trade = {
                id: orderData.order_id || `TRADE-${Date.now()}`,
                symbol: bestSignal.symbol,
                direction: bestSignal.direction,
                amount: config.tradeAmount,
                entryPrice: orderData.entry_price || 0,
                result: 'pending',
                pnl: 0,
                strategy: bestSignal.strategy,
                openTime: new Date().toISOString(),
                explanation: bestSignal.reasons.join(' | '),
                platform: config.platform,
                orderId: orderData.order_id,
              };
              setActiveTrades(prev => [...prev, trade]);
              addLog(`✅ Operación abierta: ${trade.id}`, 'success');
            }
          } catch (execError: any) {
            addLog(`Error auto-ejecutando: ${execError.message}`, 'error');
          }
        }
      }
    }
    
    updateRobotState('waiting', newSignals.length > 0 ? `${newSignals.length} señal(es)` : 'Esperando...');
  }, [isRunning, isConnected, config, activeTrades.length, addLog, updateRobotState]);

  // Execute real trade
  const executeRealTrade = useCallback(async (signal: Signal) => {
    if (!isConnected) {
      addLog('No hay conexión con la plataforma', 'error');
      return;
    }
    
    if (activeTrades.length >= config.maxConcurrentTrades) {
      addLog('Máximo de operaciones alcanzado', 'warning');
      return;
    }
    
    updateRobotState('executing', `Ejecutando ${signal.direction.toUpperCase()} en ${signal.symbol}`);
    addLog(`Ejecutando: ${signal.symbol} ${signal.direction.toUpperCase()} $${config.tradeAmount}`, 'info');
    
    try {
      const response = await fetch(`${BASE_URL}/api/trading/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: signal.symbol,
          direction: signal.direction,
          amount: config.tradeAmount,
          expiration: config.expirationTime,
          strategy: signal.strategy,
          explanation: signal.reasons.join(' | '),
        }),
      });
      
      const data = await response.json();
      
      if (data.status === 'success' || data.order_id) {
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
          platform: config.platform,
          orderId: data.order_id,
        };
        
        setActiveTrades(prev => [...prev, trade]);
        addLog(`Operación abierta: ${trade.id}`, 'success');
        
        // Update balance
        if (accountInfo) {
          setAccountInfo(prev => prev ? { ...prev, balance: prev.balance - config.tradeAmount } : null);
        }
      } else {
        throw new Error(data.message || 'Order failed');
      }
    } catch (error: any) {
      addLog(`Error ejecutando orden: ${error.message}`, 'error');
    }
  }, [isConnected, config, activeTrades.length, accountInfo, addLog, updateRobotState]);

  // Check active trades results
  const checkTradeResults = useCallback(async () => {
    if (activeTrades.length === 0) return;
    
    for (const trade of activeTrades) {
      try {
        const response = await fetch(`${BASE_URL}/api/trading/order/${trade.orderId || trade.id}`);
        const data = await response.json();
        
        if (data.status === 'closed' || data.result) {
          const isWin = data.win || data.result === 'win';
          const pnl = data.profit || (isWin ? trade.amount * 0.8 : -trade.amount);
          
          const closedTrade: Trade = {
            ...trade,
            exitPrice: data.close_price,
            result: isWin ? 'win' : 'loss',
            pnl,
            closeTime: new Date().toISOString(),
          };
          
          setTrades(prev => [closedTrade, ...prev]);
          setActiveTrades(prev => prev.filter(t => t.id !== trade.id));
          
          if (accountInfo) {
            setAccountInfo(prev => prev ? { ...prev, balance: prev.balance + trade.amount + pnl } : null);
          }
          
          addLog(
            `Cerrada: ${trade.symbol} ${isWin ? '✅ WIN' : '❌ LOSS'} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
            isWin ? 'success' : 'warning'
          );
        }
      } catch (error) {
        // Trade still pending
      }
    }
  }, [activeTrades, accountInfo, addLog]);

  // Start/Stop robot
  const toggleRobot = useCallback(async () => {
    if (isRunning) {
      setIsRunning(false);
      updateRobotState('inactive', 'Sistema detenido');
      addLog('Robot detenido', 'warning');
      
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    } else {
      if (!isConnected) {
        const connected = await connectToPlatform();
        if (!connected) return;
      }
      
      setIsRunning(true);
      updateRobotState('analyzing', 'Iniciando...');
      addLog(`Robot iniciado - ${config.mode.toUpperCase()} - ${config.accountType}`, 'success');
      
      // Start analysis interval
      setTimeout(analyzeMarket, 1000);
      intervalRef.current = setInterval(analyzeMarket, config.analysisInterval * 1000);
      
      // Start trade result checking
      syncIntervalRef.current = setInterval(() => {
        checkTradeResults();
        syncWithPlatform();
      }, 5000);
    }
  }, [isRunning, isConnected, config, addLog, updateRobotState, connectToPlatform, analyzeMarket, checkTradeResults, syncWithPlatform]);

  // Initial connection check
  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, []);

  // Stats calculation
  const stats = {
    totalTrades: trades.length,
    wins: trades.filter(t => t.result === 'win').length,
    losses: trades.filter(t => t.result === 'loss').length,
    winRate: trades.length > 0 ? (trades.filter(t => t.result === 'win').length / trades.length * 100) : 0,
    totalPnL: trades.reduce((sum, t) => sum + t.pnl, 0),
    todayTrades: trades.filter(t => {
      const today = new Date().toDateString();
      return new Date(t.openTime).toDateString() === today;
    }).length,
    todayPnL: trades.filter(t => {
      const today = new Date().toDateString();
      return new Date(t.openTime).toDateString() === today;
    }).reduce((sum, t) => sum + t.pnl, 0),
  };

  // Robot Status Indicator
  const RobotIndicator = () => {
    const statusConfig = {
      inactive: { color: 'bg-gray-500', label: 'Inactivo', icon: '😴' },
      analyzing: { color: 'bg-blue-500', label: 'Analizando', icon: '🔍' },
      executing: { color: 'bg-green-500', label: 'Ejecutando', icon: '⚡' },
      waiting: { color: 'bg-yellow-500', label: 'Esperando', icon: '⏳' },
      error: { color: 'bg-red-500', label: 'Error', icon: '❌' },
      syncing: { color: 'bg-purple-500', label: 'Sincronizando', icon: '🔄' },
    };
    
    const current = statusConfig[robotState.status];
    
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-20 h-20 rounded-full ${current.color} flex items-center justify-center text-4xl shadow-lg ${
              robotState.status !== 'inactive' ? 'animate-pulse' : ''
            }`}>
              {current.icon}
            </div>
            {isConnected && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-gray-800 flex items-center justify-center">
                <span className="text-xs">✓</span>
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-1 rounded text-xs font-bold ${current.color}`}>
                {current.label}
              </span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                config.mode === 'automatic' ? 'bg-purple-600' : 'bg-blue-600'
              }`}>
                {config.mode === 'automatic' ? 'AUTO' : 'MANUAL'}
              </span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                config.accountType === 'REAL' ? 'bg-red-600' : 'bg-yellow-600'
              }`}>
                {config.accountType}
              </span>
            </div>
            <p className="text-sm text-gray-300">{robotState.currentAction}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
              <span>{isConnected ? '🟢 Conectado' : '🔴 Desconectado'}</span>
              <span>Símbolos: {config.symbols.length}</span>
              <span>Activas: {activeTrades.length}/{config.maxConcurrentTrades}</span>
            </div>
          </div>
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
            <h1 className="text-xl font-bold">📊 Trading Live Profesional</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              config.accountType === 'REAL' ? 'bg-red-600' : 'bg-yellow-600'
            }`}>
              {config.accountType === 'REAL' ? '💰 CUENTA REAL' : '🎮 DEMO'}
            </span>
            {platformSync.status === 'synced' && (
              <span className="px-2 py-1 bg-green-600/30 text-green-400 rounded text-xs">
                🔄 Sincronizado
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/app/dashboard/trading/demo')}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium"
            >
              ← Ir a Demo
            </button>
            <button
              onClick={() => router.push('/app/dashboard')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        {/* Account Info Bar */}
        {accountInfo && (
          <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl p-4 mb-4 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-400">Plataforma</p>
                <p className="font-bold text-lg">{config.platform.toUpperCase()}</p>
              </div>
              <div className="h-10 w-px bg-gray-600" />
              <div>
                <p className="text-xs text-gray-400">Balance</p>
                <p className="font-bold text-2xl text-green-400">
                  ${accountInfo.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-10 w-px bg-gray-600" />
              <div>
                <p className="text-xs text-gray-400">P&L Hoy</p>
                <p className={`font-bold text-lg ${stats.todayPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.todayPnL >= 0 ? '+' : ''}${stats.todayPnL.toFixed(2)}
                </p>
              </div>
              <div className="h-10 w-px bg-gray-600" />
              <div>
                <p className="text-xs text-gray-400">Ops Hoy</p>
                <p className="font-bold text-lg">{stats.todayTrades}</p>
              </div>
            </div>
            <button
              onClick={syncWithPlatform}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
            >
              🔄 Sincronizar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            <RobotIndicator />
            
            {/* Platform & Account Selection */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="font-bold mb-3">🔌 Plataforma</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, platform: 'iqoption' }))}
                    disabled={isRunning}
                    className={`p-2 rounded-lg text-center text-sm font-medium ${
                      config.platform === 'iqoption' ? 'bg-green-600' : 'bg-gray-700'
                    } ${isRunning ? 'opacity-50' : ''}`}
                  >
                    IQ Option
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, platform: 'mt5' }))}
                    disabled={isRunning}
                    className={`p-2 rounded-lg text-center text-sm font-medium ${
                      config.platform === 'mt5' ? 'bg-blue-600' : 'bg-gray-700'
                    } ${isRunning ? 'opacity-50' : ''}`}
                  >
                    MetaTrader 5
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, accountType: 'DEMO' }))}
                    disabled={isRunning}
                    className={`p-2 rounded-lg text-center text-sm font-medium ${
                      config.accountType === 'DEMO' ? 'bg-yellow-600' : 'bg-gray-700'
                    } ${isRunning ? 'opacity-50' : ''}`}
                  >
                    🎮 DEMO
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, accountType: 'REAL' }))}
                    disabled={isRunning}
                    className={`p-2 rounded-lg text-center text-sm font-medium ${
                      config.accountType === 'REAL' ? 'bg-red-600' : 'bg-gray-700'
                    } ${isRunning ? 'opacity-50' : ''}`}
                  >
                    💰 REAL
                  </button>
                </div>
              </div>
            </div>
            
            {/* Mode Selection */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="font-bold mb-3">Modo</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, mode: 'manual' }))}
                  className={`p-3 rounded-lg text-center ${
                    config.mode === 'manual' ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-700'
                  }`}
                >
                  <span className="text-xl block">👆</span>
                  <span className="text-xs">Manual</span>
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, mode: 'automatic' }))}
                  className={`p-3 rounded-lg text-center ${
                    config.mode === 'automatic' ? 'bg-purple-600 ring-2 ring-purple-400' : 'bg-gray-700'
                  }`}
                >
                  <span className="text-xl block">🤖</span>
                  <span className="text-xs">Auto</span>
                </button>
              </div>
            </div>
            
            {/* Controls */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="font-bold mb-3">Controles</h3>
              <div className="space-y-2">
                {!isConnected && (
                  <button
                    onClick={() => connectToPlatform()}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                  >
                    🔌 Conectar
                  </button>
                )}
                <button
                  onClick={toggleRobot}
                  disabled={!isConnected && !isRunning}
                  className={`w-full py-3 rounded-lg font-bold ${
                    isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                  } ${!isConnected && !isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isRunning ? '⏹️ Detener' : '▶️ Iniciar'}
                </button>
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  ⚙️ Configuración
                </button>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="font-bold mb-3">📊 Rendimiento</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-lg font-bold text-blue-400">{stats.totalTrades}</p>
                  <p className="text-xs text-gray-400">Total</p>
                </div>
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-lg font-bold text-green-400">{stats.winRate.toFixed(0)}%</p>
                  <p className="text-xs text-gray-400">Win Rate</p>
                </div>
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-lg font-bold text-green-400">{stats.wins}</p>
                  <p className="text-xs text-gray-400">Ganadas</p>
                </div>
                <div className="bg-gray-700 p-2 rounded">
                  <p className="text-lg font-bold text-red-400">{stats.losses}</p>
                  <p className="text-xs text-gray-400">Perdidas</p>
                </div>
              </div>
              <div className={`mt-3 p-2 rounded text-center ${stats.totalPnL >= 0 ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                <p className={`text-xl font-bold ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">P&L Total</p>
              </div>
            </div>
          </div>
          
          {/* Center Columns */}
          <div className="lg:col-span-2 space-y-4">
            {/* Config Panel */}
            {showConfig && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="font-bold mb-4">⚙️ Configuración</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-400">Símbolos</label>
                    <select
                      multiple
                      value={config.symbols}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                        setConfig(prev => ({ ...prev, symbols: selected }));
                      }}
                      className="w-full bg-gray-700 rounded p-2 text-sm h-24"
                    >
                      {AVAILABLE_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Estrategia</label>
                    <select
                      value={config.strategies[0]}
                      onChange={(e) => setConfig(prev => ({ ...prev, strategies: [e.target.value] }))}
                      className="w-full bg-gray-700 rounded p-2 text-sm"
                    >
                      {AVAILABLE_STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Timeframe</label>
                    <select
                      value={config.timeframe}
                      onChange={(e) => setConfig(prev => ({ ...prev, timeframe: e.target.value }))}
                      className="w-full bg-gray-700 rounded p-2 text-sm"
                    >
                      {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Monto ($)</label>
                    <input
                      type="number"
                      value={config.tradeAmount}
                      onChange={(e) => setConfig(prev => ({ ...prev, tradeAmount: Number(e.target.value) }))}
                      className="w-full bg-gray-700 rounded p-2 text-sm"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Expiración (min)</label>
                    <select
                      value={config.expirationTime}
                      onChange={(e) => setConfig(prev => ({ ...prev, expirationTime: Number(e.target.value) }))}
                      className="w-full bg-gray-700 rounded p-2 text-sm"
                    >
                      <option value={1}>1 min</option>
                      <option value={5}>5 min</option>
                      <option value={15}>15 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Intervalo (seg)</label>
                    <input
                      type="number"
                      value={config.analysisInterval}
                      onChange={(e) => setConfig(prev => ({ ...prev, analysisInterval: Number(e.target.value) }))}
                      className="w-full bg-gray-700 rounded p-2 text-sm"
                      min={15}
                    />
                  </div>
                </div>
                
                {/* Save Configuration Button */}
                <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(`${BASE_URL}/api/trading/config`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            mode: config.mode,
                            platform: config.platform,
                            account_type: config.accountType,
                            symbols: config.symbols,
                            strategies: config.strategies,
                            timeframe: config.timeframe,
                            analysis_interval: config.analysisInterval,
                            max_concurrent_trades: config.maxConcurrentTrades,
                            trade_amount: config.tradeAmount,
                            expiration_time: config.expirationTime,
                          }),
                        });
                        const data = await response.json();
                        localStorage.setItem('live_trading_config', JSON.stringify(config));
                        addLog('✅ Configuración guardada', 'success');
                      } catch (error) {
                        localStorage.setItem('live_trading_config', JSON.stringify(config));
                        addLog('⚠️ Config guardada localmente', 'warning');
                      }
                    }}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
                  >
                    💾 Guardar Configuración
                  </button>
                  <button
                    onClick={() => {
                      const saved = localStorage.getItem('live_trading_config');
                      if (saved) {
                        setConfig(JSON.parse(saved));
                        addLog('📥 Configuración cargada', 'info');
                      }
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    📥 Cargar
                  </button>
                </div>
              </div>
            )}
            
            {/* Signals */}
            <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              <div className="bg-gray-700 px-4 py-2 flex justify-between">
                <h3 className="font-bold">📡 Señales en Tiempo Real</h3>
                <span className="text-xs text-gray-400">{signals.length}</span>
              </div>
              <div className="p-4 max-h-56 overflow-y-auto">
                {signals.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {isRunning ? 'Analizando...' : 'Inicia el robot'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {signals.slice(0, 10).map(sig => (
                      <div key={sig.id} className={`p-3 rounded-lg border-l-4 ${
                        sig.direction === 'call' ? 'bg-green-900/30 border-green-500' : 'bg-red-900/30 border-red-500'
                      }`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{sig.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              sig.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                            }`}>{sig.direction.toUpperCase()}</span>
                            <span className="text-sm text-gray-400">{sig.confidence}%</span>
                          </div>
                          {config.mode === 'manual' && (
                            <button
                              onClick={() => executeRealTrade(sig)}
                              className={`px-3 py-1 rounded text-sm font-medium ${
                                sig.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                              }`}
                            >
                              Ejecutar
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{sig.reasons[0]}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Active Trades */}
            {activeTrades.length > 0 && (
              <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700">
                <h3 className="font-bold mb-3">⚡ Operaciones Activas ({activeTrades.length})</h3>
                <div className="space-y-2">
                  {activeTrades.map(t => (
                    <div key={t.id} className="bg-gray-800 p-3 rounded-lg flex justify-between">
                      <div>
                        <span className="font-bold">{t.symbol}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                          t.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                        }`}>{t.direction.toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>${t.amount}</span>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Logs */}
            <div className="bg-black rounded-xl p-4 border border-gray-700">
              <h3 className="text-green-400 font-mono text-sm mb-2">📟 Sistema</h3>
              <div className="h-32 overflow-y-auto font-mono text-xs text-green-300">
                {logs.map((log, i) => <p key={i}>{log}</p>)}
              </div>
            </div>
          </div>
          
          {/* Right Column - History */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
              <div className="bg-gray-700 px-4 py-2">
                <h3 className="font-bold">📜 Historial Completo</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {trades.length === 0 ? (
                  <p className="p-4 text-center text-gray-500">Sin operaciones</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Hora</th>
                        <th className="px-2 py-1 text-left">Par</th>
                        <th className="px-2 py-1 text-left">Tipo</th>
                        <th className="px-2 py-1 text-right">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {trades.map(t => (
                        <tr key={t.id} className="hover:bg-gray-700/50">
                          <td className="px-2 py-1 text-gray-400">
                            {t.closeTime ? new Date(t.closeTime).toLocaleTimeString() : '-'}
                          </td>
                          <td className="px-2 py-1 font-medium">{t.symbol}</td>
                          <td className="px-2 py-1">
                            <span className={`px-1 rounded text-xs ${
                              t.direction === 'call' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                            }`}>{t.direction?.toUpperCase()}</span>
                          </td>
                          <td className={`px-2 py-1 text-right font-mono ${
                            t.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {t.result === 'win' ? '✓' : '✗'} {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
            {/* Sync Status */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="font-bold mb-2">🔄 Sincronización</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Estado</span>
                  <span className={platformSync.status === 'synced' ? 'text-green-400' : 'text-yellow-400'}>
                    {platformSync.status === 'synced' ? '✓ Sincronizado' : '⏳ Sincronizando'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Última sync</span>
                  <span>{platformSync.lastSync ? new Date(platformSync.lastSync).toLocaleTimeString() : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ops. Plataforma</span>
                  <span>{platformSync.platformTrades}</span>
                </div>
              </div>
            </div>
            
            {config.accountType === 'REAL' && (
              <div className="bg-red-900/30 rounded-xl p-4 border border-red-700">
                <h3 className="font-bold text-red-400 mb-2">⚠️ Cuenta Real</h3>
                <p className="text-xs text-red-300">
                  Estás operando con dinero real. Todas las operaciones afectarán tu balance.
                  Opera con responsabilidad.
                </p>
              </div>
            )}
            
            {/* Economic News Panel */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold">📰 Noticias Alto Impacto</h3>
                <button 
                  onClick={() => setShowNews(!showNews)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  {showNews ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {showNews && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {economicNews.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">Sin noticias programadas</p>
                  ) : (
                    economicNews.map((news, idx) => (
                      <div 
                        key={idx} 
                        className={`p-2 rounded-lg border-l-4 ${
                          news.impact === 'high' ? 'bg-red-900/30 border-red-500' :
                          news.impact === 'medium' ? 'bg-yellow-900/30 border-yellow-500' :
                          'bg-gray-700/50 border-gray-500'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-xs font-bold px-1 rounded ${
                              news.impact === 'high' ? 'bg-red-600' :
                              news.impact === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
                            }`}>
                              {news.currency}
                            </span>
                            <p className="text-sm mt-1">{news.event}</p>
                          </div>
                          <span className="text-xs text-gray-400">{news.time}</span>
                        </div>
                        {(news.forecast || news.previous) && (
                          <div className="flex gap-3 mt-1 text-xs text-gray-400">
                            {news.forecast && <span>Prev: {news.forecast}</span>}
                            {news.previous && <span>Ant: {news.previous}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
              <button 
                onClick={fetchEconomicNews}
                className="w-full mt-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              >
                🔄 Actualizar Noticias
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold mb-4">🔐 Conectar a {config.platform.toUpperCase()}</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const email = (form.elements.namedItem('email') as HTMLInputElement).value;
              const password = (form.elements.namedItem('password') as HTMLInputElement).value;
              connectToPlatform(email, password);
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={credentials.email}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="tu@email.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Contraseña</label>
                  <input
                    type="password"
                    name="password"
                    defaultValue={credentials.password}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" id="saveCredentials" defaultChecked className="rounded" />
                  <label htmlFor="saveCredentials">Guardar credenciales</label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLoginModal(false)}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className={`flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium ${
                      isConnecting ? 'opacity-50' : ''
                    }`}
                  >
                    {isConnecting ? '⏳ Conectando...' : '🔌 Conectar'}
                  </button>
                </div>
              </div>
            </form>
            <p className="text-xs text-gray-500 mt-4 text-center">
              Tus credenciales se guardan localmente en tu navegador
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
