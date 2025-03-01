import React from "react";

interface ReportTableProps {
  trades: Array<{
    id: number;
    pair: string;
    type: string;
    profit: number;
  }>;
}

const ReportTable: React.FC<ReportTableProps> = ({ trades }) => {
  return (
    <table className="table-auto w-full">
      <thead>
        <tr className="bg-gray-200">
          <th className="px-4 py-2">ID</th>
          <th className="px-4 py-2">Par</th>
          <th className="px-4 py-2">Tipo</th>
          <th className="px-4 py-2">Ganancia ($)</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade) => (
          <tr key={trade.id}>
            <td className="border px-4 py-2">{trade.id}</td>
            <td className="border px-4 py-2">{trade.pair}</td>
            <td className="border px-4 py-2">{trade.type}</td>
            <td
              className={`border px-4 py-2 ${
                trade.profit >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {trade.profit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default ReportTable;
