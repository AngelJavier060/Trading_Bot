import React, { useState, useEffect } from 'react';

interface Order {
  id: number | string;
  asset: string;
  type: 'call' | 'put';
  amount: number;
  status: 'pending' | 'open' | 'won' | 'lost' | 'closed';
  openTime: string;
  expiration: number;
  profit?: number;
}

interface LiveOrdersProps {
  orders?: Order[];
  onCloseOrder?: (orderId: number | string) => void;
  loading?: boolean;
}

const LiveOrders: React.FC<LiveOrdersProps> = ({
  orders = [],
  onCloseOrder,
  loading = false,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const calculateProgress = (order: Order) => {
    if (order.status !== 'open') return 100;
    const openTime = new Date(order.openTime).getTime();
    const expirationMs = order.expiration * 60 * 1000;
    const elapsed = now - openTime;
    return Math.min(100, (elapsed / expirationMs) * 100);
  };

  const calculateTimeRemaining = (order: Order) => {
    if (order.status !== 'open') return 0;
    const openTime = new Date(order.openTime).getTime();
    const expirationMs = order.expiration * 60 * 1000;
    const remaining = (openTime + expirationMs - now) / 1000;
    return Math.max(0, remaining);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: Order['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      open: 'bg-blue-100 text-blue-700 animate-pulse',
      won: 'bg-green-100 text-green-700',
      lost: 'bg-red-100 text-red-700',
      closed: 'bg-gray-100 text-gray-600',
    };
    return styles[status] || styles.closed;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 flex justify-between items-center">
        <h3 className="text-white font-bold">Órdenes en Vivo</h3>
        <span className="bg-white/20 text-white text-xs px-2 py-1 rounded">
          {orders.filter((o) => o.status === 'open').length} activas
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-400">No hay órdenes activas</p>
          <p className="text-xs text-gray-300 mt-1">Las operaciones aparecerán aquí en tiempo real</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {orders.map((order) => {
            const progress = calculateProgress(order);
            const timeRemaining = calculateTimeRemaining(order);

            return (
              <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{order.asset}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        order.type === 'call' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}
                    >
                      {order.type === 'call' ? '▲ CALL' : '▼ PUT'}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusBadge(order.status)}`}>
                    {order.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-gray-500">Monto: ${order.amount.toFixed(2)}</span>
                  {order.profit !== undefined && (
                    <span className={order.profit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {order.profit >= 0 ? '+' : ''}${order.profit.toFixed(2)}
                    </span>
                  )}
                </div>

                {order.status === 'open' && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progreso</span>
                      <span>{formatTime(timeRemaining)} restante</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {order.status === 'open' && onCloseOrder && (
                  <button
                    onClick={() => onCloseOrder(order.id)}
                    className="mt-3 w-full py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                  >
                    Cerrar Orden
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LiveOrders;
