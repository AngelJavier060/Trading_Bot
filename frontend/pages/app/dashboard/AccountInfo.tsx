import React, { useEffect, useState } from "react";
import api from "../../../../services/api";
import AccountInfo from './trading/AccountInfo';

const AccountPage: React.FC = () => {
  const [accountInfo, setAccountInfo] = useState<{
    account_type: string;
    balance: number;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchAccountInfo = async () => {
      try {
        const info = await api.getAccountInfo();
        setAccountInfo(info);
      } catch (err: any) {
        setError(err.message || "Error al obtener la información de la cuenta.");
      } finally {
        setLoading(false);
      }
    };

    fetchAccountInfo();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Página de Información de la Cuenta</h1>
      {loading && <p className="text-blue-500">Cargando información...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {accountInfo && <AccountInfo accountInfo={accountInfo} />}
    </div>
  );
};

export default AccountPage;
