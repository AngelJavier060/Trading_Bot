import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function TradingIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/app/dashboard/trading/live');
  }, [router]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirigiendo a Trading Live...</p>
      </div>
    </div>
  );
}
