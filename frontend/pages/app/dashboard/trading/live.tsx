import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getPublicApiBaseUrl } from '@/services/api';
import {
  loadPersistedLiveConfig,
  savePersistedLiveConfig,
  resolveMarketType,
  marketTypeLabel,
  marketTypeBadge,
  marketTypeIcon,
  type IqMarketType,
  type MarketTypeCategory,
} from '@/types/liveTrading';
import { getStrategiesForPlatform } from '@/types/strategies';
import {
  OpenPositionsTerminal,
  type BrokerOpenPosition,
} from '@/components/dashboard/live/OpenPositionsTerminal';
import { IqQuantumTerminalShell, type IqQuantumNavId } from '@/components/dashboard/live/IqQuantumTerminalShell';
import { Inter, JetBrains_Mono } from 'next/font/google';

const qtInter = Inter({ subsets: ['latin'], variable: '--font-qt-inter' });
const qtMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-qt-mono' });

const BASE_URL = getPublicApiBaseUrl();

function mapBrokerAccountType(raw?: string | null): 'DEMO' | 'REAL' {
  const u = String(raw || '').toUpperCase();
  if (u === 'REAL') return 'REAL';
  return 'DEMO';
}

function strategyLabel(id: string): string {
  const s = getStrategiesForPlatform('iqoption').find((x) => x.id === id);
  return s?.name ?? id;
}

function iqMarketDescription(mt: IqMarketType): { label: string; hint: string } {
  if (mt === 'binary') {
    return {
      label: 'Binarias',
      hint: 'Instrumentos sin sufijo -OTC (p. ej. EURUSD). Distintos de los pares OTC de IQ Option.',
    };
  }
  return {
    label: 'OTC',
    hint: 'Pares con sufijo -OTC (p. ej. EURUSD-OTC) en IQ Option.',
  };
}

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
  marketType?: MarketTypeCategory;
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
  iqMarketType: IqMarketType;
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

const TIMEFRAMES = [
  { value: '1m', label: '1 Min' },
  { value: '5m', label: '5 Min' },
  { value: '15m', label: '15 Min' },
  { value: '1h', label: '1 Hora' },
];

/** Respuesta real del broker: éxito HTTP, status success, id de orden y no simulación. */
function isLiveBrokerOrderSuccess(data: any, responseOk: boolean): boolean {
  if (!responseOk || data?.status !== 'success') return false;
  if (data?.mode === 'simulation' || data?.mode === 'simulation_blocked') return false;
  const brokerId = data?.order_id ?? data?.order?.id;
  if (brokerId == null || brokerId === '') return false;
  const idStr = String(brokerId);
  if (idStr.startsWith('SIM-') || idStr.startsWith('SIM_')) return false;
  return true;
}

