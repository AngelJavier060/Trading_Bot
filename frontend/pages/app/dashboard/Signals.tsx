import React, { useEffect, useState } from "react";
import api from "../../../services/api";


const Signals: React.FC = () => {
    const [assets, setAssets] = useState<{ [key: string]: { open: boolean } } | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchAssets = async () => {
            try {
                const data = await api.getAssets();
                setAssets(data.activos); // Asegúrate de que el backend devuelve "activos"
            } catch (error) {
                console.error("Error al obtener los activos:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAssets();
    }, []);

    if (loading) {
        return <div>Cargando activos...</div>;
    }

    if (!assets) {
        return <div>No se encontraron activos disponibles.</div>;
    }

    return (
        <div className="bg-white shadow p-4 rounded">
            <h2 className="text-xl font-bold mb-4">Señales y Activos</h2>
            <ul className="divide-y divide-gray-200">
                {Object.keys(assets).map((key) => (
                    <li key={key} className="py-2 flex justify-between">
                        <span className="font-medium">{key}</span>
                        <span
                            className={`${
                                assets[key].open ? "text-green-500" : "text-red-500"
                            } font-semibold`}
                        >
                            {assets[key].open ? "Abierto" : "Cerrado"}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Signals;
