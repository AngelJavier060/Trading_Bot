const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

const api = {
  login: async (credentials: { username: string; password: string; accountType: string }) => {
    const response = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Error al iniciar sesión");
    }
    return await response.json();
  },

  // Alias usado por la pantalla de configuración (TradingConfig)
  saveConfig: async (config: any) => {
    const response = await fetch(`${BASE_URL}/api/trading/save-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    const data = await response.json();

    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al guardar la configuración');
    }

    return data;
  },

  getLiveHistoryAdvanced: async (params?: {
    limit?: number;
    account_type?: string;
    symbol?: string;
    result?: string;
    platform?: string;
    strategy?: string;
    min_conf?: number;
    max_conf?: number;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.account_type) q.append('account_type', params.account_type);
    if (params?.symbol) q.append('symbol', params.symbol);
    if (params?.result) q.append('result', params.result);
    if (params?.platform) q.append('platform', params.platform);
    if (params?.strategy) q.append('strategy', params.strategy);
    if (typeof params?.min_conf === 'number') q.append('min_conf', String(params.min_conf));
    if (typeof params?.max_conf === 'number') q.append('max_conf', String(params.max_conf));
    if (params?.from) q.append('from', params.from);
    if (params?.to) q.append('to', params.to);
    const url = `${BASE_URL}/api/live/history/advanced${q.toString() ? '?' + q.toString() : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener historial avanzado');
    }
    return data;
  },

  buildLiveHistoryExportUrl: (params?: {
    limit?: number;
    account_type?: string;
    symbol?: string;
    result?: string;
    platform?: string;
    strategy?: string;
    min_conf?: number;
    max_conf?: number;
    from?: string;
    to?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.account_type) q.append('account_type', params.account_type);
    if (params?.symbol) q.append('symbol', params.symbol);
    if (params?.result) q.append('result', params.result);
    if (params?.platform) q.append('platform', params.platform);
    if (params?.strategy) q.append('strategy', params.strategy);
    if (typeof params?.min_conf === 'number') q.append('min_conf', String(params.min_conf));
    if (typeof params?.max_conf === 'number') q.append('max_conf', String(params.max_conf));
    if (params?.from) q.append('from', params.from);
    if (params?.to) q.append('to', params.to);
    return `${BASE_URL}/api/live/history/export${q.toString() ? '?' + q.toString() : ''}`;
  },

  buy: async (order: { [key: string]: any }) => {
    const asset = order.asset || order.activo;
    const amount = order.amount ?? order.cantidad;
    const direction = order.direction || order.direccion;
    const expiration = order.expiration ?? order.expiracion;

    const response = await fetch(`${BASE_URL}/api/trading/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        asset,
        amount,
        direction,
        expiration,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      throw new Error(data.message || "Error al ejecutar la orden");
    }

    return {
      ...data,
      resultado: data.message || data.status,
    };
  },

  getAccountInfo: async () => {
    const response = await fetch(`${BASE_URL}/api/trading/account-info`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || "Error al obtener la información de la cuenta");
    }
    return data.accountInfo || data;
  },

  getConfig: async () => {
    const response = await fetch(`${BASE_URL}/api/config/get-config`);
    if (!response.ok) {
      throw new Error("Error al obtener la configuración");
    }
    return await response.json();
  },

  saveUserConfig: async (config: any) => {
    const response = await fetch(`${BASE_URL}/api/config/save-user-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error("Error al guardar la configuración");
    }
    return await response.json();
  },

  execute: async (data: { trading_mode: string }) => {
    const response = await fetch(`${BASE_URL}/api/config/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Error al ejecutar la operación");
    }
    return await response.json();
  },

  connectTradingPlatform: async (platform: string, credentials: Record<string, string>, accountType: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          platform, 
          credentials,
          platform_type: 'iqoption',
          account_type: accountType
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al conectar con la plataforma');
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || 'Error en la conexión');
    }
  },

  checkConnection: async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/check-connection`);
      return await response.json();
    } catch (error) {
      return { status: 'disconnected' };
    }
  },

  disconnect: async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/disconnect`, {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      throw new Error('Error al desconectar');
    }
  },

  switchAccountType: async (accountType: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/trading/switch-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ account_type: accountType }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al cambiar tipo de cuenta');
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || 'Error al cambiar tipo de cuenta');
    }
  },

  getAssets: async () => {
    const response = await fetch(`${BASE_URL}/api/trading/assets`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener los activos');
    }
    return data;
  },

  getTrades: async (limit: number = 100) => {
    const response = await fetch(`${BASE_URL}/api/trading/trades?limit=${limit}`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener el historial de operaciones');
    }
    return data;
  },

  scanAssets: async (assets?: string, interval?: number) => {
    let url = `${BASE_URL}/api/trading/scan`;
    const params = new URLSearchParams();
    if (assets) params.append('assets', assets);
    if (interval) params.append('interval', interval.toString());
    
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al escanear activos');
    }
    return data;
  },

  connectQuotex: async (credentials: Record<string, string>, accountType: string) => {
    try {
      const response = await fetch(`${BASE_URL}/api/quotex/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          credentials,
          account_type: accountType
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al conectar con Quotex');
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || 'Error en la conexión');
    }
  },

  connectMT5: async (credentials: {
    login: number;
    password: string;
    server: string;
    terminal_path?: string;
  }) => {
    try {
      const response = await fetch(`${BASE_URL}/api/mt5/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credentials }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al conectar con MT5');
      }

      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || 'Error en la conexión');
    }
  },

  getMT5Symbols: async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/mt5/symbols`);
      if (!response.ok) {
        throw new Error('Error al obtener símbolos');
      }
      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || 'Error al obtener símbolos');
    }
  },

  getMT5HistoricalData: async (
    symbol: string,
    timeframe: string,
    nCandles: number = 1000
  ) => {
    try {
      const response = await fetch(
        `${BASE_URL}/api/mt5/historical-data?symbol=${symbol}&timeframe=${timeframe}&n_candles=${nCandles}`
      );
      if (!response.ok) {
        throw new Error('Error al obtener datos históricos');
      }
      return await response.json();
    } catch (error: any) {
      throw new Error(error.message || 'Error al obtener datos históricos');
    }
  },

  // Unified candles endpoint (demo fallback if no active platform)
  getCandles: async (
    symbol: string,
    timeframe: string,
    count: number = 500,
    platform?: string
  ) => {
    try {
      const q = new URLSearchParams();
      q.append('symbol', symbol);
      q.append('timeframe', timeframe);
      q.append('count', String(count));
      if (platform) q.append('platform', platform);
      const response = await fetch(`${BASE_URL}/api/data/candles?${q.toString()}`);
      const data = await response.json();
      if (!response.ok || data.status === 'error') {
        throw new Error(data.message || 'Error al obtener velas');
      }
      return data;
    } catch (error: any) {
      throw new Error(error.message || 'Error al obtener velas');
    }
  },

  // ==================== BACKTESTING API ====================

  getStrategies: async () => {
    const response = await fetch(`${BASE_URL}/api/backtesting/strategies`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener estrategias');
    }
    return data;
  },

  getStrategyDetails: async (name: string) => {
    const response = await fetch(`${BASE_URL}/api/backtesting/strategy?name=${name}`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener detalles de estrategia');
    }
    return data;
  },

  runBacktest: async (config: any, candles: any) => {
    const response = await fetch(`${BASE_URL}/api/backtesting/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, candles }),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al ejecutar backtesting');
    }
    return data;
  },

  runQuickBacktest: async (params: {
    strategy_name: string;
    num_candles?: number;
    initial_capital?: number;
    trade_amount?: number;
    payout_rate?: number;
    min_confidence?: number;
  }) => {
    const response = await fetch(`${BASE_URL}/api/backtesting/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al ejecutar backtesting rápido');
    }
    return data;
  },

  getBacktestResult: async (id: string) => {
    const response = await fetch(`${BASE_URL}/api/backtesting/result?id=${id}`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener resultado');
    }
    return data;
  },

  listBacktestResults: async () => {
    const response = await fetch(`${BASE_URL}/api/backtesting/results`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al listar resultados');
    }
    return data;
  },

  compareStrategies: async (strategies: string[], config?: any, candles?: any) => {
    const response = await fetch(`${BASE_URL}/api/backtesting/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategies, config, candles }),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al comparar estrategias');
    }
    return data;
  },

  analyzeSignal: async (strategy_name: string, candles: any[]) => {
    const response = await fetch(`${BASE_URL}/api/backtesting/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_name, candles }),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al analizar señal');
    }
    return data;
  },

  // ==================== MACHINE LEARNING API ====================

  getMLStatus: async () => {
    const response = await fetch(`${BASE_URL}/api/ml/status`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener estado ML');
    }
    return data;
  },

  trainML: async (params: {
    platform?: string;
    symbol?: string;
    timeframe?: string;
    candles?: number;
    train_xgboost?: boolean;
    train_lstm?: boolean;
  }) => {
    const response = await fetch(`${BASE_URL}/api/ml/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al entrenar modelos');
    }
    return data;
  },

  quickTrainML: async () => {
    const response = await fetch(`${BASE_URL}/api/ml/quick-train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error en entrenamiento rápido');
    }
    return data;
  },

  predictML: async (params: {
    platform?: string;
    symbol?: string;
    timeframe?: string;
    candles?: number;
    model?: 'xgboost' | 'lstm' | 'ensemble';
  }) => {
    const response = await fetch(`${BASE_URL}/api/ml/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error en predicción ML');
    }
    return data;
  },

  analyzeML: async (params: {
    symbol?: string;
    timeframe?: string;
    strategy?: string;
  }) => {
    const response = await fetch(`${BASE_URL}/api/ml/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error en análisis ML');
    }
    return data;
  },

  getFeatureImportance: async () => {
    const response = await fetch(`${BASE_URL}/api/ml/feature-importance`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener importancia de features');
    }
    return data;
  },

  loadMLModels: async () => {
    const response = await fetch(`${BASE_URL}/api/ml/load`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al cargar modelos');
    }
    return data;
  },

  // ==================== LIVE TRADING API ====================

  getLiveStatus: async () => {
    const response = await fetch(`${BASE_URL}/api/live/status`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener estado del bot');
    }
    return data;
  },

  startLiveTrading: async (config?: {
    mode?: string;
    platform?: string;
    symbols?: string[];
    strategies?: string[];
    amount?: number;
    min_confidence?: number;
    expiration?: number;
  }) => {
    const response = await fetch(`${BASE_URL}/api/live/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al iniciar trading');
    }
    return data;
  },

  stopLiveTrading: async () => {
    const response = await fetch(`${BASE_URL}/api/live/stop`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al detener trading');
    }
    return data;
  },

  scanMarket: async (params?: {
    symbols?: string[];
    strategies?: string[];
    platform?: string;
  }) => {
    const response = await fetch(`${BASE_URL}/api/live/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al escanear mercado');
    }
    return data;
  },

  executeLiveTrade: async (trade: {
    symbol: string;
    direction: string;
    amount: number;
    strategy: string;
    confidence: number;
    indicators?: Record<string, any>;
    reasons?: string[];
    ml_prediction?: any;
  }) => {
    const response = await fetch(`${BASE_URL}/api/live/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trade),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al ejecutar trade');
    }
    return data;
  },

  getLiveHistory: async (limit?: number, accountType?: string) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (accountType) params.append('account_type', accountType);
    
    const url = `${BASE_URL}/api/live/history${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener historial');
    }
    return data;
  },

  getLiveSignals: async (limit?: number) => {
    const url = `${BASE_URL}/api/live/signals${limit ? '?limit=' + limit : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener señales');
    }
    return data;
  },

  getLossAnalysis: async () => {
    const response = await fetch(`${BASE_URL}/api/live/loss-analysis`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener análisis de pérdidas');
    }
    return data;
  },

  getRiskState: async () => {
    const response = await fetch(`${BASE_URL}/api/trading/risk-state`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener estado de riesgo');
    }
    return data;
  },

  // ==================== ROBOT CONFIG API ====================

  getRobotConfig: async () => {
    const response = await fetch(`${BASE_URL}/api/robot/config`);
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al obtener configuración');
    }
    return data;
  },

  saveRobotConfig: async (config: any) => {
    const response = await fetch(`${BASE_URL}/api/robot/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await response.json();
    if (!response.ok || data.status === 'error') {
      throw new Error(data.message || 'Error al guardar configuración');
    }
    return data;
  }
};

export default api;

