"use client";

import { useEffect, useMemo, useState } from "react";
import { CandleChart, LineChart, type Candle, type Marker } from "@/components/charts";
import { Card, DataTable, Kpi, Message, PageHead, Signed } from "@/components/ui";
import { api, waitJob } from "@/lib/api";
import { loadLastBacktest, saveLastBacktest, type BacktestTradeView, type LastBacktest } from "@/lib/backtest-view";
import { dateTime, num, SIDES } from "@/lib/format";
import { useSystem } from "@/lib/system";
import type { Metrics, Signal } from "@/lib/types";

const TIMEFRAMES = ["M5", "M15", "M30", "H1", "H4", "D1"];

function toUnix(iso: string) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function tradeMarkers(trades: BacktestTradeView[]): Marker[] {
  const out: Marker[] = [];
  for (const t of trades) {
    const win = t.net_profit > 0;
    const decision = win ? "win" : t.net_profit < 0 ? "loss" : "opened";
    const color = win ? "#16a34a" : t.net_profit < 0 ? "#dc2626" : "#64748b";
    const tag = win ? "GANADA" : t.net_profit < 0 ? "PERDIDA" : "0";
    out.push({
      time: toUnix(t.entry_time), side: t.side, decision, color,
      text: `${t.side === "buy" ? "C" : "V"} ${tag}`,
    });
    if (t.exit_time) {
      out.push({
        time: toUnix(t.exit_time), side: t.side, decision, color,
        text: `${t.exit_reason || "salida"} ${t.net_profit > 0 ? "+" : ""}${t.net_profit.toFixed(1)}`,
      });
    }
  }
  return out;
}

