"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, DataTable, DecisionBadge, Num, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, num, SIDES } from "@/lib/format";
import { useSystem } from "@/lib/system";
import type { Signal } from "@/lib/types";

export default function SenalesPage() {
  const { recentSignals } = useSystem();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api<{ signals: Signal[] }>("/api/signals?limit=500").then((r) => setSignals(r.signals)).catch(() => undefined);
  }, []);

  // las que llegan en vivo se suman arriba sin recargar
  const rows = useMemo(() => {
    const all = Array.from(new Map([...recentSignals, ...signals].map((s) => [s.id, s])).values()).sort((a, b) => b.id - a.id);
    return filter ? all.filter((s) => s.decision === filter) : all;
  }, [signals, recentSignals, filter]);

  return (
    <>
      <PageHead title="Señales">Todo lo que la estrategia propuso y qué decidió el sistema (se actualiza en vivo).</PageHead>
      <Card extra={`${rows.length} señales`}>
        <div className="toolbar">
          <div><label htmlFor="f">Decisión</label>
            <select id="f" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Todas</option>
              <option value="opened">Abiertas</option>
              <option value="dry_run">Simuladas</option>
              <option value="blocked">Bloqueadas</option>
              <option value="ml_filtered">Filtradas por ML</option>
              <option value="rejected">Rechazadas</option>
            </select></div>
        </div>
        <DataTable<Signal> rows={rows} rowKey={(s) => s.id} empty="Todavía no hay señales: inicia el bot en Estrategia." columns={[
          { title: "Hora", render: (s) => dateTime(s.ts) },
          { title: "Símbolo", render: (s) => s.symbol },
          { title: "Lado", render: (s) => SIDES[s.side] },
          { title: "Decisión", render: (s) => <DecisionBadge decision={s.decision} /> },
          { title: "Conf.", numeric: true, render: (s) => `${num(s.confidence, 0)} %` },
          { title: "ML", numeric: true, render: (s) => <Num value={s.ml_prob} /> },
          { title: "Lotes", numeric: true, render: (s) => <Num value={s.volume} /> },
          { title: "Entrada", numeric: true, render: (s) => s.entry ?? "—" },
          { title: "SL", numeric: true, render: (s) => s.sl ?? "—" },
          { title: "TP", numeric: true, render: (s) => s.tp ?? "—" },
          { title: "Motivo", wrap: true, render: (s) => s.reason || "" },
        ]} />
      </Card>
    </>
  );
}
