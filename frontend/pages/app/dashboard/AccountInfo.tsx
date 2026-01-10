import React from "react";

interface AccountInfoProps {
  tipoCuenta?: string;
  balance?: number;
  currency?: string;
}

const AccountInfo: React.FC<AccountInfoProps> = ({
  tipoCuenta = 'N/A',
  balance = 0,
  currency = 'USD',
}) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 w-full max-w-md">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Información de Cuenta</h2>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-500 text-sm">Tipo de Cuenta</span>
          <span className={`font-bold ${
            tipoCuenta === 'REAL' ? 'text-green-600' : 'text-blue-600'
          }`}>
            {tipoCuenta}
          </span>
        </div>
        
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-500 text-sm">Balance</span>
          <span className="font-bold text-gray-800">
            ${typeof balance === 'number' ? balance.toFixed(2) : '0.00'}
          </span>
        </div>
        
        <div className="flex justify-between items-center py-2">
          <span className="text-gray-500 text-sm">Moneda</span>
          <span className="font-bold text-gray-800">{currency}</span>
        </div>
      </div>
    </div>
  );
};

export default AccountInfo;
