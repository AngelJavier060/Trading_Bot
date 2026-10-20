"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, DataTable, Message, Num, PageHead, Signed } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Metrics, StrategyInfo } from "@/lib/types";

interface Job { id: string; kind: string; status: string; created: string; error?: string; result?: unknown }
interface WfResult {
  experiment_id: number;
  verdict: { passed: boolean; checks: { check: string; passed: boolean; detail: string }[] };
  candidate: Metrics;
  baseline: Metrics;
}

const TFS = ["M5", "M15", "M30", "H1", "H4"];

export default function PruebasPage() {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [detail, setDetail] = useState<Job | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });
  const [wf, setWf] = useState({
    symbol: "EURUSD", timeframe: "H1", strategy: "macd", mode: "fixed", days: 730,
    windows: "180/60", grid: "sl_atr_mult=1,1.5,2;tp_atr_mult=1.5,2.5,3.5", threshold: 0.5,
  });
  const [rcDays, setRcDays] = useState(14);
  const [tester, setTester] = useState({ symbol: "EURUSD", timeframe: "H1", strategy: "macd", days: 365 });
  const [importName, setImportName] = useState("");

  const loadJobs = useCallback(async () => {
    const r = await api<{ jobs: Job[] }>("/api/jobs");
    setJobs(r.jobs);
    return r.jobs;
  }, []);

  useEffect(() => {
    api<{ strategies: StrategyInfo[] }>("/api/strategies").then((r) => setStrategies(r.strategies)).catch(() => undefined);
    let alive = true;
    const tick = async () => {
      const js = await loadJobs().catch(() => [] as Job[]);
      if (alive) setTimeout(tick, js.some((j) => j.status === "running" || j.status === "queued") ? 3000 : 15000);
    };
    tick();
    return () => { alive = false; };
  }, [loadJobs]);

  const runWalkforward = async () => {
    const [train, test] = wf.windows.split("/").map(Number);
    try {
      await api("/api/jobs/walkforward", { body: {
        symbol: wf.symbol, timeframe: wf.timeframe, strategy: wf.strategy, mode: wf.mode, days: wf.days,
        train_days: train, test_days: test, grid: wf.grid, ml_threshold: wf.threshold,
      } });
      setMsg({ text: "Walk-forward lanzado.", kind: "ok" });
      await loadJobs();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: "err" });
    }
  };

  const runMt5Tester = async () => {
    try {
      await api("/api/jobs/mt5-tester", { body: {
        symbol: tester.symbol, timeframe: tester.timeframe, strategy: tester.strategy, days: tester.days,
      } });
      setMsg({ text: "Envío al Probador de MT5 lanzado. Cuando termine la tarea, mira el resultado abajo.", kind: "ok" });
      await loadJobs();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: "err" });
    }
  };

  const importMt5Tester = async () => {
    try {
      await api("/api/jobs/mt5-tester-import", { body: { name: importName.trim() } });
      setMsg({ text: "Importación lanzada.", kind: "ok" });
      await loadJobs();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: "err" });
    }
  };

  const runReconcile = async () => {
    try {
      await api("/api/jobs/reconcile", { body: { days: rcDays } });
      setMsg({ text: "Comparación lanzada.", kind: "ok" });
      await loadJobs();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: "err" });
    }
  };

  const openJob = async (id: string) => {
    setDetail(await api<Job>(`/api/jobs/${id}`));
  };

  const r = detail?.result as WfResult | undefined;

  return (
    <div>
      <PageHead title="Pruebas">Evaluación objetiva: cada prueba se registra en Experimentos con su veredicto.</PageHead>
      <div className="grid2">
        <Card title="Walk-forward">
          <p className="muted small">Aprende en una ventana y mide en la siguiente que no vio. Se compara con la referencia en las mismas ventanas.</p>
          <div className="fields">
            <div><label htmlFor="ws">Símbolo</label><input id="ws" value={wf.symbol} onChange={(e) => setWf({ ...wf, symbol: e.target.value })} /></div>
            <div>
              <label htmlFor="wt">Timeframe</label>
              <select id="wt" value={wf.timeframe} onChange={(e) => setWf({ ...wf, timeframe: e.target.value })}>
                {TFS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="wst">Estrategia</label>
              <select id="wst" value={wf.strategy} onChange={(e) => setWf({ ...wf, strategy: e.target.value })}>
                {strategies.map((s) => <option key={s.id} value={s.id}>{s.catalog.nombre}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="wm">Modo</label>
              <select id="wm" value={wf.mode} onChange={(e) => setWf({ ...wf, mode: e.target.value })}>
                <option value="fixed">Fijo (la estrategia tal cual)</option>
                <option value="optimize">Optimizar SL/TP</option>
                <option value="ml">Filtro ML</option>
              </select>
            </div>
            <div><label htmlFor="wd">Días de historia</label><input id="wd" type="number" value={wf.days} onChange={(e) => setWf({ ...wf, days: Number(e.target.value) })} /></div>
            <div><label htmlFor="ww">Entreno / prueba (días)</label><input id="ww" value={wf.windows} onChange={(e) => setWf({ ...wf, windows: e.target.value })} /></div>
          </div>
          {wf.mode === "optimize" ? (
            <div>
              <label htmlFor="wg">Rejilla</label>
              <input id="wg" value={wf.grid} onChange={(e) => setWf({ ...wf, grid: e.target.value })} />
            </div>
          ) : null}
          {wf.mode === "ml" ? (
            <div>
              <label htmlFor="wth">Umbral ML</label>
              <input id="wth" type="number" step="0.01" value={wf.threshold} onChange={(e) => setWf({ ...wf, threshold: Number(e.target.value) })} />
            </div>
          ) : null}
          <div className="actions"><button className="btn primary" onClick={runWalkforward}>Lanzar</button></div>
        </Card>
        <Card title="Probador de MT5">
          <p className="muted small">
            Esta pestaña manda las entradas de la estrategia al experto TradeBotReplay.
            En MT5 no lo pongas en un gráfico: ábrelo en el Probador de estrategias (Ctrl+R).
            El periodo por defecto es un año hacia atrás. Si el experto no aparece, en el backend:
            python scripts/mt5_tester.py install
          </p>
          <div className="fields">
            <div><label htmlFor="ts">Símbolo</label><input id="ts" value={tester.symbol} onChange={(e) => setTester({ ...tester, symbol: e.target.value })} /></div>
            <div>
              <label htmlFor="tt">Timeframe</label>
              <select id="tt" value={tester.timeframe} onChange={(e) => setTester({ ...tester, timeframe: e.target.value })}>
                {TFS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tst">Estrategia</label>
              <select id="tst" value={tester.strategy} onChange={(e) => setTester({ ...tester, strategy: e.target.value })}>
                {strategies.map((s) => <option key={s.id} value={s.id}>{s.catalog.nombre}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tdt">Días (un año = 365)</label>
              <input id="tdt" type="number" value={tester.days} onChange={(e) => setTester({ ...tester, days: Number(e.target.value) })} />
            </div>
          </div>
          <div className="actions"><button className="btn primary" onClick={runMt5Tester}>Enviar al Probador</button></div>
          <label htmlFor="imn">Nombre de la repetición (para importar)</label>
          <input id="imn" value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="EURUSD-T_H1_macd_…" />
          <div className="actions">
            <button className="btn" onClick={importMt5Tester} disabled={!importName.trim()}>Importar resultado</button>
          </div>
        </Card>
        <Card title="Vivo contra backtest">
          <p className="muted small">Repite el backtest sobre lo que operó el bot y compara señal por señal y operación por operación.</p>
          <label htmlFor="rd">Días</label>
          <input id="rd" type="number" value={rcDays} onChange={(e) => setRcDays(Number(e.target.value))} />
          <div className="actions"><button className="btn primary" onClick={runReconcile}>Comparar</button></div>
        </Card>
      </div>
      <Message text={msg.text} kind={msg.kind} />
      <Card title="Tareas">
        <DataTable<Job> rows={jobs} rowKey={(j) => j.id} empty="Sin tareas." columns={[
          { title: "Tarea", render: (j) => j.kind },
          { title: "Inicio", render: (j) => dateTime(j.created) },
          { title: "Estado", render: (j) => j.status === "error" ? <span className="neg">error</span> : j.status },
          { title: "", render: (j) => (j.status === "done" || j.status === "error") ? <button className="btn" onClick={() => openJob(j.id)}>Ver</button> : null },
        ]} />
      </Card>
      {detail ? (
        <Card title={`Resultado: ${detail.kind}`}>
          {detail.error ? <p className="msg err">{detail.error}</p> : null}
          {r?.verdict ? (
            <div>
              <p>
                <b>Experimento #{r.experiment_id}: </b>
                {r.verdict.passed ? <span className="pos">aprobado</span> : <span className="neg">no aprobado</span>}
              </p>
              <ul className="checks">
                {r.verdict.checks.map((c) => (
                  <li key={c.check} className={c.passed ? "pos" : "neg"}>{c.passed ? "✔" : "✘"} {c.check}: {c.detail}</li>
                ))}
              </ul>
              <DataTable
                rows={[["Candidato", r.candidate], ["Referencia", r.baseline]] as [string, Metrics][]}
                rowKey={(x) => x[0]}
                empty=""
                columns={[
                  { title: "", render: (x) => x[0] },
                  { title: "Ops", numeric: true, render: (x) => x[1].total_trades },
                  { title: "Win %", numeric: true, render: (x) => <Num value={x[1].win_rate} digits={1} /> },
                  { title: "PF", numeric: true, render: (x) => <Num value={x[1].profit_factor} /> },
                  { title: "R medio", numeric: true, render: (x) => <Signed value={x[1].avg_r} digits={3} /> },
                  { title: "Neto", numeric: true, render: (x) => <Signed value={x[1].net_profit} /> },
                  { title: "DD %", numeric: true, render: (x) => <Num value={x[1].max_drawdown_pct} digits={1} /> },
                  { title: "P(ventaja)", numeric: true, render: (x) => <Num value={x[1].bootstrap?.prob_edge} /> },
                ]}
              />
            </div>
          ) : detail.result ? <pre>{JSON.stringify(detail.result, null, 2).slice(0, 20000)}</pre> : null}
        </Card>
      ) : null}
    </div>
  );
}
