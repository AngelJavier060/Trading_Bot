const BASE_URL = "http://127.0.0.1:5000";

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

  getAccountInfo: async () => {
    const response = await fetch(`${BASE_URL}/account-info`);
    if (!response.ok) {
      throw new Error("Error al obtener la información de la cuenta");
    }
    return await response.json();
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
  }
};

export default api;

