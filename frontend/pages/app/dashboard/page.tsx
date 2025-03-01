'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AccountInfo from './AccountInfo';
import AccountTypeSelector from './AccountTypeSelector';
import Configuration from './configuration/componentA';
import Signals from './Signals';

interface Estado {
    tipoCuenta: string;
    balance: number;
    divisas: string[];
    divisasSeleccionadas: string[];
    temporalidadesSeleccionadas: string[];
    estrategiasSeleccionadas: string[];
    señales: any[];
    tipoMercado: string;
}

export default function Dashboard() {
    const [estado, setEstado] = useState<Estado>({
        tipoCuenta: '',
        balance: 0,
        divisas: [],
        divisasSeleccionadas: [],
        temporalidadesSeleccionadas: [],
        estrategiasSeleccionadas: [],
        señales: [],
        tipoMercado: '',
    });
    const [cargando, setCargando] = useState(true); // Estado general de carga
    const router = useRouter();

    // Verificar y validar el token
    const verificarToken = (): boolean => {
        const token = localStorage.getItem('token');
        if (!token) {
            toast.error('Token no encontrado. Redirigiendo al inicio...');
            router.push('/');
            return false;
        }

        try {
            const decoded: any = JSON.parse(atob(token.split('.')[1])); // Decodificar JWT
            const currentTime = Date.now() / 1000; // Tiempo actual en segundos
            if (decoded.exp < currentTime) {
                toast.error('Tu sesión ha expirado. Redirigiendo al inicio...');
                localStorage.removeItem('token');
                router.push('/');
                return false;
            }
        } catch (error) {
            toast.error('Token inválido. Redirigiendo al inicio...');
            localStorage.removeItem('token');
            router.push('/');
            return false;
        }
        return true;
    };

    // Fetch Helper reutilizable con validación y reintentos
    const fetchWithRetry = async (url: string, options: RequestInit, retries: number = 3) => {
        if (!verificarToken()) return null;

        for (let i = 0; i < retries; i++) {
            try {
                const res = await fetch(url, options);
                if (res.ok) return await res.json();
                console.error(`Error HTTP: ${res.status} ${res.statusText}`);
            } catch (error) {
                console.error(`Intento ${i + 1} fallido:`, error);
            }
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Esperar antes de reintentar
        }
        throw new Error('No se pudo completar la solicitud después de varios intentos.');
    };

    // Manejar errores del backend
    const manejarErrores = (mensajeError: string) => {
        if (mensajeError === 'El token ha expirado' || mensajeError === 'Token inválido') {
            toast.error('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
            localStorage.removeItem('token');
            router.push('/');
        } else {
            toast.error(mensajeError || 'Ocurrió un error inesperado.');
        }
    };

    // Obtener información de la cuenta
    const obtenerCuenta = async () => {
        try {
            const token = localStorage.getItem('token');
            const data = await fetchWithRetry(`${process.env.NEXT_PUBLIC_API_URL}/account`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (data?.status === 'success') {
                setEstado((prev) => ({
                    ...prev,
                    tipoCuenta: data.account_type,
                    balance: data.balance,
                }));
                toast.success('Datos de la cuenta cargados correctamente.');
            } else {
                manejarErrores(data?.message || 'Error al obtener datos de la cuenta.');
            }
        } catch (error) {
            console.error('Error al obtener datos de la cuenta:', error);
            toast.error('Error al conectar con el servidor.');
        }
    };

    // Obtener divisas disponibles
    const obtenerDivisas = async () => {
        try {
            const token = localStorage.getItem('token');
            const data = await fetchWithRetry(`${process.env.NEXT_PUBLIC_API_URL}/account/currencies`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (data?.status === 'success') {
                setEstado((prev) => ({ ...prev, divisas: data.currencies }));
                toast.success('Divisas cargadas correctamente.');
            } else {
                manejarErrores(data?.message || 'Error al obtener las divisas.');
            }
        } catch (error) {
            console.error('Error al obtener divisas:', error);
            toast.error('Error al conectar con el servidor para obtener divisas.');
        }
    };

    // Cambiar tipo de cuenta
    const cambiarTipoCuenta = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/account/set_account_type`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ account_type: estado.tipoCuenta }),
            });
            const data = await res.json();
            if (data?.status === 'success') {
                toast.success(`Tipo de cuenta cambiado a ${estado.tipoCuenta}`);
                obtenerCuenta();
            } else {
                manejarErrores(data?.message || 'Error al cambiar el tipo de cuenta.');
            }
        } catch (error) {
            console.error('Error al cambiar tipo de cuenta:', error);
            toast.error('Error al conectar con el servidor.');
        }
    };

    // Aplicar estrategias
    const aplicarEstrategias = async () => {
        // Implementación de aplicarEstrategias
    };

    // Cargar datos iniciales
    useEffect(() => {
        if (verificarToken()) {
            Promise.all([obtenerCuenta(), obtenerDivisas()])
                .catch((error) => console.error('Error al cargar datos iniciales:', error))
                .finally(() => setCargando(false));
        }
    }, []);

    return (
        <div className="bg-gradient-to-br from-white to-blue-500 min-h-screen text-gray-800">
            <ToastContainer position="top-right" autoClose={3000} />
            <header className="bg-white shadow-md p-4 flex justify-between items-center">
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <button
                    className="bg-red-500 text-white px-4 py-2 rounded"
                    onClick={() => {
                        localStorage.removeItem('token');
                        router.push('/');
                    }}
                >
                    Salir
                </button>
            </header>
            <main className="p-4 flex flex-col items-center">
                {cargando ? (
                    <p className="animate-pulse">Cargando datos...</p>
                ) : (
                    <>
                        <AccountInfo tipoCuenta={estado.tipoCuenta} balance={estado.balance} />
                        <AccountTypeSelector
                            tipoCuenta={estado.tipoCuenta}
                            setTipoCuenta={(tipo: string) =>
                                setEstado((prev) => ({ ...prev, tipoCuenta: tipo }))
                            }
                            cambiarTipoCuenta={cambiarTipoCuenta}
                            cargando={cargando}
                        />
                        <Configuration
                            estado={estado}
                            setEstado={setEstado}
                            aplicarEstrategias={aplicarEstrategias}
                        />
                        <Signals señales={estado.señales} />
                    </>
                )}
            </main>
        </div>
    );
}