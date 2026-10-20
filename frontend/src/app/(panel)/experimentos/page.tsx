"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, DataTable, Num, PageHead, Signed } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Experiment, Metrics } from "@/lib/types";

const STATUS: Record<string, string> = { candidate: "candidato", promoted: "activa", rejected: "rechazado", info: "info" };

function metricsOf(e: Experiment): Partial<Metrics> & { auc?: number; samples?: number } {
  return (e.metrics.candidate || e.metrics) as Partial<Metrics> & { auc?: number; samples?: number };
}

async function fetchExperiments(): Promise<Experiment[]> {
  return (await api<{ experiments: Experiment[] }>("/api/experiments?limit=300")).experiments;
}

export default function ExperimentosPage() {
  const [items, setItems] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState<Experiment | null>(null);

  const load = useCallback(async () => setItems(await fetchExperiments()), []);

  useEffect(() => {
    let alive = true;
    fetchExperiments().then((xs) => { if (alive) setItems(xs); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function setStatus(id: number, status: string) {
    const exp = await api<Experiment>(`/api/experiments/${id}/status`, { body: { status } });
    setSelected(exp);
    await load();
  }

  return (
    <>
      <PageHead title="Experimentos">
        Cada prueba queda registrada. Un cambio se aprueba solo si mejora a la referencia fuera de muestra, con suficientes operaciones.
      </PageHead>
      <Card>
        <DataTable<Experiment> rows={items} rowKey={(e) => e.id} empty="Todavía no hay experimentos: lanza un walk-forward en Pruebas." columns={[
          { title: "#", render: (e) => e.id },
          { title: "Fecha", render: (e) => dateTime(e.created) },
          { title: "Tipo", render: (e) => e.kind },
          { title: "Nombre", wrap: true, render: (e) => e.name },
          { title: "Ops", numeric: true, render: (e) => metricsOf(e).total_trades ?? metricsOf(e).samples ?? "—" },
          { title: "PF", numeric: true, render: (e) => <Num value={metricsOf(e).profit_factor} /> },
          { title: "R medio", numeric: true, render: (e) => metricsOf(e).avg_r !== undefined ? <Signed value={metricsOf(e).avg_r} digits={3} />
            : metricsOf(e).auc !== undefined ? `AUC ${metricsOf(e).auc}` : "—" },
          { title: "DD %", numeric: true, render: (e) => <Num value={metricsOf(e).max_drawdown_pct} digits={1} /> },
          { title: "Veredicto", render: (e) => e.verdict ? (e.verdict.passed ? <span className="pos">✔ aprobado</span> : <span className="neg">✘ no aprobado</span>) : "—" },
          { title: "Estado", render: (e) => <span className={`badge ${e.status}`}>{STATUS[e.status] || e.status}</span> },
          { title: "", render: (e) => <button className="btn" onClick={() => setSelected(e)}>Ver</button> },
        ]} />
      </Card>
      {selected && (
        <Card title={`#${selected.id} ${selected.name}`} extra={`código ${selected.code_version || "—"}`}>
          {selected.verdict && (
            <ul className="checks">{selected.verdict.checks.map((c) => (
              <li key={c.check} className={c.passed ? "pos" : "neg"}>{c.passed ? "✔" : "✘"} {c.check}: {c.detail}</li>))}</ul>
          )}
          <div className="actions">
            <button className="btn" onClick={() => setStatus(selected.id, "promoted")}>Marcar como activa</button>
            <button className="btn danger" onClick={() => setStatus(selected.id, "rejected")}>Rechazar</button>
          </div>
          <pre>{JSON.stringify({ periodo: [selected.period_start, selected.period_end], config: selected.config, metricas: selected.metrics }, null, 2)}</pre>
        </Card>
      )}
    </>
  );
}
