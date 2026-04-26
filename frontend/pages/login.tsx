import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

const Login = () => {
  const [terminalId, setTerminalId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    return () => {
      document.documentElement.classList.remove('light');
      if (isDark) document.documentElement.classList.add('dark');
    };
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (terminalId === 'admin' && password === '1234') {
      router.push('/dashboard');
    } else {
      alert('Identificador o clave de seguridad incorrectos');
    }
  };

  return (
    <>
      <Head>
        <title>Acceso Institucional | Nexus</title>
      </Head>
      <div style={{ backgroundColor: '#f7f9fb', color: '#191c1e', fontFamily: 'Inter, sans-serif' }} className="min-h-screen flex flex-col">

        <main className="flex-grow flex items-center justify-center px-6 py-20 relative">
          {/* Background blur orbs */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: 'rgba(112,141,192,0.06)' }}></div>
            <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: 'rgba(112,141,192,0.06)' }}></div>
          </div>

          <div className="relative z-10 w-full max-w-[440px]">

            {/* Logo area */}
            <div className="flex flex-col items-center mb-12">
              <div className="w-12 h-12 bg-[#708DC0] flex items-center justify-center rounded-lg shadow-sm mb-4">
                <span className="material-symbols-outlined text-3xl" style={{ color: 'white', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>lock</span>
              </div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tighter">Nexus Institutional</h1>
              <p className="text-sm text-[#57657b] mt-2 text-center">Plataforma Global de Ejecución de Activos Múltiples</p>
            </div>

            {/* Login Card */}
            <div className="bg-white border border-[#c4c6d0] rounded-xl p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-slate-900 mb-1">Acceso Institucional</h2>
                <p className="text-sm text-slate-500">Por favor autentíquese para acceder a la terminal de trading.</p>
              </div>

              <form className="space-y-5" onSubmit={handleLogin}>

                {/* Terminal ID field */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-900 block" htmlFor="terminal-id">
                    Identificador de Cliente o Correo
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">badge</span>
                    <input
                      id="terminal-id"
                      type="text"
                      placeholder="admin"
                      value={terminalId}
                      onChange={(e) => setTerminalId(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-[#f7f9fb] border border-[#c4c6d0] rounded-lg outline-none transition-all text-base text-slate-900 placeholder-slate-400"
                      style={{ boxShadow: 'none' }}
                      onFocus={(e) => { e.target.style.borderColor = '#708DC0'; e.target.style.boxShadow = '0 0 0 3px rgba(112,141,192,0.15)'; }}
                      onBlur={(e) => { e.target.style.borderColor = '#c4c6d0'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-slate-900 block" htmlFor="password">
                      Clave de Seguridad
                    </label>
                    <a className="text-xs text-[#708DC0] hover:underline" href="#">Política de Privacidad</a>
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">key</span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-12 py-3 bg-[#f7f9fb] border border-[#c4c6d0] rounded-lg outline-none transition-all text-base text-slate-900 placeholder-slate-400"
                      style={{ boxShadow: 'none' }}
                      onFocus={(e) => { e.target.style.borderColor = '#708DC0'; e.target.style.boxShadow = '0 0 0 3px rgba(112,141,192,0.15)'; }}
                      onBlur={(e) => { e.target.style.borderColor = '#c4c6d0'; e.target.style.boxShadow = 'none'; }}
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>

                {/* 2FA notice */}
                <div className="p-3.5 bg-[#eceef0] rounded-lg border border-[#c4c6d0] flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#708DC0]">verified_user</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">2FA Requerido</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">TOKEN: HARDWARE O AUTENTICADOR</p>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full bg-[#708DC0] hover:bg-[#3f5c8c] py-4 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                  style={{ color: 'white' }}
                >
                  <span>Iniciar Sesión</span>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                </button>

              </form>

              {/* SSO option */}
              <div className="mt-6 pt-6 border-t border-[#c4c6d0]">
                <button
                  type="button"
                  className="w-full bg-[#eceef0] hover:bg-[#e6e8ea] text-slate-700 text-xs font-semibold py-3 rounded-lg border border-[#c4c6d0] transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">vpn_key</span>
                  <span>Acceso Único SSO</span>
                </button>
              </div>
            </div>

            {/* Back to landing */}
            <div className="mt-5 text-center">
              <Link href="/" className="text-xs text-[#708DC0] hover:underline">
                ← Volver al inicio
              </Link>
            </div>

            {/* Compliance notice */}
            <div className="mt-4 text-center">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Al iniciar sesión, reconoce que el acceso a esta terminal está restringido al personal autorizado de Nexus Institutional y clientes registrados. Toda la actividad de trading es monitoreada para cumplimiento regulatorio.
              </p>
            </div>

          </div>
        </main>

        {/* Footer */}
        <footer className="w-full py-6 px-8 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-200 bg-slate-50">
          <div className="text-sm font-semibold text-slate-400">Nexus Institutional Trading Group</div>
          <div className="flex flex-wrap justify-center gap-6">
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Política de Privacidad</a>
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Términos de Servicio</a>
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Divulgación Regulatoria</a>
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Soporte</a>
          </div>
          <div className="text-xs text-slate-400 text-center">© 2024 Nexus Institutional. Member FINRA/SIPC.</div>
        </footer>

      </div>
    </>
  );
};

export default Login;
