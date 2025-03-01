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

    connectTradingPlatform: async (platform: string, credentials: Record<string, string>, accountType: string) => {
        try {
            const response = await fetch(`${BASE_URL}/api/trading/connect`, {
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
                throw new Error(error.message || 'Error al conectar con la plataforma');
            }

            return await response.json();
        } catch (error: any) {
            throw new Error(error.message || 'Error en la conexión');
        }
    },

    saveConfig: async (config: any) => {
        try {
            const response = await fetch(`${BASE_URL}/api/trading/save-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config),
            });

            if (!response.ok) {
                throw new Error('Error al guardar la configuración');
            }

            return await response.json();
        } catch (error: any) {
            throw new Error(error.message || 'Error al guardar la configuración');
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
    }
};

export default api; 