export default function MarketTypeSelector() {
  return (
      <div>
          <h2 className="text-xl font-bold mb-2">Seleccione Tipo de Mercado</h2>
          <select className="p-2 border rounded w-full">
              <option value="Binarias">Binarias</option>
              <option value="OTC">OTC</option>
          </select>
      </div>
  );
}
