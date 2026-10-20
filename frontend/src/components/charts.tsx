"use client";

// Gráficos con lightweight-charts (TradingView): velas con señales y curva de equity.

import {
  ColorType, createChart, CrosshairMode,
  type IChartApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export interface Candle { time: number; open: number; high: number; low: number; close: number }
export interface Marker { time: number; side: "buy" | "sell"; decision: string; text: string; color?: string }
export interface Level { price: number; color: string; title: string }

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function baseOptions(container: HTMLElement) {
  return {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: { background: { type: ColorType.Solid, color: cssVar("--panel", "#fff") }, textColor: cssVar("--muted", "#5d6878") },
    grid: { vertLines: { color: cssVar("--border", "#dde2ea") }, horzLines: { color: cssVar("--border", "#dde2ea") } },
    rightPriceScale: { borderColor: cssVar("--border", "#dde2ea") },
    timeScale: { borderColor: cssVar("--border", "#dde2ea"), timeVisible: true, secondsVisible: false },
    crosshair: { mode: CrosshairMode.Normal },
  };
}

function useResize(ref: React.RefObject<HTMLDivElement | null>, chart: React.RefObject<IChartApi | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => chart.current?.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, chart]);
}

const MARKER_COLORS: Record<string, string> = {
  opened: "#16a34a", dry_run: "#2563eb", blocked: "#94a3b8", ml_filtered: "#d97706", rejected: "#db2777",
};

export function CandleChart({ candles, markers, levels = [] }: { candles: Candle[]; markers: Marker[]; levels?: Level[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  useResize(ref, chartRef);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, baseOptions(el));
    chartRef.current = chart;
    const series = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#dc2626", borderVisible: false, wickUpColor: "#16a34a", wickDownColor: "#dc2626",
    });
    series.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    const times = candles.map((c) => c.time).sort((a, b) => a - b);
    const step = times.length > 1 ? Math.max(1, times[1] - times[0]) : 3600;
    const snap = (t: number) => {
      let best = times[0], d = Math.abs(times[0] - t);
      for (const x of times) {
        const n = Math.abs(x - t);
        if (n < d) { d = n; best = x; }
      }
      return d <= step * 2.5 ? best : null;
    };
    const marks: SeriesMarker<Time>[] = markers
      .map((m) => ({ ...m, time: snap(m.time) }))
      .filter((m): m is Marker & { time: number } => m.time != null)
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.side === "buy" ? "belowBar" : "aboveBar",
        shape: m.decision === "loss" || m.decision === "win" ? (m.side === "buy" ? "arrowUp" : "arrowDown") : (m.side === "buy" ? "arrowUp" : "arrowDown"),
        color: m.color || (m.decision === "win" ? "#16a34a" : m.decision === "loss" ? "#dc2626" : m.decision === "opened" ? (m.side === "buy" ? "#16a34a" : "#dc2626") : MARKER_COLORS[m.decision] || "#64748b"),
        text: m.text,
      }));
    series.setMarkers(marks);
    for (const lv of levels) {
      series.createPriceLine({ price: lv.price, color: lv.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: lv.title });
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, markers, levels]);

  return <div ref={ref} className="chart-box" role="img" aria-label="Gráfico de velas con señales del bot" />;
}

export function LineChart({ points, label }: { points: { time: number; value: number }[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  useResize(ref, chartRef);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, baseOptions(el));
    chartRef.current = chart;
    const series = chart.addLineSeries({ color: cssVar("--accent", "#2563eb"), lineWidth: 2 });
    // la serie necesita tiempos estrictamente crecientes
    const seen = new Set<number>();
    const data = points
      .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
      .sort((a, b) => a.time - b.time)
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    series.setData(data);
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  return <div ref={ref} className="chart-box small" role="img" aria-label={label} />;
}
