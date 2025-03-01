const BASE_URL = "http://127.0.0.1:5000";

export const useApi = () => {
    const saveConfig = async (config: any) => {
        try {
            const response = await fetch(`${BASE_URL}/api/trading/save-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error al guardar la configuración');
            }

            return data;
        } catch (error: any) {
            console.error('Error saving config:', error);
            throw new Error(error.message || 'Error al guardar la configuración');
        }
    };

    return {
        saveConfig
    };
}; 