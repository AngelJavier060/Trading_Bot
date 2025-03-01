// pages/bot.js
import { useState } from 'react';

export default function Bot() {
  const [resultado, setResultado] = useState(null);

  const ejecutarCompra = async () => {
    const response = await fetch("http://127.0.0.1:8000/comprar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activo: "EURUSD",
        cantidad: 100,
        direccion: "call",
        expiracion: 1,
      }),
    });
    const data = await response.json();
    setResultado(data.resultado);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Bot de IQ Option</h1>
      <button
        onClick={ejecutarCompra}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Ejecutar Compra
      </button>
      {resultado && <p className="mt-4">Resultado: {resultado}</p>}
    </div>
  );
}