export default function GraficoPage() {
  const { live, connectMt5 } = useSystem();
  const botCfg = live?.bot.config;
  const [mode, setMode] = useState<"live" | "backtest">("backtest");
  const [symbol, setSymbol] = useState(botCfg?.symbols[0] || "EURUSD");
  const [timeframe, setTimeframe] = useState(botCfg?.params.timeframe || "H1");
  const [days, setDays] = useState(180);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [brokerSymbol, setBrokerSymbol] = useState("");
  const [bt, setBt] = useState<LastBacktest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveSignals, setLiveSignals] = useState<Signal[]>([]);

  useEffect(() => {
    const saved = loadLastBacktest();
    if (saved) {
      setBt(saved);
      setSymbol(saved.symbol);
      setTimeframe(saved.timeframe);
      setDays(saved.days);
      setMode("backtest");
    }
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    if (botCfg?.symbols[0]) setSymbol(botCfg.symbols[0]);
    if (botCfg?.params.timeframe) setTimeframe(botCfg.params.timeframe);
  }, [mode, botCfg?.symbols, botCfg?.params.timeframe]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const q = mode === "backtest" && bt
          ? `symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&from=${encodeURIComponent(bt.equity_curve[0]?.time?.slice(0, 10) || "")}&to=${encodeURIComponent((bt.equity_curve[bt.equity_curve.length - 1]?.time || "").slice(0, 10))}`
          : `symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&count=400&closed=0`;
        const c = await api<{ symbol: string; candles: Candle[] }>(`/api/mt5/candles?${q}`);
        if (!alive) return;
        setCandles(c.candles);
        setBrokerSymbol(c.symbol);
        setError("");
        if (mode === "live") {
          const s = await api<{ signals: Signal[] }>("/api/signals?limit=400");
          if (alive) setLiveSignals(s.signals);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const t = mode === "live" ? setInterval(load, 15_000) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [symbol, timeframe, mode, bt]);

  const markers = useMemo(() => {
    if (mode === "backtest" && bt) return tradeMarkers(bt.trades);
    return liveSignals.filter((s) => !brokerSymbol || s.symbol === brokerSymbol).map((s) => ({
      time: toUnix(s.bar_time), side: s.side, decision: s.decision,
      text: s.decision === "opened" ? `${s.side === "buy" ? "C" : "V"}` : s.decision,
    }));
  }, [mode, bt, liveSignals, brokerSymbol]);

  const equity = useMemo(() => {
    if (mode !== "backtest" || !bt) return [];
    return bt.equity_curve.map((p) => ({ time: toUnix(p.time), value: p.equity }));
  }, [mode, bt]);

  const symbols = Array.from(new Set([...(botCfg?.symbols || []), bt?.symbol, "EURUSD", "GBPUSD", "XAUUSD"].filter(Boolean) as string[]));

  async function runRecorrido() {
    const cfg = live?.bot.config;
    if (!cfg) {
      setError("Guarda primero una estrategia en el menú Estrategia.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const job = await api<{ id: string }>("/api/jobs/backtest", {
        body: {
          symbol, timeframe, strategy: cfg.params.strategy, days,
          params: cfg.params, limits: cfg.limits, include_trades: true,
        },
      });
      const r = await waitJob<{ results: { metrics: Metrics; trades: BacktestTradeView[]; equity_curve: LastBacktest["equity_curve"] }[] }>(job.id);
      const one = r.results[0];
      const view: LastBacktest = {
        symbol, timeframe, days, metrics: one.metrics,
        trades: one.trades || [], equity_curve: one.equity_curve || [],
      };
      saveLastBacktest(view);
      setBt(view);
      setMode("backtest");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const m = bt?.metrics;

  return (
    <>
      <PageHead title="Gráfico">
        Aquí se ve el recorrido del backtest: flecha verde = operación ganada, roja = perdida.
        Eso no aparece en el Probador de MT5 hasta que pulses «Enviar al Probador» en Estrategia.
      </PageHead>
      <div className="seg" style={{ maxWidth: 420, marginBottom: 12 }}>
        <button type="button" className={mode === "backtest" ? "on" : ""} onClick={() => setMode("backtest")}>Recorrido backtest</button>
        <button type="button" className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>Precio en vivo</button>
      </div>
      <Card>
        <div className="toolbar">
          <div><label htmlFor="sym">Símbolo</label>
            <input id="sym" list="syms" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
            <datalist id="syms">{symbols.map((s) => <option key={s} value={s} />)}</datalist></div>
          <div><label htmlFor="tfr">Timeframe</label>
            <select id="tfr" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select></div>
          {mode === "backtest" && (
            <div><label htmlFor="dy">Días</label>
              <input id="dy" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} /></div>
          )}
          {mode === "backtest" && (
            <button className="btn primary" disabled={busy} onClick={runRecorrido}>
              {busy ? "Calculando recorrido…" : "Ver ganadas y perdidas"}
            </button>
          )}
        </div>
        <Message text={error} kind="err" />
        {error && error.toLowerCase().includes("conect") && (
          <div className="actions">
            <button className="btn" onClick={() => connectMt5().catch((e) => setError((e as Error).message))}>Conectar MT5</button>
          </div>
        )}
        {m && mode === "backtest" && (
          <div className="kpis" style={{ marginTop: 10 }}>
            <Kpi label="Operaciones" value={m.total_trades} />
            <Kpi label="Ganadas" value={<span className="pos">{m.wins}</span>} />
            <Kpi label="Perdidas" value={<span className="neg">{m.losses}</span>} />
            <Kpi label="Win %" value={`${num(m.win_rate, 1)} %`} />
            <Kpi label="Neto" value={<Signed value={m.net_profit} />} />
          </div>
        )}
        {candles.length > 0 ? <CandleChart candles={candles} markers={markers} />
          : !error && <div className="empty">{mode === "backtest" ? "Pulsa «Ver ganadas y perdidas» para pintar el recorrido sobre velas de MT5." : "Sin velas."}</div>}
        <p className="hint">Verde = ganada · Rojo = perdida. El saldo 50 000 plano de abajo era la cuenta demo en vivo, no el backtest.</p>
      </Card>
      {mode === "backtest" && (
        <>
          <Card title="Recorrido de equity del backtest">
            {equity.length > 1 ? <LineChart points={equity} label="Equity del backtest" />
              : <div className="empty">Aún no hay curva. Pulsa «Ver ganadas y perdidas».</div>}
          </Card>
          <Card title="Operaciones (ganada / perdida)">
            <DataTable<BacktestTradeView>
              rows={(bt?.trades || []).slice(-200).reverse()}
              rowKey={(t, i) => `${t.entry_time}-${i}`}
              empty="Sin operaciones en esta prueba."
              columns={[
                { title: "Entrada", render: (t) => dateTime(t.entry_time) },
                { title: "Lado", render: (t) => SIDES[t.side] || t.side },
                { title: "Precio", numeric: true, render: (t) => t.entry_price },
                { title: "Salida", render: (t) => dateTime(t.exit_time) },
                { title: "Motivo", render: (t) => t.exit_reason || "—" },
                { title: "Resultado", render: (t) => t.net_profit > 0 ? <span className="pos">GANADA</span> : t.net_profit < 0 ? <span className="neg">PERDIDA</span> : "0" },
                { title: "P&L", numeric: true, render: (t) => <Signed value={t.net_profit} /> },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
