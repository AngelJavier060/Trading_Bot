"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/charts";
import { Card, DataTable, Kpi, Num, PageHead, Signed } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, num, SIDES } from "@/lib/format";
import { useSystem } from "@/lib/system";
import type { Position, SymbolState } from "@/lib/types";

interface Mt5Stats { connected?: boolean; trades: number; wins: number; losses: number; win_rate: number; net_profit: number; profit_factor: number; today?: string }

export default function ResumenPage() {
  const { live } = useSystem();
  const [stats, setStats] = useState<Mt5Stats | null>(null);
  const [equity, setEquity] = useState<{ time: number; value: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!live?.mt5.connected) {
        if (alive) { setStats(null); setEquity([]); }
        return;
      }
      const [s, e] = await Promise.all([
        api<Mt5Stats>("/api/mt5/history-stats?days=30"),
        api<{ points: { ts: string; equity: number }[] }>("/api/equity?days=30"),
      ]);
      if (!alive) return;
      setStats(s.connected === false ? null : s);
      setEquity(e.points.map((p) => ({ time: Math.floor(new Date(p.ts).getTime() / 1000), value: p.equity })));
    };
    load().catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [live?.mt5.connected]);

  const acc = live?.mt5.account;
  const bot = live?.bot;
  const connected = Boolean(live?.mt5.connected && acc);
  const positions = connected ? (bot?.open_positions || []) : [];
  const floating = positions.reduce((s, p) => s + p.profit, 0);
  const dayPnl = connected && bot?.day_start_equity ? acc!.equity - bot.day_start_equity : null;
  const m30 = stats;
  const none = "Sin conexión";

  return (
    <>
      <PageHead title="Resumen">
        Balance, equity y posiciones salen de account_info() y positions_get() de MT5. Si no hay conexión no se inventan números.
      </PageHead>
      <div className="kpis">
        <Kpi label="Balance" value={connected ? num(acc!.balance) : none} sub={connected ? acc!.currency : "—"} />
        <Kpi label="Equity" value={connected ? num(acc!.equity) : none} sub={connected ? <>flotante <Num value={floating} /></> : "—"} />
        <Kpi label="P&L del día" value={!connected ? none : dayPnl === null ? "—" : <Signed value={dayPnl} />} sub={connected ? "equity ahora vs inicio del día" : "—"} />
        <Kpi label="Posiciones" value={connected ? positions.length : none} sub={connected ? "positions_get de MT5" : "—"} />
        <Kpi label="Win rate (historial MT5 30 d)" value={connected && m30?.trades ? `${num(m30.win_rate, 1)} %` : (connected ? "—" : none)} sub={connected ? `${m30?.trades ?? 0} deals de cierre` : "—"} />
        <Kpi label="Profit factor 30 d" value={connected && m30?.trades ? num(m30.profit_factor) : (connected ? "—" : none)} sub={connected ? <>neto <Signed value={m30?.net_profit} /></> : "—"} />
        <Kpi label="Neto historial MT5" value={!connected ? none : m30 ? <Signed value={m30.net_profit} /> : "—"} sub={connected && m30 ? `${m30.wins} ganadas · ${m30.losses} perdidas` : "—"} />
      </div>

      <Card title="Equity (30 días)">
        {equity.length > 1 ? <LineChart points={equity} label="Curva de equity de 30 días" />
          : <div className="empty">Todavía no hay datos de equity: se registran cada minuto con el bot en marcha.</div>}
      </Card>

      <div className="grid2">
        <Card title="Posiciones abiertas (MT5)">
          <DataTable<Position>
            rows={positions}
            rowKey={(p) => p.ticket}
            empty={connected ? "Sin posiciones abiertas en el terminal." : "Sin conexión: no hay posiciones que mostrar."}
            columns={[
              { title: "Símbolo", render: (p) => p.symbol },
              { title: "Lado", render: (p) => SIDES[p.side] },
              { title: "Lotes", numeric: true, render: (p) => num(p.volume) },
              { title: "Entrada", numeric: true, render: (p) => p.price_open },
              { title: "SL", numeric: true, render: (p) => p.sl || "—" },
              { title: "TP", numeric: true, render: (p) => p.tp || "—" },
              { title: "P&L", numeric: true, render: (p) => <Signed value={p.profit} /> },
              { title: "Desde", render: (p) => dateTime(p.time_open) },
            ]}
          />
        </Card>
        <Card title="Último análisis por símbolo">
          <DataTable<[string, SymbolState]>
            rows={Object.entries(bot?.symbols || {})}
            rowKey={([s]) => s}
            empty="El bot no está analizando ningún símbolo. Configúralo en Estrategia."
            columns={[
              { title: "Símbolo", render: ([s]) => s },
              { title: "Vela", render: ([, st]) => dateTime(st.last_bar) },
              { title: "Señal", render: ([, st]) => st.last_signal ? `${st.last_signal.signal} (${num(st.last_signal.confidence, 0)} %)` : "—" },
              { title: "Decisión", wrap: true, render: ([, st]) => st.error ? <span className="neg">{st.error}</span> : st.last_decision || "—" },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