export default function TradingLiveProfessional() {
  const router = useRouter();
  const isIqHub = router.pathname.startsWith('/iqoption');
  const strategyCatalog = useMemo(() => getStrategiesForPlatform('iqoption'), []);

  const [lastBrokerCheck, setLastBrokerCheck] = useState<string | null>(null);

  const [config, setConfig] = useState<TradingConfig>({
    mode: 'manual',
    platform: 'iqoption',
    accountType: 'DEMO',
    iqMarketType: 'otc',
    symbols: ['EURUSD-OTC', 'GBPUSD-OTC'],
    strategies: ['ema_rsi'],
    timeframe: '5m',
    analysisInterval: 30,
    maxConcurrentTrades: 3,
    riskLevel: 'medium',
    tradeAmount: 1,
    expirationTime: 5,
  });
  
  const iqMarketSymbolMismatch = useMemo(() => {
    const hasOtc = (s: string) => s.toUpperCase().includes('-OTC');
    if (config.iqMarketType === 'otc' && config.symbols.length && !config.symbols.some(hasOtc)) {
      return 'Aviso: mercado configurado como OTC pero ningún par termina en -OTC. Añade pares -OTC o cambia a Binarias.';
    }
    if (config.iqMarketType === 'binary' && config.symbols.some(hasOtc)) {
      return 'Aviso: mercado Binarias pero hay símbolos -OTC en la lista. Para OTC elige el modo OTC arriba.';
    }
    return null;
  }, [config.iqMarketType, config.symbols]);

  const [robotState, setRobotState] = useState<RobotState>({
    status: 'inactive',
    currentAction: 'Sistema detenido',
    lastUpdate: new Date().toISOString(),
  });
  
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  /** Texto bajo el panel de señales cuando la lista está vacía tras un escaneo (no es un error). */
  const [lastSignalScanHint, setLastSignalScanHint] = useState<string | null>(null);
  const [brokerOpenPositions, setBrokerOpenPositions] = useState<BrokerOpenPosition[]>([]);
  const [brokerOpenExpectedTotal, setBrokerOpenExpectedTotal] = useState(0);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const activeTradesRef = useRef<Trade[]>([]);
  useEffect(() => {
    activeTradesRef.current = activeTrades;
  }, [activeTrades]);

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

  // Hub IQ Option: solo esta plataforma en UI y motor de escaneo
  useEffect(() => {
    if (!isIqHub) return;
    setConfig((prev) => (prev.platform === 'iqoption' ? prev : { ...prev, platform: 'iqoption' }));
  }, [isIqHub]);

  // Check platform connection
  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/status`);
      const data = await response.json();

      if (data.status === 'connected' || data.connected) {
        setIsConnected(true);
        const ai = data.account_info || {};
        const mapped = mapBrokerAccountType(ai.account_type ?? data.account_type);
        setAccountInfo((prev) => ({
          balance:
            typeof ai.balance === 'number'
              ? ai.balance
              : Number(ai.balance) || prev?.balance || 0,
          currency: ai.currency || prev?.currency || 'USD',
          accountType: mapped,
          email: ai.email ?? prev?.email,
          platform: isIqHub ? 'iqoption' : (String(data.platform || prev?.platform || 'iqoption') as 'iqoption' | 'mt5'),
        }));
        setConfig((prev) => ({
          ...prev,
          accountType: mapped,
          platform: isIqHub ? 'iqoption' : prev.platform,
        }));
        setLastBrokerCheck(new Date().toISOString());
        return true;
      }
    } catch (error) {
      console.error('Connection check failed:', error);
    }
    setIsConnected(false);
    setLastBrokerCheck(new Date().toISOString());
    return false;
  }, [isIqHub]);

  // Load saved credentials on mount
  useEffect(() => {
    const savedCreds = localStorage.getItem('iq_credentials');
    if (savedCreds) {
      try {
        const parsed = JSON.parse(savedCreds);
        setCredentials(parsed);
      } catch (e) {}
    }
    const persisted = loadPersistedLiveConfig();
    if (persisted) {
      const { serverMotor: _sm, ...rest } = persisted;
      const stratList =
        Array.isArray(persisted.strategies) && persisted.strategies.length
          ? persisted.strategies
          : typeof persisted.strategyId === 'string'
            ? [persisted.strategyId]
            : undefined;
      setConfig((prev) => ({
        ...prev,
        mode: rest.mode ?? prev.mode,
        platform: rest.platform ?? prev.platform,
        accountType: rest.accountType ?? prev.accountType,
        iqMarketType: rest.iqMarketType === 'binary' ? 'binary' : 'otc',
        symbols: rest.symbols?.length ? rest.symbols : prev.symbols,
        strategies: stratList ?? prev.strategies,
        timeframe: rest.timeframe ?? prev.timeframe,
        analysisInterval: rest.analysisInterval ?? prev.analysisInterval,
        maxConcurrentTrades: rest.maxConcurrentTrades ?? prev.maxConcurrentTrades,
        riskLevel: rest.riskLevel ?? prev.riskLevel,
        tradeAmount: rest.tradeAmount ?? prev.tradeAmount,
        expirationTime: rest.expirationTime ?? prev.expirationTime,
      }));
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
          const mapped = mapBrokerAccountType(data.accountInfo.account_type);
          setAccountInfo({
            balance: data.accountInfo.balance || 0,
            currency: data.accountInfo.currency || 'USD',
            accountType: mapped,
            email: data.accountInfo.email,
            platform: isIqHub ? 'iqoption' : config.platform,
          });
          setConfig((prev) => ({ ...prev, accountType: mapped, platform: isIqHub ? 'iqoption' : prev.platform }));
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
  }, [config.platform, config.accountType, credentials, addLog, updateRobotState, isIqHub]);

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
        const platformTrades = historyData.trades.map((t: Record<string, unknown>, idx: number) => {
          const sym = String(t.symbol || t.active || 'UNK');
          const oid = t.order_id ?? t.id;
          const baseId =
            oid != null && String(oid).trim() !== ''
              ? String(oid)
              : `hist-${idx}-${sym}-${String(t.open_time || t.created_at || idx)}`;
          return {
            id: baseId,
            symbol: sym,
            direction: (t.direction as string) || (t.type === 'call' ? 'call' : 'put'),
            amount: Number(t.amount) || 0,
            entryPrice: Number(t.open_price || t.entry_price) || 0,
            exitPrice: t.close_price != null ? Number(t.close_price) : undefined,
            result: t.win ? 'win' : 'loss',
            pnl: Number(t.profit || t.pnl) || 0,
            strategy: String(t.strategy || 'sync'),
            openTime: String(t.open_time || t.created_at || ''),
            closeTime: t.close_time != null ? String(t.close_time) : undefined,
            explanation: String(t.explanation || ''),
            platform: config.platform,
            orderId: t.order_id,
          } as Trade;
        });

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

  const fetchBrokerOpenPositions = useCallback(async () => {
    if (!isConnected) {
      setBrokerOpenPositions([]);
      setBrokerOpenExpectedTotal(0);
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/trading/open-positions`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.code === 'BROKER_NOT_CONNECTED') {
        setBrokerOpenPositions([]);
        setBrokerOpenExpectedTotal(0);
        return;
      }
      if (data.status === 'success' && Array.isArray(data.positions)) {
        setBrokerOpenPositions(data.positions as BrokerOpenPosition[]);
        setBrokerOpenExpectedTotal(
          typeof data.total_expected_profit === 'number' ? data.total_expected_profit : 0
        );
      }
    } catch {
      /* ignore poll errors */
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isIqHub || !isConnected) {
      setBrokerOpenPositions([]);
      setBrokerOpenExpectedTotal(0);
      return;
    }
    void fetchBrokerOpenPositions();
    const id = setInterval(() => void fetchBrokerOpenPositions(), 5000);
    return () => clearInterval(id);
  }, [isIqHub, isConnected, fetchBrokerOpenPositions]);

  // Analyze market (POST /api/live/scan — alineado con backend: symbols + strategies[])
  const analyzeMarket = useCallback(async () => {
    if (!isRunning) return;

    const brokerOk = await checkConnection();
    if (!brokerOk) {
      addLog('Escaneo omitido: sin conexión al bróker (revisa Conectar en el panel)', 'warning');
      updateRobotState('waiting', 'Sin conexión al bróker');
      setLastSignalScanHint('Sin conexión al bróker: no se ejecutó el escaneo. Conecta y pulsa Iniciar de nuevo.');
      return;
    }

    updateRobotState('analyzing', 'Analizando mercado...');

    const persisted = loadPersistedLiveConfig();
    const overrides =
      persisted?.strategyParamOverrides && typeof persisted.strategyParamOverrides === 'object'
        ? persisted.strategyParamOverrides
        : {};
    const strategies =
      config.strategies.length > 0 ? config.strategies : ['ema_rsi'];
    const allowed = new Set(strategies);

    try {
      const response = await fetch(`${BASE_URL}/api/live/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: config.symbols,
          strategies,
          timeframe: config.timeframe,
          platform: isIqHub ? 'iqoption' : config.platform,
          iq_market_type: config.iqMarketType,
          strategy_param_overrides: overrides,
        }),
      });

      const data = await response.json();

      if (data.status !== 'success') {
        addLog(`Escaneo: ${data.message || 'respuesta inválida'}`, 'warning');
        updateRobotState('waiting', 'Sin datos de escaneo');
        setLastSignalScanHint('El servidor no devolvió un escaneo válido (status distinto de success). Revisa logs del backend.');
        return;
      }

      const rawList: unknown[] = Array.isArray(data.signals) ? data.signals : [];
      const newSignals: Signal[] = [];

      for (let i = 0; i < rawList.length; i++) {
        const row = rawList[i];
        const s = row as Record<string, unknown>;
        const strat = String(s.strategy || strategies[0]);
        if (!allowed.has(strat)) continue;
        const dir = String(s.direction || '').toLowerCase();
        if (dir !== 'call' && dir !== 'put') continue;
        const conf = Number(s.confidence);
        if (!Number.isFinite(conf) || conf < 50) continue;
        const reasonsRaw = s.reasons;
        const reasons = Array.isArray(reasonsRaw)
          ? reasonsRaw.map((r) => (typeof r === 'string' ? r : String(r)))
          : [];
        const indicatorsRaw = s.indicators;
        const indicators: Record<string, number> = {};
        if (indicatorsRaw && typeof indicatorsRaw === 'object') {
          for (const [k, v] of Object.entries(indicatorsRaw as Record<string, unknown>)) {
            const n = Number(v);
            if (Number.isFinite(n)) indicators[k] = n;
          }
        }
        const isOtc = String(s.symbol).toUpperCase().includes('-OTC') || String(s.symbol).toUpperCase().includes(' OTC');
        const sigMarketType: MarketTypeCategory = resolveMarketType(
          String(s.symbol),
          String(s.instrument_type || s.instrumentType || ''),
          isOtc
        );
        newSignals.push({
          id: String(s.id || `SIG-${i}-${s.symbol}-${strat}-${String(s.timestamp || '')}`),
          symbol: String(s.symbol),
          direction: dir as 'call' | 'put',
          confidence: Math.round(conf),
          strategy: strat,
          reasons: reasons.length ? reasons : ['Señal del motor'],
          timestamp: String(s.timestamp || new Date().toISOString()),
          indicators,
          marketType: sigMarketType,
        });
      }

      if (newSignals.length > 0) {
        setLastSignalScanHint(null);
        setSignals((prev) => [...newSignals, ...prev].slice(0, 40));
        newSignals.forEach((sig) =>
          addLog(`Señal [${strategyLabel(sig.strategy)}]: ${sig.symbol} ${sig.direction.toUpperCase()} (${sig.confidence}%)`, 'success')
        );

        if (config.mode === 'automatic' && activeTradesRef.current.length < config.maxConcurrentTrades) {
          const bestSignal = newSignals.reduce((best, curr) =>
            curr.confidence > best.confidence ? curr : best
          );

          if (bestSignal.confidence >= 50) {
            try {
              addLog(
                `Auto-ejecutando [${strategyLabel(bestSignal.strategy)}]: ${bestSignal.symbol} ${bestSignal.direction.toUpperCase()} $${config.tradeAmount}`,
                'info'
              );
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
              const orderData = await orderResponse.json().catch(() => ({}));
              if (isLiveBrokerOrderSuccess(orderData, orderResponse.ok)) {
                const oid = orderData.order_id ?? orderData.order?.id;
                const trade: Trade = {
                  id: String(oid),
                  symbol: bestSignal.symbol,
                  direction: bestSignal.direction,
                  amount: config.tradeAmount,
                  entryPrice: (orderData.order?.entry_price ?? orderData.entry_price) || 0,
                  result: 'pending',
                  pnl: 0,
                  strategy: bestSignal.strategy,
                  openTime: new Date().toISOString(),
                  explanation: bestSignal.reasons.join(' | '),
                  platform: isIqHub ? 'iqoption' : config.platform,
                  orderId: oid,
                };
                setActiveTrades((prev) => [...prev, trade]);
                addLog(`✅ Operación abierta en broker: ${trade.id}`, 'success');
              } else {
                const detail =
                  (orderData && (orderData.message || orderData.code)) ||
                  (orderResponse.status === 503 ? 'Bróker no conectado (503)' : `HTTP ${orderResponse.status}`);
                addLog(`Auto-ejecución cancelada: ${detail}`, 'error');
              }
            } catch (execError: unknown) {
              addLog(`Error auto-ejecutando: ${execError instanceof Error ? execError.message : 'error'}`, 'error');
            }
          }
        }
      } else {
        const rawCount = rawList.length;
        const symPreview =
          config.symbols.length > 0 ? config.symbols.slice(0, 6).join(', ') : '(ningún par seleccionado)';
        const symExtra = config.symbols.length > 6 ? ` (+${config.symbols.length - 6} más)` : '';
        const iq = iqMarketDescription(config.iqMarketType);
        if (rawCount === 0) {
          setLastSignalScanHint(
            `Último ciclo: 0 señales · mercado ${iq.label} · pares: ${symPreview}${symExtra} · TF ${config.timeframe}. ` +
              'Si el robot está en marcha, es habitual: las estrategias no ven entrada ≥50% en este momento o faltan datos de velas para esos activos.'
          );
        } else {
          setLastSignalScanHint(
            `Último ciclo: el servidor envió ${rawCount} señal(es) pero ninguna se muestra aquí (filtro: solo las estrategias marcadas en configuración y dirección call/put válida). Revisa la selección múltiple de estrategias.`
          );
        }
        addLog(
          `Escaneo OK · ${data.signals_found ?? 0} señal(es) ≥50% · estrategias: ${strategies.join(', ')}`,
          'info'
        );
      }

      updateRobotState(
        'waiting',
        newSignals.length > 0 ? `${newSignals.length} señal(es) nuevas` : 'Esperando siguiente ciclo...'
      );
    } catch (error) {
      addLog('Error en escaneo /api/live/scan', 'warning');
      updateRobotState('waiting', 'Error de red en escaneo');
      setLastSignalScanHint('No se pudo contactar /api/live/scan (red o servidor apagado).');
    }
  }, [isRunning, checkConnection, config, addLog, updateRobotState, isIqHub]);

  // Execute real trade
  const executeRealTrade = useCallback(async (signal: Signal) => {
    const brokerOk = await checkConnection();
    if (!brokerOk) {
      addLog('No hay conexión con la plataforma (pulsa Conectar o Iniciar)', 'error');
      return;
    }

    if (activeTradesRef.current.length >= config.maxConcurrentTrades) {
      addLog('Máximo de operaciones alcanzado', 'warning');
      return;
    }
    
    updateRobotState('executing', `Ejecutando ${signal.direction.toUpperCase()} en ${signal.symbol}`);
    addLog(
      `Ejecutando [${strategyLabel(signal.strategy)}]: ${signal.symbol} ${signal.direction.toUpperCase()} $${config.tradeAmount}`,
      'info'
    );
    
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
      
      if (isLiveBrokerOrderSuccess(data, response.ok)) {
        const oid = data.order_id ?? data.order?.id;
        const trade: Trade = {
          id: String(oid),
          symbol: signal.symbol,
          direction: signal.direction,
          amount: config.tradeAmount,
          entryPrice: (data.order?.entry_price ?? data.entry_price) || 0,
          result: 'pending',
          pnl: 0,
          strategy: signal.strategy,
          openTime: new Date().toISOString(),
          explanation: signal.reasons.join(' | '),
          platform: config.platform,
          orderId: oid,
        };
        
        setActiveTrades(prev => [...prev, trade]);
        addLog(`Operación abierta en broker: ${trade.id}`, 'success');
        
        if (accountInfo) {
          setAccountInfo(prev => prev ? { ...prev, balance: prev.balance - config.tradeAmount } : null);
        }
      } else {
        throw new Error(data.message || data.code || 'La orden no se ejecutó en el broker (revisa conexión IQ Option)');
      }
    } catch (error: any) {
      addLog(`Error ejecutando orden: ${error.message}`, 'error');
    }
  }, [checkConnection, config, accountInfo, addLog, updateRobotState]);

  // Check active trades results
  const checkTradeResults = useCallback(async () => {
    if (activeTrades.length === 0) return;
    
    for (const trade of activeTrades) {
      try {
        const response = await fetch(`${BASE_URL}/api/trading/order/${trade.orderId || trade.id}`);
        const data = await response.json();
        
        if (data.status === 'closed' && (data.result === 'win' || data.result === 'loss')) {
          const pnlRaw = data.profit;
          const pnl = typeof pnlRaw === 'number' && Number.isFinite(pnlRaw)
            ? pnlRaw
            : parseFloat(String(pnlRaw));
          if (!Number.isFinite(pnl)) {
            continue;
          }
          const isWin = data.result === 'win';
          
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
      let brokerOk = await checkConnection();
      if (!brokerOk) {
        brokerOk = await connectToPlatform();
        if (!brokerOk) {
          addLog('No se pudo conectar al bróker. Revisa credenciales o conecta desde el encabezado.', 'error');
          return;
        }
      }

      setIsRunning(true);
      updateRobotState('analyzing', 'Iniciando...');
      setLastSignalScanHint(null);
      const stratLine = config.strategies.map((id) => strategyLabel(id)).join(', ');
      addLog(
        `Robot iniciado · ${config.mode === 'automatic' ? 'Automático' : 'Manual'} · ${accountInfo?.accountType ?? config.accountType} · Estrategias: ${stratLine}`,
        'success'
      );
      
      // Start analysis interval
      setTimeout(analyzeMarket, 1000);
      intervalRef.current = setInterval(analyzeMarket, config.analysisInterval * 1000);
      
      // Start trade result checking
      syncIntervalRef.current = setInterval(() => {
        checkTradeResults();
        syncWithPlatform();
        void fetchBrokerOpenPositions();
      }, 5000);
    }
  }, [
    isRunning,
    config,
    accountInfo,
    addLog,
    updateRobotState,
    connectToPlatform,
    analyzeMarket,
    checkTradeResults,
    syncWithPlatform,
    checkConnection,
    fetchBrokerOpenPositions,
  ]);

  // Initial connection check (más frecuente en hub IQ para reflejar estado real)
  useEffect(() => {
    void checkConnection();
    const ms = isIqHub ? 10000 : 30000;
    const interval = setInterval(() => void checkConnection(), ms);
    return () => clearInterval(interval);
  }, [checkConnection, isIqHub]);

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

  const liveAccountType = accountInfo?.accountType ?? config.accountType;

  // Robot Status Indicator (conexión real al bróker + estado del ciclo de análisis)
  const RobotIndicator = ({ surface = 'dark' }: { surface?: 'dark' | 'light' }) => {
    const displayStatus: 'offline' | 'idle' | RobotState['status'] = !isConnected
      ? 'offline'
      : !isRunning && robotState.status === 'inactive'
        ? 'idle'
        : robotState.status;

    const statusConfig: Record<
      typeof displayStatus,
      { ring: string; color: string; label: string; icon: string; sub: string }
    > = {
      offline: {
        ring: 'ring-2 ring-red-500/80',
        color: 'bg-red-950',
        label: 'Sin conexión al bróker',
        icon: '📡',
        sub: 'Pulsa Conectar o usa el botón del encabezado IQ Option',
      },
      idle: {
        ring: 'ring-2 ring-cyan-500/60',
        color: 'bg-slate-700',
        label: 'Conectado · análisis en pausa',
        icon: '⏸️',
        sub: 'Bróker en línea. Inicia el robot para generar señales.',
      },
      inactive: {
        ring: 'ring-2 ring-slate-600',
        color: 'bg-slate-600',
        label: 'Ciclo detenido',
        icon: '⏹️',
        sub: robotState.currentAction,
      },
      analyzing: {
        ring: 'ring-2 ring-blue-400',
        color: 'bg-blue-600',
        label: 'Analizando mercado',
        icon: '🔍',
        sub: robotState.currentAction,
      },
      executing: {
        ring: 'ring-2 ring-emerald-400',
        color: 'bg-emerald-600',
        label: 'Ejecutando orden',
        icon: '⚡',
        sub: robotState.currentAction,
      },
      waiting: {
        ring: 'ring-2 ring-amber-400/80',
        color: 'bg-amber-600',
        label: 'Entre ciclos',
        icon: '⏳',
        sub: robotState.currentAction,
      },
      error: {
        ring: 'ring-2 ring-red-400',
        color: 'bg-red-700',
        label: 'Error',
        icon: '❌',
        sub: robotState.currentAction,
      },
      syncing: {
        ring: 'ring-2 ring-violet-400',
        color: 'bg-violet-700',
        label: 'Sincronizando',
        icon: '🔄',
        sub: robotState.currentAction,
      },
    };

    const current = statusConfig[displayStatus];
    const pulse = isRunning && displayStatus !== 'offline' && displayStatus !== 'idle';

    const isLight = surface === 'light';

    return (
      <div
        className={
          isLight
            ? 'rounded-2xl border border-[#c5ced9] bg-[#f0f4f8] p-4 shadow-sm'
            : 'rounded-2xl border-2 border-gray-600 bg-gray-800/90 p-5 shadow-lg'
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full text-4xl shadow-inner ${current.color} ${current.ring} ${
                pulse ? 'animate-pulse' : ''
              }`}
            >
              {current.icon}
            </div>
            {isConnected && (
              <div
                className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-4 text-[10px] font-bold text-white ${
                  isLight ? 'border-[#f0f4f8] bg-[#6a9e82]' : 'border-gray-900 bg-emerald-500'
                }`}
              >
                OK
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${current.color}`}>{current.label}</span>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                  config.mode === 'automatic'
                    ? isLight
                      ? 'bg-[#9b86b0] text-white'
                      : 'bg-purple-700 text-white'
                    : isLight
                      ? 'bg-[#6d8aaf] text-white'
                      : 'bg-blue-800 text-white'
                }`}
              >
                {config.mode === 'automatic' ? 'MODO AUTO' : 'MODO MANUAL'}
              </span>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                  liveAccountType === 'REAL'
                    ? isLight
                      ? 'bg-[#c9a0a8] text-[#3d2a2e] ring-1 ring-[#d4b8bc]'
                      : 'bg-rose-700 text-white ring-1 ring-rose-300'
                    : isLight
                      ? 'bg-[#d9c9a3] text-[#3d3828] ring-1 ring-[#e5dcc4]'
                      : 'bg-amber-500/90 text-gray-900 ring-1 ring-amber-200'
                }`}
              >
                {liveAccountType === 'REAL' ? '💰 CUENTA REAL' : '🎮 CUENTA DEMO'}
              </span>
              <span
                className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isConnected
                    ? isLight
                      ? 'bg-[#dce8df] text-[#3d5a45]'
                      : 'bg-emerald-900/60 text-emerald-200'
                    : isLight
                      ? 'bg-[#eddcdc] text-[#6b3d3d]'
                      : 'bg-red-900/60 text-red-200'
                }`}
              >
                Bróker: {isConnected ? 'en línea' : 'desconectado'}
              </span>
            </div>
            <p className={isLight ? 'text-sm text-[#5a6b7d]' : 'text-sm text-gray-300'}>{current.sub}</p>
            <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${isLight ? 'text-[#6b7588]' : 'text-gray-500'}`}>
              <span>
                Estrategias activas:{' '}
                <span className={`font-medium ${isLight ? 'text-[#3a4453]' : 'text-gray-300'}`}>
                  {config.strategies.map((id) => strategyLabel(id)).join(', ')}
                </span>
              </span>
              <span>
                Símbolos: <span className={isLight ? 'text-[#3a4453]' : 'text-gray-300'}>{config.symbols.length}</span>
              </span>
              <span>
                Abiertas:{' '}
                <span className={isLight ? 'text-[#3a4453]' : 'text-gray-300'}>
                  {activeTrades.length}/{config.maxConcurrentTrades}
                </span>
              </span>
              {lastBrokerCheck && (
                <span className={isLight ? 'text-[#8a93a3]' : 'text-gray-600'}>
                  Última comprobación API: {new Date(lastBrokerCheck).toLocaleTimeString('es-ES')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const loginModalEl = showLoginModal ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 p-6">
        <h2 className="mb-4 text-xl font-bold">🔐 Conectar a {config.platform.toUpperCase()}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const email = (form.elements.namedItem('email') as HTMLInputElement).value;
            const password = (form.elements.namedItem('password') as HTMLInputElement).value;
            connectToPlatform(email, password);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">Email</label>
              <input
                type="email"
                name="email"
                defaultValue={credentials.email}
                className="w-full rounded-lg bg-gray-700 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tu@email.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Contraseña</label>
              <input
                type="password"
                name="password"
                defaultValue={credentials.password}
                className="w-full rounded-lg bg-gray-700 px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex-1 rounded-lg bg-gray-700 py-2 hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isConnecting}
                className={`flex-1 rounded-lg bg-green-600 py-2 font-medium hover:bg-green-700 ${
                  isConnecting ? 'opacity-50' : ''
                }`}
              >
                {isConnecting ? '⏳ Conectando...' : '🔌 Conectar'}
              </button>
            </div>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-gray-500">Tus credenciales se guardan localmente en tu navegador</p>
      </div>
    </div>
  ) : null;

  if (isIqHub) {
    const equityStr = accountInfo
      ? `${accountInfo.balance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${accountInfo.currency || 'USD'}`
      : '—';
    const fmtEsMoney = (n: number) =>
      n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pnlDayStr = `${stats.todayPnL >= 0 ? '+' : '-'}${fmtEsMoney(Math.abs(stats.todayPnL))} US$`;
    const kpiCards = [
      { label: 'Operaciones', value: String(stats.totalTrades), accent: 'neutral' as const },
      { label: 'Acierto %', value: `${stats.winRate.toFixed(0)}%`, accent: 'secondary' as const },
      { label: 'Ganadas', value: String(stats.wins), accent: 'neutral' as const },
      { label: 'Perdidas', value: String(stats.losses), accent: 'neutral' as const },
      {
        label: 'P&L total',
        value: `${stats.totalPnL >= 0 ? '+' : '-'}${fmtEsMoney(Math.abs(stats.totalPnL))} US$`,
        accent: stats.totalPnL >= 0 ? ('secondary' as const) : ('error' as const),
      },
      {
        label: 'Neto hoy',
        value: pnlDayStr,
        accent: stats.todayPnL >= 0 ? ('secondary' as const) : ('error' as const),
      },
    ];
    const signalsLite = signals.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      direction: s.direction,
      confidence: s.confidence,
      marketType: s.marketType,
    }));

    const onQuantumNav = (id: IqQuantumNavId) => {
      void router.replace({ pathname: '/iqoption/dashboard', query: { tab: id } }, undefined, { shallow: true });
    };

    return (
      <>
        <div className={`${qtInter.variable} ${qtMono.variable} flex h-full min-h-0 flex-col`}>
          <IqQuantumTerminalShell
            className="min-h-0 flex-1"
            fontVars={`${qtInter.variable} ${qtMono.variable}`}
            headerModeSlot={
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[#7a8699]">Modo</span>
                <div className="flex rounded-md border border-[#c5ced9] bg-[#f4f6f9] p-0.5">
                  <button
                    type="button"
                    disabled={isRunning}
                    title={isRunning ? 'Detén el motor para cambiar el modo' : 'Operación solo con confirmación'}
                    onClick={() => setConfig((p) => ({ ...p, mode: 'manual' }))}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                      config.mode === 'manual'
                        ? 'bg-[#7a9ab8] text-white shadow-sm'
                        : 'text-[#5a6b7d] hover:bg-white/70'
                    } ${isRunning ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    title={isRunning ? 'Detén el motor para cambiar el modo' : 'El robot ejecuta señales automáticamente'}
                    onClick={() => setConfig((p) => ({ ...p, mode: 'automatic' }))}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                      config.mode === 'automatic'
                        ? 'bg-[#9b86b0] text-white shadow-sm'
                        : 'text-[#5a6b7d] hover:bg-white/70'
                    } ${isRunning ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Automático
                  </button>
                </div>
              </div>
            }
            isConnected={isConnected}
            isRunning={isRunning}
            equity={equityStr}
            pnlDay={pnlDayStr}
            pnlDayPositive={stats.todayPnL >= 0}
            kpiCards={kpiCards}
            openPositionsSlot={
              <OpenPositionsTerminal
                variant="quantum"
                positions={brokerOpenPositions}
                totalExpectedProfit={brokerOpenExpectedTotal}
                baseUrl={BASE_URL}
                isConnected={isConnected}
                onLog={(msg, type) => addLog(msg, type)}
                onAfterSell={() => void fetchBrokerOpenPositions()}
              />
            }
            workspaceSlot={
              <div className="min-h-0 space-y-3 overflow-y-auto pr-1 text-[#3a4453]">
                <p className="text-[10px] leading-snug text-[#6b7588]">
                  Elige <strong className="text-[#4a5568]">Manual</strong> o <strong className="text-[#4a5568]">Automático</strong> arriba;
                  luego conecta (si hace falta) y pulsa <strong className="text-[#4a5568]">Iniciar</strong>.
                  En <strong className="text-[#4a5568]">manual</strong>, cuando haya señales usa el botón{' '}
                  <strong className="text-[#4a5568]">Operar en broker</strong> en la columna Señales; en automático el robot
                  envía órdenes si la confianza es suficiente.
                </p>
                <div className="rounded-lg border border-[#c5ced9] bg-[#f6f8fb] p-2">
                  <RobotIndicator surface="light" />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {!isConnected && (
                    <button
                      type="button"
                      onClick={() => connectToPlatform()}
                      className="rounded-lg bg-[#6d8aaf] py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#5d7a9a]"
                    >
                      🔌 Conectar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleRobot()}
                    disabled={isConnecting}
                    className={`rounded-lg py-2 text-sm font-bold text-white shadow-sm transition ${
                      isRunning ? 'bg-[#c27b7b] hover:bg-[#b06a6a]' : 'bg-[#6a9e82] hover:bg-[#5d8a6f]'
                    } ${isConnecting ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {isRunning ? '⏹️ Detener' : '▶️ Iniciar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfig((v) => !v)}
                    className="rounded-lg border border-[#c5ced9] bg-[#eef2f6] py-2 text-sm font-medium text-[#4a5568] transition hover:bg-[#e4e9ef]"
                  >
                    ⚙️ Configuración
                  </button>
                </div>
                {showConfig && (
                  <p className="text-[11px] text-[#8a6d3d]">
                    El panel completo de configuración está en la cuadrícula clásica; aquí usa los selectores del
                    terminal lateral o abre Configuración en el menú IQ.
                  </p>
                )}
                <div className="rounded-lg border border-[#c5ced9] bg-[#f6f8fb]">
                  <div className="border-b border-[#c5ced9] px-2 py-1 text-[10px] font-bold text-[#6b7588]">
                    Historial reciente
                  </div>
                  <div className="max-h-40 overflow-y-auto text-[10px]">
                    {trades.length === 0 ? (
                      <p className="p-2 text-[#8a93a3]">Sin cerradas</p>
                    ) : (
                      <table className="w-full">
                        <tbody>
                          {trades.slice(0, 12).map((t, idx) => (
                            <tr key={`${t.id}-q-${idx}`} className="border-t border-[#dce2ea]">
                              <td className="px-2 py-1 text-[#6b7588]">{t.symbol}</td>
                              <td className="px-2 py-1 font-medium">
                                {t.direction === 'call' ? 'SUBE' : 'BAJA'}
                              </td>
                              <td className="px-2 py-1 text-right text-[#3a4453]">{t.pnl?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            }
            signals={signalsLite}
            onSignalExecute={(id) => {
              const s = signals.find((x) => x.id === id);
              if (s) void executeRealTrade(s);
            }}
            showSignalExecute={config.mode === 'manual' && isConnected && !isConnecting}
            logLines={logs}
            marketSymbols={config.symbols}
            activeNav="live"
            onNav={onQuantumNav}
            onStopEngine={() => {
              if (isRunning) void toggleRobot();
            }}
            onReset={() => setLogs([])}
          />
        </div>
        {loginModalEl}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">📊 Trading Live Profesional</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                liveAccountType === 'REAL'
                  ? 'bg-rose-700 text-white ring-1 ring-rose-300'
                  : 'bg-amber-500/90 text-gray-900 ring-1 ring-amber-200'
              }`}
            >
              {liveAccountType === 'REAL' ? '💰 CUENTA REAL' : '🎮 CUENTA DEMO'}
            </span>
            {platformSync.status === 'synced' && (
              <span className="px-2 py-1 bg-green-600/30 text-green-400 rounded text-xs">
                🔄 Sincronizado
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                router.push(
                  router.pathname.startsWith('/iqoption')
                    ? '/iqoption/dashboard?tab=config'
                    : '/app/dashboard/configuration'
                )
              }
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium"
            >
              ← Configuración
            </button>
            <button
              onClick={() =>
                router.push(
                  router.pathname.startsWith('/iqoption')
                    ? '/iqoption/dashboard?tab=backtest'
                    : '/app/dashboard/backtesting'
                )
              }
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium"
            >
              Backtesting
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        {/* Panel ampliado: solo IQ Option en el hub /iqoption */}
        {isIqHub && (
          <section
            className={`mb-6 rounded-2xl border-2 p-6 shadow-xl transition-colors ${
              isConnected
                ? liveAccountType === 'REAL'
                  ? 'border-rose-700/70 bg-gradient-to-br from-gray-900 via-rose-950/30 to-gray-900'
                  : 'border-emerald-700/50 bg-gradient-to-br from-gray-900 via-emerald-950/25 to-gray-900'
                : 'border-amber-700/50 bg-gradient-to-br from-gray-900 via-amber-950/20 to-gray-900'
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Plataforma activa</h2>
                <p className="text-sm text-gray-400">Solo se muestra la sesión conectada en este servidor.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-gray-600">
                  IQ Option
                </span>
                <span
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                    isConnected ? 'bg-emerald-900/80 text-emerald-200 ring-1 ring-emerald-600' : 'bg-red-900/80 text-red-100 ring-1 ring-red-600'
                  }`}
                >
                  {isConnected ? '● Conectado al bróker' : '○ Sin conexión al bróker'}
                </span>
                <span
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    liveAccountType === 'REAL'
                      ? 'bg-rose-800 text-rose-100 ring-1 ring-rose-500'
                      : 'bg-amber-500/90 text-gray-900 ring-1 ring-amber-300'
                  }`}
                >
                  {liveAccountType === 'REAL' ? 'Cuenta REAL' : 'Cuenta DEMO'}
                </span>
                <span className="rounded-lg bg-gray-800 px-2 py-1 text-[10px] text-gray-300 ring-1 ring-gray-600">
                  Mercado IQ:{' '}
                  <span className="font-bold text-amber-200/95">{iqMarketDescription(config.iqMarketType).label}</span>
                </span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-black/30 p-4 ring-1 ring-gray-700">
                <p className="text-xs uppercase tracking-wide text-gray-500">Balance</p>
                <p className="mt-1 text-2xl font-bold text-green-400">
                  {accountInfo
                    ? `${accountInfo.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${accountInfo.currency || 'USD'}`
                    : isConnected
                      ? '—'
                      : '—'}
                </p>
                {!isConnected && <p className="mt-1 text-xs text-amber-300/90">Conecta para ver saldo en vivo.</p>}
              </div>
              <div className="rounded-xl bg-black/30 p-4 ring-1 ring-gray-700">
                <p className="text-xs uppercase tracking-wide text-gray-500">Sesión</p>
                <p className="mt-1 truncate text-sm text-gray-200">{accountInfo?.email || '—'}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Tipo según API: <span className="font-semibold text-gray-300">{liveAccountType}</span>
                </p>
              </div>
              <div className="rounded-xl bg-black/30 p-4 ring-1 ring-gray-700">
                <p className="text-xs uppercase tracking-wide text-gray-500">Sincronización</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    platformSync.status === 'synced' ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {platformSync.status === 'synced' ? 'Historial alineado' : 'Pendiente / en curso'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Última sync:{' '}
                  {platformSync.lastSync ? new Date(platformSync.lastSync).toLocaleString() : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-black/30 p-4 ring-1 ring-gray-700">
                <p className="text-xs uppercase tracking-wide text-gray-500">API estado</p>
                <p className="mt-1 text-sm text-gray-200">
                  {lastBrokerCheck ? new Date(lastBrokerCheck).toLocaleTimeString() : 'Sin datos aún'}
                </p>
                <p className="mt-1 text-xs text-gray-500">Consulta /api/trading/status cada 10 s en esta vista.</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              MetaTrader 5 u otras plataformas no se listan aquí: esta URL es exclusiva del hub IQ Option.
            </p>
          </section>
        )}

        {/* Barra compacta en rutas generales (no hub IQ) */}
        {accountInfo && !isIqHub && (
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

        {isIqHub && accountInfo && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={syncWithPlatform}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              🔄 Sincronizar con IQ Option
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            <RobotIndicator />
            
            {/* Plataforma: en hub IQ solo IQ Option; en app general IQ + MT5 */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="font-bold mb-3">🔌 Plataforma</h3>
              <div className="space-y-3">
                {isIqHub ? (
                  <div className="rounded-lg border border-gray-600 bg-gray-900/60 p-4">
                    <p className="text-sm text-gray-200">
                      Vista dedicada a <strong className="text-white">IQ Option</strong>. No se ofrece MetaTrader 5
                      ni otras plataformas en esta pantalla.
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      El tipo de cuenta (demo/real) se toma de la respuesta del bróker al verificar conexión.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfig((prev) => ({ ...prev, platform: 'iqoption' }))}
                      disabled={isRunning}
                      className={`p-2 rounded-lg text-center text-sm font-medium ${
                        config.platform === 'iqoption' ? 'bg-green-600' : 'bg-gray-700'
                      } ${isRunning ? 'opacity-50' : ''}`}
                    >
                      IQ Option
                    </button>
                    <button
                      onClick={() => setConfig((prev) => ({ ...prev, platform: 'mt5' }))}
                      disabled={isRunning}
                      className={`p-2 rounded-lg text-center text-sm font-medium ${
                        config.platform === 'mt5' ? 'bg-blue-600' : 'bg-gray-700'
                      } ${isRunning ? 'opacity-50' : ''}`}
                    >
                      MetaTrader 5
                    </button>
                  </div>
                )}

                {isIqHub && isConnected ? (
                  <div className="rounded-lg border border-gray-600 bg-gray-900/40 p-3 text-center text-sm text-gray-300">
                    Cuenta en bróker:{' '}
                    <span
                      className={`font-bold ${
                        liveAccountType === 'REAL' ? 'text-rose-400' : 'text-amber-300'
                      }`}
                    >
                      {liveAccountType === 'REAL' ? 'REAL' : 'DEMO'}
                    </span>
                    <span className="block text-xs text-gray-500 mt-1">
                      Para cambiar de cuenta usa el botón Conectar del panel superior o reconecta en IQ Option.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfig((prev) => ({ ...prev, accountType: 'DEMO' }))}
                      disabled={isRunning}
                      className={`p-2 rounded-lg text-center text-sm font-medium ${
                        config.accountType === 'DEMO' ? 'bg-yellow-600' : 'bg-gray-700'
                      } ${isRunning ? 'opacity-50' : ''}`}
                    >
                      🎮 DEMO
                    </button>
                    <button
                      onClick={() => setConfig((prev) => ({ ...prev, accountType: 'REAL' }))}
                      disabled={isRunning}
                      className={`p-2 rounded-lg text-center text-sm font-medium ${
                        config.accountType === 'REAL' ? 'bg-red-600' : 'bg-gray-700'
                      } ${isRunning ? 'opacity-50' : ''}`}
                    >
                      💰 REAL
                    </button>
                  </div>
                )}
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
              <p className="text-xs text-gray-400 mb-2 rounded bg-gray-900/60 px-2 py-1.5 border border-gray-700/80">
                <span className="text-gray-500">Estrategias en escaneo: </span>
                {(config.strategies.length ? config.strategies : ['ema_rsi']).map((id) => strategyLabel(id)).join(', ')}
              </p>
              <p className="text-xs text-gray-400 mb-2 rounded bg-gray-900/60 px-2 py-1.5 border border-gray-700/80">
                <span className="text-gray-500">Mercado IQ: </span>
                <span className="font-semibold text-amber-200/90">{iqMarketDescription(config.iqMarketType).label}</span>
                <span className="text-gray-500"> — </span>
                <span className="text-gray-400">{iqMarketDescription(config.iqMarketType).hint}</span>
              </p>
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
                  disabled={isConnecting}
                  className={`w-full py-3 rounded-lg font-bold ${
                    isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                  } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            {/* Posiciones IQ: en hub se muestran solo en Quantum Terminal (arriba) */}
            {/* Config Panel */}
            {showConfig && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="font-bold mb-4">⚙️ Configuración</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {isIqHub && (
                    <div className="col-span-2 md:col-span-3">
                      <label className="text-xs text-gray-400">Mercado IQ Option (tipo de activo)</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, iqMarketType: 'otc' }))}
                          disabled={isRunning}
                          className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors ${
                            config.iqMarketType === 'otc'
                              ? 'bg-amber-700/90 text-white ring-amber-400'
                              : 'bg-gray-700 text-gray-300 ring-gray-600 hover:bg-gray-600'
                          } ${isRunning ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          📈 OTC (-OTC)
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, iqMarketType: 'binary' }))}
                          disabled={isRunning}
                          className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors ${
                            config.iqMarketType === 'binary'
                              ? 'bg-violet-700/90 text-white ring-violet-400'
                              : 'bg-gray-700 text-gray-300 ring-gray-600 hover:bg-gray-600'
                          } ${isRunning ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          📊 Binarias (sin -OTC)
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">{iqMarketDescription(config.iqMarketType).hint}</p>
                      {iqMarketSymbolMismatch && (
                        <p className="mt-1 text-[10px] font-medium text-amber-300">{iqMarketSymbolMismatch}</p>
                      )}
                    </div>
                  )}
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
                    <label className="text-xs text-gray-400">Estrategias (señales y escaneo)</label>
                    <select
                      multiple
                      value={config.strategies}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                        setConfig((prev) => ({
                          ...prev,
                          strategies: selected.length ? selected : prev.strategies,
                        }));
                      }}
                      className="h-28 w-full rounded bg-gray-700 p-2 text-sm"
                    >
                      {strategyCatalog.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-gray-500">Ctrl+clic para varias. El escaneo usa todas las seleccionadas.</p>
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
                            iq_market_type: config.iqMarketType,
                            symbols: config.symbols,
                            strategies: config.strategies,
                            strategy_id: config.strategies[0],
                            timeframe: config.timeframe,
                            analysis_interval: config.analysisInterval,
                            max_concurrent_trades: config.maxConcurrentTrades,
                            trade_amount: config.tradeAmount,
                            expiration_time: config.expirationTime,
                          }),
                        });
                        const data = await response.json();
                        const prev = loadPersistedLiveConfig();
                        savePersistedLiveConfig({
                          ...config,
                          strategies: config.strategies.length ? config.strategies : ['ema_rsi'],
                          strategyId: config.strategies[0] || 'ema_rsi',
                          serverMotor: prev?.serverMotor,
                          strategyParamOverrides: prev?.strategyParamOverrides,
                        });
                        addLog('✅ Configuración guardada', 'success');
                      } catch (error) {
                        const prev = loadPersistedLiveConfig();
                        savePersistedLiveConfig({
                          ...config,
                          strategies: config.strategies.length ? config.strategies : ['ema_rsi'],
                          strategyId: config.strategies[0] || 'ema_rsi',
                          serverMotor: prev?.serverMotor,
                          strategyParamOverrides: prev?.strategyParamOverrides,
                        });
                        addLog('⚠️ Config guardada localmente', 'warning');
                      }
                    }}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
                  >
                    💾 Guardar Configuración
                  </button>
                  <button
                    onClick={() => {
                      const loaded = loadPersistedLiveConfig();
                      if (!loaded) return;
                      const { serverMotor: _sm, strategyParamOverrides: _po, ...rest } = loaded;
                      const stratList =
                        Array.isArray(loaded.strategies) && loaded.strategies.length
                          ? loaded.strategies
                          : typeof loaded.strategyId === 'string'
                            ? [loaded.strategyId]
                            : ['ema_rsi'];
                      setConfig((prev) => ({
                        ...prev,
                        ...rest,
                        iqMarketType: loaded.iqMarketType === 'binary' ? 'binary' : 'otc',
                        strategies: stratList,
                      }));
                      addLog('📥 Configuración cargada', 'info');
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
              <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-700 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">📡 Señales en tiempo real</h3>
                  <p className="mt-1 text-[11px] text-gray-400">
                    <span className="text-gray-500">Mercado IQ: </span>
                    <span className="font-semibold text-amber-200/95">{iqMarketDescription(config.iqMarketType).label}</span>
                    <span className="text-gray-500"> — </span>
                    <span>{iqMarketDescription(config.iqMarketType).hint}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    <span className="text-gray-500">Pares en escaneo: </span>
                    <span className="break-words font-medium text-gray-200">
                      {config.symbols.length ? config.symbols.join(', ') : '—'}
                    </span>
                  </p>
                  {iqMarketSymbolMismatch && (
                    <p className="mt-1 text-[11px] font-medium text-amber-300">{iqMarketSymbolMismatch}</p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    <span className="text-gray-500">Estrategias (filtro): </span>
                    <span className="font-medium text-gray-200">
                      {config.strategies.map((id) => strategyLabel(id)).join(' · ')}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{signals.length} en lista</span>
              </div>
              <div className="max-h-72 overflow-y-auto p-4">
                {signals.length === 0 ? (
                  <div className="space-y-3 py-8 text-center text-gray-500">
                    <p className="text-sm">
                      {isRunning
                        ? 'Analizando con las estrategias seleccionadas…'
                        : 'Inicia el robot para escanear con las estrategias de arriba.'}
                    </p>
                    {lastSignalScanHint && (
                      <p className="mx-auto max-w-md text-left text-[11px] leading-relaxed text-gray-400">
                        {lastSignalScanHint}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {signals.slice(0, 15).map((sig) => (
                      <div
                        key={sig.id}
                        className={`rounded-lg border-l-4 p-3 ${
                          sig.direction === 'call'
                            ? 'border-green-500 bg-green-900/30'
                            : 'border-red-500 bg-red-900/30'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{sig.symbol}</span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold ${
                                sig.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                              }`}
                            >
                              {sig.direction.toUpperCase()}
                            </span>
                            {sig.marketType && (
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                                  sig.marketType === 'otc'
                                    ? 'border-amber-500 bg-amber-900/50 text-amber-300'
                                    : sig.marketType === 'mercado_normal'
                                      ? 'border-blue-500 bg-blue-900/50 text-blue-300'
                                      : 'border-emerald-500 bg-emerald-900/50 text-emerald-300'
                                }`}
                              >
                                {sig.marketType === 'otc'
                                  ? '📈 OTC'
                                  : sig.marketType === 'mercado_normal'
                                    ? '💹 Normal'
                                    : '📊 Binarias'}
                              </span>
                            )}
                            <span className="text-sm text-gray-400">{sig.confidence}%</span>
                            <span className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 ring-1 ring-gray-600">
                              {strategyLabel(sig.strategy)}
                            </span>
                          </div>
                          {config.mode === 'manual' && (
                            <button
                              onClick={() => executeRealTrade(sig)}
                              className={`rounded px-3 py-1 text-sm font-medium ${
                                sig.direction === 'call' ? 'bg-green-600' : 'bg-red-600'
                              }`}
                            >
                              Ejecutar
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{sig.reasons[0] || '—'}</p>
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
                  {activeTrades.map((t, idx) => (
                    <div key={`${t.id}-active-${idx}`} className="bg-gray-800 p-3 rounded-lg flex justify-between">
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
                      {trades.map((t, idx) => (
                        <tr key={`${t.id}-hist-${idx}-${t.openTime || ''}`} className="hover:bg-gray-700/50">
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
      
      {loginModalEl}
    </div>
  );
}
