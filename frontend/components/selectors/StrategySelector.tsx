export default function StrategySelector() {
  const strategies = ['Estrategia A', 'Estrategia B', 'Estrategia C'];

  return (
      <div>
          <h2 className="text-xl font-bold mb-2">Seleccione Estrategias</h2>
          <div className="flex flex-wrap gap-2">
              {strategies.map((strategy) => (
                  <label key={strategy} className="flex items-center">
                      <input type="checkbox" className="mr-2" />
                      {strategy}
                  </label>
              ))}
          </div>
      </div>
  );
}
