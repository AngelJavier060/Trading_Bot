import React, { useState } from "react";
import api from "../../../services/api";

const AITrading: React.FC = () => {
    const [result, setResult] = useState<string | null>(null);

    const handleBuy = async () => {
        const data = {
            activo: "EURUSD-OTC",
            cantidad: 10,
            direccion: "call",
            expiracion: 5,
        };

        try {
            const response = await api.buy(data);
            setResult(response.resultado);
        } catch (error) {
            console.error("Error al realizar la compra:", error);
        }
    };

    return (
        <div className="bg-white shadow p-4 rounded">
            <h2 className="text-xl font-bold">Trading Automático</h2>
            <button
                onClick={handleBuy}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
                Ejecutar Compra
            </button>
            {result && <p className="mt-4">Resultado: {result}</p>}
        </div>
    );
};

export default AITrading;
