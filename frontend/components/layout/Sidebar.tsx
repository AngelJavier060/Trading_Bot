import { useRouter } from 'next/router';
import Link from 'next/link';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  description?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/app/dashboard', icon: '🏠', description: 'Panel principal' },
  { name: 'Trading Demo', href: '/app/dashboard/trading/demo', icon: '🎮', description: 'Practica sin riesgo' },
  { name: 'Trading Live', href: '/app/dashboard/trading/live', icon: '📊', description: 'Trading en tiempo real' },
  { name: 'Historial', href: '/app/dashboard/trading/history', icon: '📜', description: 'Operaciones pasadas' },
  { name: 'Backtesting', href: '/app/dashboard/backtesting', icon: '🧪', description: 'Probar estrategias' },
  { name: 'Machine Learning', href: '/app/dashboard/ml', icon: '🤖', description: 'IA y predicciones' },
  { name: 'Reportes', href: '/app/dashboard/reports', icon: '📈', description: 'Estadísticas' },
  { name: 'Configuración', href: '/app/dashboard/configuration', icon: '⚙️', description: 'Ajustes del bot' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const router = useRouter();
  
  const isActive = (href: string) => {
    return router.pathname === href || router.pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-50 transform transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-700">
          <Link href="/app/dashboard" className="flex items-center gap-3">
            <span className="text-3xl">🤖</span>
            <div>
              <h1 className="font-bold text-lg">Trading Bot</h1>
              <p className="text-xs text-gray-400">IA + ML</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                ${isActive(item.href) 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="font-medium text-sm">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-gray-400">{item.description}</p>
                )}
              </div>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Sistema Activo
          </div>
          <p className="text-xs text-gray-500 mt-1">v1.0 - IQ Option & MT5</p>
        </div>
      </aside>
    </>
  );
}
