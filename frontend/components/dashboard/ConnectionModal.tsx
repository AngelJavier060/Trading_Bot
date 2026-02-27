'use client';

import React, { useState } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: 'iqoption' | 'mt5';
  onSuccess: (accountInfo: any) => void;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  platform,
  onSuccess
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // IQ Option credentials
  const [iqEmail, setIqEmail] = useState('');
  const [iqPassword, setIqPassword] = useState('');
  const [iqAccountType, setIqAccountType] = useState<'PRACTICE' | 'REAL'>('PRACTICE');
  
  // MT5 credentials
  const [mt5Login, setMt5Login] = useState('');
  const [mt5Password, setMt5Password] = useState('');
  const [mt5Server, setMt5Server] = useState('');
  const [mt5TerminalPath, setMt5TerminalPath] = useState('');

  if (!isOpen) return null;

  const handleConnectIQ = async () => {
    if (!iqEmail || !iqPassword) {
      toast.error('Por favor ingresa email y contraseña');
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.connectTradingPlatform(
        'iqoption',
        { email: iqEmail, password: iqPassword },
        iqAccountType
      );
      
      if (result.status === 'success' || result.status === 'connected' || result.connected) {
        toast.success('Conexión exitosa con IQ Option');
        // Use accountInfo from response if available, otherwise fetch it
        const accountInfo = result.accountInfo || await api.getAccountInfo();
        onSuccess(accountInfo);
        onClose();
      } else {
        toast.error(result.message || 'Error de conexión');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al conectar');
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
    try {
      const result = await api.connectMT5({
        login: parseInt(mt5Login),
        password: mt5Password,
        server: mt5Server,
        terminal_path: mt5TerminalPath
      });
      
      if (result.status === 'success' || result.connected) {
        toast.success('Conectado a MetaTrader 5');
        onSuccess(result);
        onClose();
      } else {
        toast.error(result.message || 'Error de conexión');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al conectar');
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
            </div>
          ) : (
            <div className="space-y-4">
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
                  placeholder="AdmiralsSC-Demo"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ej: AdmiralsSC-Demo, ICMarkets-Demo
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Ruta del Terminal (opcional)</label>
                <input
                  type="text"
                  value={mt5TerminalPath}
                  onChange={(e) => setMt5TerminalPath(e.target.value)}
                  placeholder="C:\\Program Files\\Admirals MetaTrader 5\\terminal64.exe"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ruta al terminal64.exe si no se detecta automáticamente
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
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
              'Conectar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionModal;
