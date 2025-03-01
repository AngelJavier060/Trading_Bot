import React from "react";

interface AnalysisSummaryProps {
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    profit: number;
  };
}

const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({ summary }) => {
  return (
    <div>
      <h3>Total de Operaciones: {summary.totalTrades}</h3>
      <h3>Ganadas: {summary.wins}</h3>
      <h3>Perdidas: {summary.losses}</h3>
      <h3>Ganancia Neta: ${summary.profit}</h3>
    </div>
  );
};

export default AnalysisSummary;
