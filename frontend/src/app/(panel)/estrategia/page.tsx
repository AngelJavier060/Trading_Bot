"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LineChart } from "@/components/charts";
import { Card, DataTable, Message, Num, PageHead, Signed } from "@/components/ui";
import { api, waitJob } from "@/lib/api";
import { num } from "@/lib/format";
import { saveLastBacktest, type BacktestTradeView } from "@/lib/backtest-view";
import { useSystem } from "@/lib/system";
import type { BotConfig, Metrics, ModelInfo, RiskLimits, StrategyInfo, StrategyParams } from "@/lib/types";

const EXIT_FIELDS: [keyof StrategyParams, string, string?][] = [
  ["sl_atr_mult", "Stop loss (múltiplos de ATR)", "0.1"],
  ["tp_atr_mult", "Take profit (múltiplos de ATR, 0 = sin TP)", "0.1"],
  ["max_bars_in_trade", "Cierre por tiempo (velas, 0 = no)"],
  ["min_sl_spread_mult", "SL mínimo (veces el spread)", "0.5"],
  ["min_confidence", "Confianza mínima de la señal (%)"],
  ["atr_period", "Periodo del ATR"],
];
const RISK_FIELDS: [keyof RiskLimits, string, string?][] = [
  ["risk_per_trade_pct", "Riesgo por operación (% del balance)", "0.05"],
  ["max_daily_loss_pct", "Pérdida diaria máxima (%)", "0.5"],
  ["max_open_positions", "Posiciones abiertas máximas"],
  ["max_trades_per_day", "Operaciones máximas por día"],
  ["max_spread_points", "Spread máximo (puntos, 0 = sin límite)"],
];
const TIMEFRAMES = ["M5", "M15", "M30", "H1", "H4"];

function verdictText(m: Metrics) {
  if (!m.total_trades) return "Sin operaciones: prueba M5 y más días, o relaja el filtro de ATR.";
  if (m.profit_factor >= 1.3 && m.net_profit > 0) return "Bien en esta muestra; confirma con walk-forward o el Probador.";
  if (m.net_profit > 0) return "Gana poco o irregular: toca ajustar rango, RR o horas.";
  return "Malo en esta muestra: ajusta filtros o descarta esta configuración.";
}

interface BacktestResult {
  config: { params: StrategyParams };
  metrics: Metrics;
  equity_curve?: { time: string; equity: number }[];
  trades?: BacktestTradeView[];
}

