export interface TradingPlatform {
    id: string;
    name: string;
    logo: string;
    features: string[];
    requiredCredentials: {
        field: string;
        type: string;
        label: string;
        placeholder: string;
        validation?: RegExp;
    }[];
}

export const SUPPORTED_PLATFORMS: TradingPlatform[] = [
    {
        id: 'iqoption',
        name: 'IQ Option',
        logo: '/images/platforms/iqoption.png',
        features: ['Binary Options', 'Digital Options', 'Forex', 'Crypto'],
        requiredCredentials: [
            {
                field: 'email',
                type: 'email',
                label: 'Correo Electrónico',
                placeholder: 'correo@ejemplo.com',
                validation: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            },
            {
                field: 'password',
                type: 'password',
                label: 'Contraseña',
                placeholder: '********'
            }
        ]
    },
    {
        id: 'quotex',
        name: 'Quotex',
        logo: '/images/platforms/quotex.png',
        features: ['Binary Options', 'Forex'],
        requiredCredentials: [
            {
                field: 'username',
                type: 'text',
                label: 'Usuario',
                placeholder: 'Tu usuario de Quotex'
            },
            {
                field: 'password',
                type: 'password',
                label: 'Contraseña',
                placeholder: '********'
            }
        ]
    },
    {
        id: 'mt5',
        name: 'MetaTrader 5',
        logo: '/images/platforms/mt5.png',
        features: ['Forex', 'Stocks', 'Crypto'],
        requiredCredentials: [
            {
                field: 'server',
                type: 'text',
                label: 'Servidor',
                placeholder: 'Servidor MT5'
            },
            {
                field: 'account',
                type: 'number',
                label: 'Número de Cuenta',
                placeholder: '12345678'
            },
            {
                field: 'password',
                type: 'password',
                label: 'Contraseña',
                placeholder: '********'
            }
        ]
    }
]; 