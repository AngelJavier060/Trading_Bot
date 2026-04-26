import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const LandingPage = () => {
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    return () => {
      document.documentElement.classList.remove('light');
      if (isDark) document.documentElement.classList.add('dark');
    };
  }, []);

  return (
    <>
      <Head>
        <title>Nexus Institucional | Trading de Alto Rendimiento</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div style={{ backgroundColor: '#F8FAFC', color: '#191C1E', fontFamily: 'Inter, sans-serif' }} className="antialiased">

        {/* TopNavBar */}
        <nav className="flex justify-between items-center h-16 px-8 w-full sticky top-0 z-[100] bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="flex items-center gap-12">
            <span className="text-xl font-bold tracking-tighter text-slate-900">Nexus Institucional</span>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium tracking-tight">
              <a className="text-[#708DC0] border-b-2 border-[#708DC0] pb-4 -mb-4" href="#">Mercados</a>
              <a className="text-slate-500 hover:text-slate-900 transition-colors" href="#">Ejecución</a>
              <a className="text-slate-500 hover:text-slate-900 transition-colors" href="#">Portafolio</a>
              <a className="text-slate-500 hover:text-slate-900 transition-colors" href="#">Investigación</a>
              <a className="text-slate-500 hover:text-slate-900 transition-colors" href="#">Cumplimiento</a>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-slate-500">
              <button type="button" className="p-2 hover:bg-slate-50 rounded-full transition-all">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button type="button" className="p-2 hover:bg-slate-50 rounded-full transition-all">
                <span className="material-symbols-outlined">settings</span>
              </button>
            </div>
            <Link href="/login">
              <button type="button" className="bg-[#3f5c8c] px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-all" style={{ color: 'white' }}>
                Acceso Seguro
              </button>
            </Link>
          </div>
        </nav>

        <main className="max-w-[1440px] mx-auto px-8 py-12 space-y-24">

          {/* Hero Section */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center pt-12">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d5e3fd] text-[#57657b] text-xs font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3f5c8c] animate-pulse"></span>
                Conectividad de Mercado en Vivo
              </div>
              <h1 className="text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight">
                Precisión Institucional.<br />
                <span className="text-[#5875a7]">Escala Sin Límites.</span>
              </h1>
              <p className="text-lg text-slate-600 max-w-xl leading-relaxed">
                Diseñado para la ejecución de alta frecuencia y la gestión de liquidez profunda. Navegue por los mercados globales con la autoridad y calma de la tecnología de Nexus Institucional.
              </p>
              <div className="flex items-center gap-4">
                <Link href="/login">
                  <button type="button" className="bg-[#3f5c8c] px-8 py-4 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:opacity-90 transition-all" style={{ color: 'white' }}>
                    Solicitar Acceso a la Terminal
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                </Link>
                <button type="button" className="border border-[#c4c6d0] text-slate-700 px-8 py-4 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                  Ver Documentación
                </button>
              </div>
            </div>
            <div className="relative group">
              <div className="absolute -inset-4 rounded-[2rem] blur-2xl transition-all duration-700" style={{ backgroundColor: 'rgba(63,92,140,0.05)' }}></div>
              <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-xl">
                <img
                  className="w-full h-auto object-cover"
                  alt="Modern professional trading interface showing complex financial charts, candlesticks, and real-time market data"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBjtXtiyjDWPoXeZk6Hxttwdc1IouitpCuZJ6F_cHBVfQjIo_3r2vZ_WzUMmweDQCsGITAPAHQ1UJhiIuN4GIFPM2AvL0fGa5OXCrp5Tjr0wTD6i_fCMsoAHVn5rKusPtipBFYhJFVDgrJAfI50pwhlLvrg6Z19rZgA8ZFZlTfXBzRrHrrYK_TEiKKax3eFp2gXJFRyr6UTVKHpcO2oszinqnFAPMkCA0udrqDqozqyv7oC7WEl9erlnS78jbP5LEHFjqTy7poarxg"
                />
              </div>
            </div>
          </section>

          {/* Market Overview */}
          <section className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Vista General del Mercado</h2>
                <p className="text-slate-500 mt-2">Instantáneas en tiempo real de todas las clases de activos globales.</p>
              </div>
              <button type="button" className="text-[#3f5c8c] text-sm font-medium flex items-center gap-2">
                Abrir Terminal <span className="material-symbols-outlined text-[20px]">open_in_new</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6">

              {/* Large Chart Widget */}
              <div className="md:col-span-4 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-[#3f5c8c] p-2 bg-blue-50 rounded-lg">query_stats</span>
                    <div>
                      <div className="text-sm font-medium text-slate-900">Rendimiento de Índices Globales</div>
                      <div className="text-xs text-slate-400">Agregación: Intervalos de 1m</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="px-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded">1D</button>
                    <button type="button" className="px-3 py-1 text-xs bg-[#3f5c8c] rounded" style={{ color: 'white' }}>5D</button>
                    <button type="button" className="px-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded">1M</button>
                  </div>
                </div>
                <div className="flex-1 min-h-[200px] w-full bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 overflow-hidden">
                  <img
                    className="w-full h-full object-cover opacity-80"
                    alt="Abstract minimalist line graph showing upward market trend"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBr-tT65Ix2RaEcNVKWZ3X8QXgB4Vdzr7hCB6fGZzcvCAC4eHOzvFyVua6cH1pBePOIIY4ySJK0LuBqtfXUYPkM958hHrqbW0PoTcz0w53ywTn4-OmBka8-ArL4rGF8_hoJhNF79EtunHKvkdf6g8MPPsqw4uWfic7HxN-FLUzSUKkBTVHydg1zpN7-FV77fcltBdxGIzEdGY8oyCEBnvHw_C4shnfdhaZPF6ovfoJAq_V-skpeZy0sC3VBmkLQmWRRZ0OXOtUzj3w"
                  />
                </div>
              </div>

              {/* Order Book Widget */}
              <div className="md:col-span-2 lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col shadow-sm">
                <div className="text-sm font-medium text-slate-900 mb-4 flex items-center justify-between">
                  Profundidad de Órdenes <span className="text-xs text-emerald-500">+0.24%</span>
                </div>
                <div className="space-y-3 flex-1">
                  {[['54,120.50', '0.450'], ['54,118.20', '1.221']].map(([p, v]) => (
                    <div key={p} className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-xs text-red-500 font-mono">{p}</span>
                      <span className="text-xs text-slate-400">{v} BTC</span>
                    </div>
                  ))}
                  <div className="flex justify-center py-2 bg-slate-50 rounded font-mono text-sm font-bold text-slate-900">54,115.00</div>
                  {[['54,112.90', '0.890'], ['54,110.15', '2.140']].map(([p, v]) => (
                    <div key={p} className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-xs text-emerald-600 font-mono">{p}</span>
                      <span className="text-xs text-slate-400">{v} BTC</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Perfil de Liquidez</span>
                  <div className="flex gap-1">
                    <div className="h-4 w-1.5 bg-emerald-100"></div>
                    <div className="h-4 w-1.5 bg-emerald-200"></div>
                    <div className="h-4 w-1.5 bg-emerald-400"></div>
                    <div className="h-4 w-1.5 bg-slate-200"></div>
                  </div>
                </div>
              </div>

              {/* Ticker: USD/JPY */}
              <div className="lg:col-span-2 bg-[#708DC0] rounded-xl p-6 flex flex-col justify-between shadow-md">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-lg" style={{ color: 'white' }}>USD/JPY</span>
                  <span className="material-symbols-outlined" style={{ color: 'white' }}>trending_up</span>
                </div>
                <div>
                  <div className="text-3xl font-mono font-bold" style={{ color: 'white' }}>148.242</div>
                  <div className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>+0.84% (Alerta Alta)</div>
                </div>
              </div>

              {/* Ticker: XAU/USD */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-slate-900">XAU/USD</span>
                  <span className="material-symbols-outlined text-slate-400">trending_flat</span>
                </div>
                <div>
                  <div className="text-3xl font-mono font-bold text-slate-900">2,024.15</div>
                  <div className="text-sm text-slate-400 mt-1">Rango de consolidación</div>
                </div>
              </div>

              {/* Ticker: Nexus Index */}
              <div className="lg:col-span-2 rounded-xl p-6 flex flex-col justify-between shadow-md" style={{ backgroundColor: '#0f172a' }}>
                <div className="flex justify-between items-start">
                  <span className="font-bold" style={{ color: 'white' }}>Índice Agregado Nexus</span>
                  <span className="material-symbols-outlined" style={{ color: '#aac7fe' }}>token</span>
                </div>
                <div>
                  <div className="text-3xl font-mono font-bold" style={{ color: 'white' }}>14,281.04</div>
                  <div className="text-sm mt-1" style={{ color: '#94a3b8' }}>Rendimiento de cesta optimizada</div>
                </div>
              </div>
            </div>
          </section>

          {/* Institutional Intelligence */}
          <section className="space-y-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Inteligencia Institucional</h2>
              <p className="text-lg text-slate-500 mt-4 leading-relaxed">
                Potentes conjuntos de herramientas analíticas diseñadas para la mesa de operaciones moderna. Precisión en cada capa del ciclo de vida de la transacción.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: 'terminal',
                  title: 'API Avanzada',
                  desc: 'Endpoints FIX y REST de ultra baja latencia para ejecución programática y transmisión de datos.',
                  items: ['Latencia Media de 2ms', 'SDKs Multi-lenguaje'],
                },
                {
                  icon: 'monitoring',
                  title: 'Monitor de Riesgo',
                  desc: 'Análisis VaR en tiempo real y seguimiento de la salud del margen en toda su jerarquía de portafolio.',
                  items: ['Prueba de Estrés en Vivo', 'Disyuntores Automáticos'],
                },
                {
                  icon: 'shield_with_heart',
                  title: 'Centro de Cumplimiento',
                  desc: 'Automatización de informes regulatorios y vigilancia comercial integrada directamente en el flujo de trabajo.',
                  items: ['Flujo Continuo AML/KYC', 'Inmutabilidad del Registro de Auditoría'],
                },
              ].map((card) => (
                <div key={card.title} className="p-8 bg-white border border-slate-200 rounded-xl space-y-6 hover:shadow-lg transition-shadow">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#3f5c8c]">{card.icon}</span>
                  </div>
                  <h3 className="text-2xl font-semibold text-slate-900">{card.title}</h3>
                  <p className="text-slate-500">{card.desc}</p>
                  <ul className="space-y-3 text-sm text-slate-600">
                    {card.items.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* CTA Section */}
          <section className="rounded-[2rem] p-12 lg:p-24 relative overflow-hidden text-center space-y-8" style={{ backgroundColor: '#020617' }}>
            <div className="absolute inset-0 opacity-10">
              <img
                className="w-full h-full object-cover"
                alt="Digital network background with abstract nodes and connections"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCwM8tPObR6z8R2J9yq6AErMvuRwuGNhUuj0yZv2JWPYkctbfE-lqnncH1_-UeSlFzXAMtQ6lrS_MkmI1wJ6LVfsuR-r7xzTmn_FlJVJ4az2Tpe5IQZiU7aduB3HIaW3CTWGjq1leCSZB-Vn8wr1PQBXQRdyTt_mytQD2x_swvhFgPvf5BoUQ735CCSawrMek95jyEPKyqSytOKY9DVAgIR9qlpSP96b5GYd5VwBSdDR4ZKChcmRGsDVwy1lGnS-si1xcZVFElWGmQ"
              />
            </div>
            <div className="relative z-10 max-w-3xl mx-auto space-y-8">
              <h2 className="text-5xl font-bold tracking-tight leading-tight" style={{ color: 'white' }}>
                ¿Listo para mejorar sus capacidades institucionales?
              </h2>
              <p className="text-lg leading-relaxed" style={{ color: '#94a3b8' }}>
                Únase a más de 400 gestores de activos globales y fondos de cobertura que utilizan Nexus Institucional para dominar los mercados.
              </p>
              <div className="flex flex-col md:flex-row justify-center gap-4">
                <Link href="/login">
                  <button type="button" className="bg-[#708DC0] px-10 py-5 rounded-lg font-bold hover:scale-105 transition-transform" style={{ color: 'white' }}>
                    Programar una Demo
                  </button>
                </Link>
                <button type="button" className="backdrop-blur-md border border-white/20 px-10 py-5 rounded-lg font-bold hover:bg-white/20 transition-all" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
                  Contactar Ventas
                </button>
              </div>
              <p className="text-xs uppercase tracking-widest font-semibold pt-4" style={{ color: '#64748b' }}>
                CUMPLIMIENTO GLOBAL: MiFID II | SOC2 | FINRA
              </p>
            </div>
          </section>

        </main>

        {/* Footer */}
        <footer className="w-full py-8 px-8 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-slate-200 mt-24 bg-slate-50">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-slate-400">Nexus Institucional</div>
            <p className="text-xs text-slate-400">© 2024 Nexus Institutional Trading Group. Miembro de FINRA/SIPC.</p>
          </div>
          <div className="flex gap-8">
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Política de Privacidad</a>
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Términos de Servicio</a>
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Divulgación Regulatoria</a>
            <a className="text-xs text-slate-400 hover:text-slate-900 transition-colors" href="#">Soporte</a>
          </div>
        </footer>

      </div>
    </>
  );
};

export default LandingPage;
