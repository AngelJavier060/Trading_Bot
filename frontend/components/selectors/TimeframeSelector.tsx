export default function TimeframeSelector() {
  const timeframes = ['1M', '5M', '15M', '1H'];

  return (
      <div>
          <h2 className="text-xl font-bold mb-2">Seleccione Temporalidades</h2>
          <div className="flex flex-wrap gap-2">
              {timeframes.map((tf) => (
                  <label key={tf} className="flex items-center">
                      <input type="checkbox" className="mr-2" />
                      {tf}
                  </label>
              ))}
          </div>
      </div>
  );
}
