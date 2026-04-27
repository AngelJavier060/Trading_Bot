import React, { useState, useEffect } from 'react';
import { X, Loader2, Eye, EyeOff, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: 'iqoption' | 'mt5';
  onSuccess: (accountInfo: any) => void;
  /** Al abrir MT5 desde Config, forzar modo demo/real esperado en el formulario */
  mt5PreferredDemo?: boolean | null;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  platform,
  onSuccess,
  mt5PreferredDemo = null,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  
  // IQ Option credentials
  const [iqEmail, setIqEmail] = useState('');
  const [iqPassword, setIqPassword] = useState('');
  const [iqAccountType, setIqAccountType] = useState<'PRACTICE' | 'REAL'>('PRACTICE');
  
  // MT5 credentials
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const [mt5TerminalPath, setMt5TerminalPath] = useState('');
  const [mt5IsDemo, setMt5IsDemo] = useState(true);

  useEffect(() => {
    if (isOpen && platform === 'mt5' && mt5PreferredDemo !== null && mt5PreferredDemo !== undefined) {
      setMt5IsDemo(mt5PreferredDemo);
    }
  }, [isOpen, platform, mt5PreferredDemo]);

  if (!isOpen) return null;

  const handleConnectIQ = async () => {
    if (!iqEmail || !iqPassword) {
      toast.error('Por favor ingresa email y contraseña');
      return;
    }
    setIsLoading(true);
    setErrorDetail(null);
    try {
      const result = await api.connectTradingPlatform(
        'iqoption',
        { email: iqEmail, password: iqPassword },
        iqAccountType
      );
      if (result.status === 'success' || result.status === 'connected' || result.connected) {
        toast.success('Conexión exitosa con IQ Option');
        const accountInfo = result.accountInfo || await api.getAccountInfo();
        onSuccess(accountInfo);
        onClose();
      } else {
        setErrorDetail(result.message || 'Error de conexión');
        toast.error(result.message || 'Error de conexión');
      }
    } catch (error: any) {
      setErrorDetail(error.message || 'Error al conectar');
      toast.error(error.message || 'Error al conectar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoMode = async () => {
    setIsLoading(true);
    setErrorDetail(null);
    try {
      const result = await api.connectTradingPlatform(
        'iqoption',
        { email: 'demo@local', password: 'demo' },
        'PRACTICE',
        true
      );
      if (result.status === 'connected') {
        toast.success('Modo Demo activo — operaciones simuladas localmente');
        onSuccess(result.accountInfo || { account_type: 'PRACTICE', balance: 10000, currency: 'USD' });
        onClose();
      }
    } catch (error: any) {
      toast.error('Error al activar modo demo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectMT5 = async () => {
    if (!mt5Login || !mt5Password || !mt5Server) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setIsLoading(true);
    setErrorDetail(null);
    try {
      const result = await api.connectMT5(
        {
          login: parseInt(mt5Login),
          password: mt5Password,
          server: mt5Server,
          terminal_path: mt5TerminalPath,
        },
        { is_demo: mt5IsDemo }
      );
      
      if (result.status === 'success' || result.status === 'connected' || result.connected) {
        toast.success('Conectado a MetaTrader 5');
        onSuccess(result.accountInfo || result);
        onClose();
      } else {
        const msg = result.message || 'Error de conexión';
        setErrorDetail(msg);
        toast.error(msg);
      }
    } catch (error: any) {
      const msg = error.message || 'Error al conectar con MT5';
      setErrorDetail(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            Conectar a {platform === 'iqoption' ? 'IQ Option' : 'MetaTrader 5'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {platform === 'iqoption' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Email</label>
                <input
                  type="email"
                  value={iqEmail}
                  onChange={(e) => setIqEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={iqPassword}
                    onChange={(e) => setIqPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Tipo de Cuenta</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIqAccountType('PRACTICE')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      iqAccountType === 'PRACTICE'
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    onClick={() => setIqAccountType('REAL')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      iqAccountType === 'REAL'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Real
                  </button>
                </div>
                {iqAccountType === 'REAL' && (
                  <p className="text-xs text-orange-400 mt-2">
                    ⚠️ Operarás con dinero real. Procede con precaución.
                  </p>
                )}
              </div>

              {/* Error detail */}
              {errorDetail && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300">
                  <strong>Error:</strong> {errorDetail}
                </div>
              )}

              {/* Demo mode hint */}
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 text-xs text-blue-300">
                <strong>Demo en IQ Option (recomendado):</strong> selecciona <em>Demo</em> (PRACTICE) y conecta con tus credenciales.
                <div className="mt-1 text-[11px] text-blue-200/80">
                  <strong>Demo Local</strong> es solo para pruebas sin broker y <strong>NO</strong> aparece en el historial de IQ Option.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* MT5 prerequisite notice */}
              <div className="bg-amber-900/25 border border-amber-700/60 rounded-lg p-3 text-xs text-amber-300 space-y-1">
                <p className="font-semibold">⚠️ Requisitos para conectar MT5:</p>
                <p>1. El terminal <strong>Pepperstone MetaTrader 5</strong> debe estar <strong>instalado y abierto</strong> en este PC.</p>
                <p>2. El módulo Python debe estar instalado: <code className="bg-slate-900 px-1 rounded">pip install MetaTrader5</code></p>
              </div>
              {errorDetail && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-xs text-red-300 break-words">
                  <strong>Error:</strong> {errorDetail}
                </div>
              )}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Tipo de cuenta MT5</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMt5IsDemo(true)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      mt5IsDemo
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMt5IsDemo(false)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      !mt5IsDemo
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Real
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Debes usar el <strong>servidor</strong> que corresponda (p. ej. broker &quot;-Demo&quot; vs cuenta live en tu broker).
                </p>
                {!mt5IsDemo && (
                  <p className="text-xs text-orange-400 mt-1">
                    ⚠️ Cuenta real: confirmas operar con dinero real en este login/servidor.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Login (Número de cuenta)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={mt5Login}
                  onChange={(e) => setMt5Login(e.target.value.replace(/\D/g, ''))}
                  placeholder="12345678"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={mt5Password}
                    onChange={(e) => setMt5Password(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Servidor</label>
                <input
                  type="text"
                  value={mt5Server}
                  onChange={(e) => setMt5Server(e.target.value)}
                  placeholder="MT5-demo01"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ej: MT5-demo01 (Pepperstone), AdmiralsSC-Demo, ICMarkets-Demo02
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Ruta del Terminal (opcional)</label>
                <input
                  type="text"
                  value={mt5TerminalPath}
                  onChange={(e) => setMt5TerminalPath(e.target.value)}
                  placeholder="C:\\Program Files\\Pepperstone MetaTrader 5\\terminal64.exe"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Opcional. Si la detección automática falla, pega aquí la ruta exacta al terminal64.exe
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 space-y-2">
          {/* Demo local button - only for IQ Option (secondary / explicit) */}
          {platform === 'iqoption' && (
            <details className="w-full">
              <summary className="cursor-pointer select-none text-xs text-slate-400 hover:text-slate-200">
                Opciones avanzadas
              </summary>
              <button
                onClick={handleDemoMode}
                disabled={isLoading}
                className="mt-2 w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-slate-200"
              >
                <FlaskConical className="w-4 h-4" />
                Demo Local (SIN IQ Option)
              </button>
            </details>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={platform === 'iqoption' ? handleConnectIQ : handleConnectMT5}
              disabled={isLoading}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Conectando...
                </>
              ) : (
                platform === 'mt5' ? 'Conectar MT5' : 'Conectar IQ Option'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
