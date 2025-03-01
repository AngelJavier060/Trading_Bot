import React, { useState } from "react";
import { Button, FormControl, InputLabel, MenuItem, Select, Checkbox, ListItemText } from "@mui/material";

interface ConfigurationFormProps {
  onSubmit: (config: any) => void;
}

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({ onSubmit }) => {
  const [strategy, setStrategy] = useState("");
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);

  const handleSubmit = () => {
    const config = {
      strategy,
      timeframes,
      markets,
    };
    onSubmit(config);
  };

  const timeframesOptions = ["1m", "5m", "15m", "30m", "1h"];
  const marketsOptions = ["Binarias", "OTC"];

  return (
    <div>
      {/* Estrategia */}
      <FormControl fullWidth className="mb-4">
        <InputLabel id="strategy-label">Estrategia</InputLabel>
        <Select
          labelId="strategy-label"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
        >
          <MenuItem value="Simple EMA">Simple EMA</MenuItem>
          <MenuItem value="RSI Divergence">RSI Divergence</MenuItem>
          <MenuItem value="MACD Crossover">MACD Crossover</MenuItem>
        </Select>
      </FormControl>

      {/* Timeframe */}
      <FormControl fullWidth className="mb-4">
        <InputLabel id="timeframe-label">Timeframes</InputLabel>
        <Select
          labelId="timeframe-label"
          multiple
          value={timeframes}
          onChange={(e) => setTimeframes(e.target.value as string[])}
          renderValue={(selected) => selected.join(", ")}
        >
          {timeframesOptions.map((timeframe) => (
            <MenuItem key={timeframe} value={timeframe}>
              <Checkbox checked={timeframes.includes(timeframe)} />
              <ListItemText primary={timeframe} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Mercado */}
      <FormControl fullWidth className="mb-4">
        <InputLabel id="market-label">Mercado</InputLabel>
        <Select
          labelId="market-label"
          multiple
          value={markets}
          onChange={(e) => setMarkets(e.target.value as string[])}
          renderValue={(selected) => selected.join(", ")}
        >
          {marketsOptions.map((market) => (
            <MenuItem key={market} value={market}>
              <Checkbox checked={markets.includes(market)} />
              <ListItemText primary={market} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Botón de Enviar */}
      <Button variant="contained" color="primary" onClick={handleSubmit} fullWidth>
        Iniciar Backtesting
      </Button>
    </div>
  );
};

export default ConfigurationForm;


