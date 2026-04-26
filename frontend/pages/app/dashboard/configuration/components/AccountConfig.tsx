import React, { useState } from 'react';
import { TradingPlatform, SUPPORTED_PLATFORMS } from '@/types/platforms';
import Image from 'next/image';

interface AccountConfigProps {
    onLogin: (platform: string, credentials: Record<string, string>, accountType: string) => Promise<void>;
    onAccountTypeChange?: (accountType: string) => Promise<void>;
    initialAccountType?: string;
}

const AccountConfig: React.FC<AccountConfigProps> = ({ 
    onLogin, 
    onAccountTypeChange,
    initialAccountType = 'PRACTICE' 
}) => {
    const [selectedPlatform, setSelectedPlatform] = useState<TradingPlatform | null>(null);
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    const [accountType, setAccountType] = useState<'PRACTICE' | 'REAL'>(initialAccountType as 'PRACTICE' | 'REAL');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);

    const handlePlatformSelect = (platform: TradingPlatform) => {
        setSelectedPlatform(platform);
        setCredentials({});
        setErrors({});
    };

    const validateCredentials = () => {
        if (!selectedPlatform) return false;
        
        const newErrors: Record<string, string> = {};
        let isValid = true;

        selectedPlatform.requiredCredentials.forEach(cred => {
            const value = credentials[cred.field] || '';
            
            if (!value) {
                newErrors[cred.field] = `${cred.label} es requerido`;
                isValid = false;
            } else if (cred.validation && !cred.validation.test(value)) {
                newErrors[cred.field] = `${cred.label} no es válido`;
                isValid = false;
            }
        });

        setErrors(newErrors);
        return isValid;
    };

    const handleLogin = async () => {
        if (!validateCredentials() || !selectedPlatform) return;

        setIsLoading(true);
        try {
            await onLogin(selectedPlatform.id, credentials, accountType);
        } catch (error: any) {
            setErrors({ submit: error.message || 'Error al conectar' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAccountTypeChange = async (newType: string) => {
        if (newType === 'REAL') {
            const confirmed = window.confirm(
                '⚠️ ADVERTENCIA: Está a punto de activar el modo con DINERO REAL.\n\n' +
                'Solo active esta opción si:\n' +
                '• El bot fue probado al menos 2 semanas en cuenta Demo\n' +
                '• Los resultados en Demo fueron consistentemente positivos\n' +
                '• Entiende que puede perder el dinero invertido\n\n' +
                '¿Está seguro que desea activar el modo con dinero REAL?'
            );
            if (!confirmed) return;
        }
        setAccountType(newType as 'PRACTICE' | 'REAL');
        if (onAccountTypeChange) {
            await onAccountTypeChange(newType);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-6 w-96">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Seleccionar Plataforma</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider ${
                    accountType === 'REAL'
                        ? 'bg-red-100 text-red-700 border border-red-400 animate-pulse'
                        : 'bg-green-100 text-green-700 border border-green-400'
                }`}>
                    {accountType === 'REAL' ? '🔴 REAL' : '🟢 DEMO'}
                </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
                {SUPPORTED_PLATFORMS.map(platform => (
                    <button
                        key={platform.id}
                        onClick={() => handlePlatformSelect(platform)}
                        className={`p-4 border rounded-lg transition-all ${
                            selectedPlatform?.id === platform.id 
                            ? 'border-blue-500 shadow-md' 
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                    >
                        <Image
                            src={platform.logo}
                            alt={platform.name}
                            width={48}
                            height={48}
                            className="mx-auto mb-2"
                        />
                        <p className="text-sm text-center">{platform.name}</p>
                    </button>
                ))}
            </div>

            {selectedPlatform && (
                <>
                    <div className="mb-4">
                        <label className="block text-gray-700 font-bold mb-2">
                            Tipo de Cuenta
                        </label>
                        <select
                            value={accountType}
                            onChange={(e) => handleAccountTypeChange(e.target.value)}
                            className={`w-full border rounded p-2 font-bold ${
                                accountType === 'REAL' ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300'
                            }`}
                        >
                            <option value="PRACTICE">🟢 Demo (Práctica)</option>
                            <option value="REAL">🔴 Real (Dinero Real)</option>
                        </select>
                        {accountType === 'REAL' && (
                            <div className="mt-2 p-3 bg-red-50 border border-red-400 rounded text-sm text-red-700">
                                <strong>⚠️ MODO REAL ACTIVO</strong> — Las operaciones usarán dinero real.
                                Asegúrese de haber probado el bot en Demo durante al menos 2 semanas.
                            </div>
                        )}
                    </div>
                    
                    <div className="space-y-4">
                        {selectedPlatform.requiredCredentials.map(cred => (
                            <div key={cred.field}>
                                <label className="block text-gray-700 font-bold mb-2">
                                    {cred.label}
                                </label>
                                <input
                                    type={cred.type}
                                    value={credentials[cred.field] || ''}
                                    onChange={(e) => setCredentials({
                                        ...credentials,
                                        [cred.field]: e.target.value
                                    })}
                                    className={`w-full border rounded p-2 ${
                                        errors[cred.field] ? 'border-red-500' : 'border-gray-300'
                                    }`}
                                    placeholder={cred.placeholder}
                                />
                                {errors[cred.field] && (
                                    <p className="text-red-500 text-sm mt-1">{errors[cred.field]}</p>
                                )}
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className={`w-full mt-6 py-2 rounded font-bold ${
                            isLoading
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                        {isLoading ? 'Conectando...' : 'Conectar con la Plataforma'}
                    </button>

                    {errors.submit && (
                        <p className="text-red-500 text-center mt-2">{errors.submit}</p>
                    )}
                </>
            )}
        </div>
    );
};

export default AccountConfig; 