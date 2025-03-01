import React from "react";
import { Button, Typography, Divider } from "@mui/material";

interface BacktestingControlsProps {
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    profit: number;
  } | null;
}

const BacktestingControls: React.FC<BacktestingControlsProps> = ({
  onStart,
  onPause,
  onStop,
  summary,
}) => {
  return (
    <div>
      <div className="flex gap-4 mb-4">
        <Button variant="contained" color="primary" onClick={onStart}>
          Iniciar
        </Button>
        <Button variant="contained" color="warning" onClick={onPause}>
          Pausar
        </Button>
        <Button variant="contained" color="error" onClick={onStop}>
          Detener
        </Button>
      </div>
      <Divider className="my-4" />
      {summary && (
        <div>
          <Typography variant="subtitle1">
            Total de Operaciones: <strong>{summary.totalTrades}</strong>
          </Typography>
          <Typography variant="subtitle1">
            Ganadas: <strong>{summary.wins}</strong>
          </Typography>
          <Typography variant="subtitle1">
            Perdidas: <strong>{summary.losses}</strong>
          </Typography>
          <Typography variant="subtitle1" color={summary.profit >= 0 ? "green" : "red"}>
            Ganancia Neta: <strong>${summary.profit}</strong>
          </Typography>
        </div>
      )}
    </div>
  );
};

export default BacktestingControls;