export default function EstrategiaPage() {
  const { live, refresh } = useSystem();
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [symbolsText, setSymbolsText] = useState("");
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });
  const [testDays, setTestDays] = useState(365);
  const [testRows, setTestRows] = useState<{ label: string; m: Metrics }[]>([]);
  const [testPath, setTestPath] = useState<{ time: number; value: number }[]>([]);
  const [cmpDays, setCmpDays] = useState(365);
  const [cmpRows, setCmpRows] = useState<{ id: string; m: Metrics }[] | null>(null);
  const [cmpMsg, setCmpMsg] = useState("");

  useEffect(() => {
    (async () => {
      const [s, saved, defs, m] = await Promise.all([
        api<{ strategies: StrategyInfo[] }>("/api/strategies"),
        api<{ config: BotConfig | null }>("/api/bot/config"),
        api<{ params: StrategyParams; limits: RiskLimits }>("/api/defaults"),
        api<{ models: ModelInfo[] }>("/api/models"),
      ]);
      setStrategies(s.strategies);
      setModels(m.models);
      let c = saved.config;
      if (!c) {
        const first = s.strategies.find((x) => x.id === "macd") || s.strategies[0];
        c = { symbols: ["EURUSD"], params: { ...defs.params, strategy: first.id, timeframe: "H1", strategy_params: { ...first.params } },
          limits: { ...defs.limits }, poll_seconds: 10, dry_run: false };
      }
      // completar parámetros que falten (configuraciones guardadas antes o parciales) con los de la estrategia
      const st = s.strategies.find((x) => x.id === c!.params.strategy);
      if (st) c = { ...c, params: { ...c.params, strategy_params: { ...st.params, ...(c.params.strategy_params || {}) } } };
      setCfg(c);
      setSymbolsText(c.symbols.join(", "));
    })().catch((e) => setMsg({ text: e.message, kind: "err" }));
  }, []);

  if (!cfg) return <><PageHead title="Estrategia" /><Message text={msg.text || "Cargando…"} kind={msg.kind} /></>;

  const p = cfg.params;
  const st = strategies.find((x) => x.id === p.strategy);
  const running = live?.bot.running;

  const setParam = <K extends keyof StrategyParams>(k: K, v: StrategyParams[K]) => setCfg({ ...cfg, params: { ...p, [k]: v } });
  const setLimit = <K extends keyof RiskLimits>(k: K, v: RiskLimits[K]) => setCfg({ ...cfg, limits: { ...cfg.limits, [k]: v } });
  const setSP = (k: string, v: number | boolean) => setCfg({ ...cfg, params: { ...p, strategy_params: { ...p.strategy_params, [k]: v } } });

  function pick(id: string) {
    const s = strategies.find((x) => x.id === id);
    if (!s || !cfg) return;
    const tf = s.catalog.timeframes.includes(cfg.params.timeframe)
      ? cfg.params.timeframe
      : (s.catalog.timeframes[0] || cfg.params.timeframe);
    setCfg({ ...cfg, params: { ...cfg.params, strategy: id, timeframe: tf, strategy_params: { ...s.params }, ml_model: "", htf_timeframe: null } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function current(): BotConfig {
    return { ...cfg!, symbols: symbolsText.split(",").map((x) => x.trim()).filter(Boolean) };
  }

  async function save(start: boolean) {
    const body = current();
    try {
      if (start) {
        const acc = live?.mt5.account;
        if (!live?.mt5.connected) {
          setMsg({ text: "Sin conexión a MT5: no se arranca el bot ni se inventan datos.", kind: "err" });
          return;
        }
        if (!body.dry_run && acc?.mode === "real") {
          const ok = window.confirm(
            `CUENTA REAL ${acc.login} @ ${acc.server}.\nSe enviarán órdenes con order_send a esta cuenta Admiral.\n¿Confirmas?`,
          );
          if (!ok) return;
        }
        await api("/api/bot/start", { body: { ...body, confirm_real: acc?.mode === "real" } });
        setMsg({ text: body.dry_run
          ? "Bot en marcha: solo anota señales. El recorrido se ve en Gráfico (no en el Probador de MT5)."
          : "Bot en marcha: las órdenes van a la cuenta. El recorrido se ve en Gráfico, no en el Probador.", kind: "ok" });
      } else {
        await api("/api/bot/config", { body });
        setMsg({ text: "Configuración guardada.", kind: "ok" });
      }
      await refresh();
    } catch (e) { setMsg({ text: (e as Error).message, kind: "err" }); }
  }

  async function stop() {
    await api("/api/bot/stop", { body: {} });
    await refresh();
    setMsg({ text: "Bot detenido.", kind: "ok" });
  }

  async function test() {
    const c = current();
    setTestRows([]);
    setTestPath([]);
    try {
      const rows: { label: string; m: Metrics }[] = [];
      for (const symbol of c.symbols) {
        setMsg({ text: `Backtest de ${symbol} con histórico de MT5…` });
        const job = await api<{ id: string }>("/api/jobs/backtest", {
          body: { symbol, timeframe: c.params.timeframe, strategy: c.params.strategy, days: testDays,
            params: c.params, limits: c.limits, include_trades: true } });
        const r = await waitJob<{ results: BacktestResult[] }>(job.id);
        const one = r.results[0];
        rows.push({ label: `${symbol} · ${testDays} días`, m: one.metrics });
        setTestRows([...rows]);
        const curve = one.equity_curve || [];
        if (curve.length) {
          setTestPath(curve.map((p) => ({ time: Math.floor(new Date(p.time).getTime() / 1000), value: p.equity })));
        }
        saveLastBacktest({
          symbol, timeframe: c.params.timeframe, days: testDays, metrics: one.metrics,
          trades: one.trades || [], equity_curve: curve,
        });
      }
      setMsg({ text: "Backtest listo. Abre Gráfico → Recorrido backtest para ver cada ganada y perdida en las velas.", kind: "ok" });
    } catch (e) { setMsg({ text: (e as Error).message, kind: "err" }); }
  }

  async function sendToTester() {
    const c = current();
    const symbol = c.symbols[0];
    if (!symbol) {
      setMsg({ text: "Indica al menos un símbolo.", kind: "err" });
      return;
    }
    try {
      setMsg({ text: `Preparando entradas de ${symbol} para el Probador de MT5…` });
      const job = await api<{ id: string }>("/api/jobs/mt5-tester", {
        body: {
          symbol, timeframe: c.params.timeframe, strategy: c.params.strategy, days: testDays,
          params: c.params, limits: c.limits,
        },
      });
      const r = await waitJob<{ message: string; name?: string; mode?: string }>(job.id);
      if (r.name) setMsg({ text: `${r.message} Nombre para importar: ${r.name}`, kind: "ok" });
      else setMsg({ text: r.message, kind: "ok" });
    } catch (e) { setMsg({ text: (e as Error).message, kind: "err" }); }
  }

  async function validate() {
    const c = current();
    try {
      for (const symbol of c.symbols) {
        await api("/api/jobs/walkforward", { body: {
          symbol, timeframe: c.params.timeframe, strategy: c.params.strategy, mode: c.params.ml_model ? "ml" : "fixed",
          days: 730, train_days: 180, test_days: 60, params: { ...c.params, ml_model: "" }, limits: c.limits,
          ml_threshold: c.params.ml_threshold } });
      }
      setMsg({ text: `Validación lanzada para ${c.symbols.length} símbolo(s). Tarda unos minutos: mira Pruebas y Experimentos.`, kind: "ok" });
    } catch (e) { setMsg({ text: (e as Error).message, kind: "err" }); }
  }

  async function compareAll() {
    const c = current();
    const symbol = c.symbols[0] || "EURUSD";
    setCmpRows(null);
    setCmpMsg(`Probando las 7 estrategias en ${symbol} ${c.params.timeframe}, ${cmpDays} días (1-3 min)…`);
    try {
      const job = await api<{ id: string }>("/api/jobs/backtest", { body: {
        symbol, timeframe: c.params.timeframe, strategy: "all", days: cmpDays, include_trades: false, limits: c.limits,
        params: { sl_atr_mult: p.sl_atr_mult, tp_atr_mult: p.tp_atr_mult, max_bars_in_trade: p.max_bars_in_trade,
          min_sl_spread_mult: p.min_sl_spread_mult } } });
      const r = await waitJob<{ results: BacktestResult[] }>(job.id);
      setCmpRows(r.results.map((x) => ({ id: x.config.params.strategy, m: x.metrics }))
        .sort((a, b) => b.m.profit_factor - a.m.profit_factor));
      setCmpMsg(`${symbol} ${c.params.timeframe} · ${cmpDays} días (dentro de muestra: orienta, no aprueba)`);
    } catch (e) { setCmpMsg((e as Error).message); }
  }

  const name = (id: string) => strategies.find((x) => x.id === id)?.catalog.nombre || id;
  const fitModels = models.filter((m) => !m.strategy || m.strategy === p.strategy);

  return (
    <>
      <PageHead title="Estrategia">Elige la estrategia, ajústala y arranca el bot contra la cuenta de MT5 (Admiral). El backtest de abajo es una prueba histórica, no el saldo de la cuenta.</PageHead>
      <div className="split">
        <div>
          <Card title="1. Elige la estrategia">
            <div style={{ display: "grid", gap: 8 }}>
              {strategies.map((s) => (
                <button key={s.id} type="button" onClick={() => pick(s.id)} className="card"
                  style={{ textAlign: "left", cursor: "pointer", marginBottom: 0, font: "inherit", color: "inherit",
                    borderColor: s.id === p.strategy ? "var(--accent)" : undefined,
                    boxShadow: s.id === p.strategy ? "0 0 0 1px var(--accent) inset" : undefined }}>
                  <b>{s.catalog.nombre}</b>
                  <div className="muted small">{s.catalog.tipo} · recomendada en {s.catalog.timeframes.join(", ")}</div>
                  <div className={`small ${s.last_evaluation ? (s.last_evaluation.passed ? "pos" : "neg") : "muted"}`}>
                    {s.last_evaluation
                      ? `${s.last_evaluation.passed ? "✔ aprobada" : "✘ no aprobada"} · PF ${num(s.last_evaluation.profit_factor)} · ${s.last_evaluation.trades} ops (exp. #${s.last_evaluation.experiment})`
                      : "Sin validar todavía"}
                  </div>
                </button>
              ))}
            </div>
          </Card>
          <Card title="¿Cuál funciona mejor?">
            <p className="muted small">Prueba todas con el primer símbolo, el timeframe y las salidas actuales.</p>
            <label htmlFor="cd">Días de historia</label>
            <input id="cd" type="number" value={cmpDays} onChange={(e) => setCmpDays(Number(e.target.value))} />
            <div className="actions"><button className="btn" onClick={compareAll}>Comparar todas</button></div>
            <Message text={cmpMsg} />
            {cmpRows && (
              <DataTable rows={cmpRows} rowKey={(r) => r.id} empty="" columns={[
                { title: "Estrategia", render: (r) => name(r.id) },
                { title: "Ops", numeric: true, render: (r) => r.m.total_trades },
                { title: "PF", numeric: true, render: (r) => num(r.m.profit_factor) },
                { title: "R medio", numeric: true, render: (r) => <Signed value={r.m.avg_r} digits={3} /> },
                { title: "", render: (r) => <button className="btn" onClick={() => pick(r.id)}>Usar</button> },
              ]} />
            )}
          </Card>
        </div>

        <div>
          <Card title={`2. Configúrala · ${st?.catalog.nombre || p.strategy}`}>
            <p className="muted">{st?.catalog.como_funciona}</p>
            <fieldset><legend>Mercado</legend>
              <div className="fields">
                <div><label htmlFor="sy">Símbolos (separados por coma)</label>
                  <input id="sy" value={symbolsText} onChange={(e) => setSymbolsText(e.target.value)} /></div>
                <div><label htmlFor="tf">Timeframe</label>
                  <select id="tf" value={p.timeframe} onChange={(e) => setParam("timeframe", e.target.value)}>
                    {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
                  </select></div>
              </div>
            </fieldset>
            <fieldset><legend>Parámetros de la estrategia</legend>
              <div className="fields">
                {Object.entries(p.strategy_params || {}).map(([k, v]) => typeof v === "boolean" ? (
                  <label key={k} className="check"><input type="checkbox" checked={v} onChange={(e) => setSP(k, e.target.checked)} />
                    {st?.catalog.params[k] || k}</label>
                ) : (
                  <div key={k}><label htmlFor={`sp_${k}`}>{st?.catalog.params[k] || k}</label>
                    <input id={`sp_${k}`} type="number" step="any" value={v} onChange={(e) => setSP(k, Number(e.target.value))} /></div>
                ))}
              </div>
              <div className="actions"><button className="btn" type="button" onClick={() => st && setCfg({ ...cfg, params: { ...p, strategy_params: { ...st.params } } })}>Valores por defecto</button></div>
            </fieldset>
            <fieldset><legend>Salidas</legend>
              <div className="fields">
                {EXIT_FIELDS.map(([k, label, step]) => (
                  <div key={k}><label htmlFor={`p_${k}`}>{label}</label>
                    <input id={`p_${k}`} type="number" step={step || "1"} value={p[k] as number}
                      onChange={(e) => setParam(k, Number(e.target.value) as never)} /></div>
                ))}
              </div>
            </fieldset>
            <fieldset><legend>Riesgo</legend>
              <div className="fields">
                {RISK_FIELDS.map(([k, label, step]) => (
                  <div key={k}><label htmlFor={`l_${k}`}>{label}</label>
                    <input id={`l_${k}`} type="number" step={step || "1"} value={cfg.limits[k] as number}
                      onChange={(e) => setLimit(k, Number(e.target.value) as never)} /></div>
                ))}
              </div>
            </fieldset>
            <fieldset><legend>Filtro de Machine Learning</legend>
              <div className="fields">
                <div><label htmlFor="ml">Modelo</label>
                  <select id="ml" value={p.ml_model} onChange={(e) => setParam("ml_model", e.target.value)}>
                    <option value="">Sin filtro ML</option>
                    {fitModels.map((m) => <option key={m.id} value={m.id}>{m.id} (AUC {num(m.validation?.auc, 3)})</option>)}
                  </select></div>
                <div><label htmlFor="thr">Probabilidad mínima para operar</label>
                  <input id="thr" type="number" step="0.01" value={p.ml_threshold} onChange={(e) => setParam("ml_threshold", Number(e.target.value))} /></div>
              </div>
              <p className="hint">Solo modelos entrenados para esta estrategia (backend: scripts\train_model.py). Úsalo si el walk-forward en modo ML lo aprueba.</p>
            </fieldset>
            <fieldset><legend>Órdenes a MT5</legend>
              <div className="seg">
                <button type="button" className={!cfg.dry_run ? "on real" : ""} onClick={() => setCfg({ ...cfg, dry_run: false })}>Enviar order_send a la cuenta</button>
                <button type="button" className={cfg.dry_run ? "on" : ""} onClick={() => setCfg({ ...cfg, dry_run: true })}>Solo señales (no envía órdenes)</button>
              </div>
              <p className="hint">Por defecto se opera en la cuenta conectada (demo o real). Cuenta REAL exige ALLOW_REAL_ACCOUNT=true en .env y una confirmación. El botón Empezar del Probador de MT5 no mueve esta cuenta: es otra simulación del terminal.</p>
            </fieldset>
          </Card>

          <Card title="3. Pruébala y ponla en marcha">
            <label htmlFor="td">Días para el backtest (velas reales de MT5; la ejecución es de prueba, no es tu saldo)</label>
            <input id="td" type="number" value={testDays} onChange={(e) => setTestDays(Number(e.target.value))} style={{ maxWidth: 160 }} />
            <div className="actions">
              <button className="btn" onClick={test}>Probar (backtest rápido)</button>
              <button className="btn" onClick={sendToTester}>Enviar al Probador de MT5</button>
              <button className="btn" onClick={validate}>Validar (walk-forward 2 años)</button>
              <button className="btn" onClick={() => save(false)}>Guardar</button>
              {running
                ? <button className="btn danger" onClick={stop}>Detener bot</button>
                : <button className="btn primary" onClick={() => save(true)}>Empezar (órdenes a MT5)</button>}
            </div>
            <Message text={msg.text} kind={msg.kind} />
            <p className="hint"><Link href="/grafico">Ver recorrido en Gráfico</Link> (velas de tu cuenta). El Probador de MT5 no muestra el bot del panel.</p>
            {testPath.length > 1 && <LineChart points={testPath} label="Recorrido de equity del backtest" />}
            {testRows.length > 0 && (
              <>
                <DataTable rows={testRows} rowKey={(r) => r.label} empty="" columns={[
                  { title: "", render: (r) => r.label },
                  { title: "Ops", numeric: true, render: (r) => r.m.total_trades },
                  { title: "Ganadas", numeric: true, render: (r) => r.m.wins },
                  { title: "Perdidas", numeric: true, render: (r) => r.m.losses },
                  { title: "Win %", numeric: true, render: (r) => num(r.m.win_rate, 1) },
                  { title: "PF", numeric: true, render: (r) => num(r.m.profit_factor) },
                  { title: "R medio", numeric: true, render: (r) => <Signed value={r.m.avg_r} digits={3} /> },
                  { title: "Neto", numeric: true, render: (r) => <Signed value={r.m.net_profit} /> },
                  { title: "DD %", numeric: true, render: (r) => <Num value={r.m.max_drawdown_pct} digits={1} /> },
                  { title: "Veredicto", render: (r) => verdictText(r.m) },
                ]} />
                <p className="hint">Ganadas/perdidas y el neto te dicen si conviene ajustar horas, ATR o RR. El tamaño de lote sale del riesgo por operación.</p>
              </>
            )}
            <p className="hint">Resultados de validaciones: <Link href="/experimentos">Experimentos</Link>.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
