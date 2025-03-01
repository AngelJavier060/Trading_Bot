export default function AccountTypeSelector() {
  return (
      <div>
          <h2 className="text-xl font-bold mb-2">Seleccione Tipo de Cuenta</h2>
          <select className="p-2 border rounded w-full">
              <option value="Real">Real</option>
              <option value="Demo">Demo</option>
              <option value="Torneo">Torneo</option>
          </select>
      </div>
  );
}
