"use client";

import { useEffect, useState } from "react";
import { Card, DataTable, Kpi, Num, PageHead, Signed } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, num, SIDES } from "@/lib/format";
import type { Trade, TradeStats } from "@/lib/types";

export default function OperacionesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [t, s] = await Promise.all([
        api<{ trades: Trade[] }>("/api/trades?limit=1000"),
        api<{ all: TradeStats }>("/api/stats"),
      ]);
      if (alive) { setTrades(t.trades); setStats(s.all); }
    };
    load().catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <>
      <PageHead title="Operaciones">Operaciones reales del bot en la cuenta conectada, con el resultado leído del historial de MT5.</PageHead>
      {stats && (
        <div className="kpis">
          <Kpi label="Operaciones cerradas" value={stats.trades} sub={`${stats.wins} ganadas · ${stats.losses} perdidas`} />
          <Kpi label="Win rate" value={stats.trades ? `${num(stats.win_rate, 1)} %` : "—"} />
          <Kpi label="Profit factor" value={stats.trades ? num(stats.profit_factor) : "—"} />
          <Kpi label="R medio" value={<Signed value={stats.avg_r} digits={3} />} />
          <Kpi label="Neto" value={<Signed value={stats.net_profit} />} />
        </div>
      )}
      <Card>
        <DataTable<Trade> rows={trades} rowKey={(t) => t.ticket} empty="Todavía no hay operaciones." columns={[
          { title: "Ticket", render: (t) => t.ticket },
          { title: "Símbolo", render: (t) => t.symbol },
          { title: "Lado", render: (t) => SIDES[t.side] },
          { title: "Lotes", numeric: true, render: (t) => num(t.volume) },
          { title: "Apertura", render: (t) => dateTime(t.open_time) },
          { title: "Precio", numeric: true, render: (t) => t.open_price ?? "—" },
          { title: "Cierre", render: (t) => (t.close_time ? dateTime(t.close_time) : <span className="badge dry_run">abierta</span>) },
          { title: "Salida", render: (t) => t.reason || "—" },
          { title: "Neto", numeric: true, render: (t) => <Signed value={t.net_profit} /> },
          { title: "R", numeric: true, render: (t) => <Signed value={t.r_multiple} /> },
          { title: "ML", numeric: true, render: (t) => <Num value={t.ml_prob} /> },
          { title: "Estrategia", render: (t) => t.strategy || "—" },
        ]} />
      </Card>
    </>
  );
}
