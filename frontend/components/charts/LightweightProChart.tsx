import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
import type { ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, SkipForward, Maximize } from 'lucide-react';

type UTCTime = number; // seconds

export interface Candle {
  time: string | number; // ISO string or epoch seconds/ms
  open: number; high: number; low: number; close: number;
  volume?: number;
}

function sma(values: number[], length: number): (number | undefined)[] {
  if (length <= 1) return values.map(v => v);
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

function rollingStd(values: number[], length: number, ma: (number | undefined)[]): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let window: number[] = [];
  for (let i = 0; i < values.length; i++) {
    window.push(values[i]);
    if (window.length > length) window.shift();
    if (window.length === length) {
      const mean = ma[i] as number;
      let s = 0;
      for (const v of window) s += (v - mean) * (v - mean);
      out[i] = Math.sqrt(s / length);
    }
  }
  return out;
}

export interface TradeMarker {
  time: UTCTime; // epoch seconds
  price: number;
  direction: 'call' | 'put';
  id?: string;
  sl?: number;
  tp?: number;
  label?: string;
}

interface LightweightProChartProps {
  symbol: string;
  platform: 'iqoption' | 'mt5';
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
  height?: number; // total height, chart will split into main + rsi
  // Data loader should return candles in ascending time order
  loadCandles: (symbol: string, timeframe: string, count: number) => Promise<any[]>;
  candleCount?: number;
  // Indicators config
  showEMA?: boolean;
  emaLength?: number;
  emaColor?: string;
  emaLineWidth?: number;
  showRSI?: boolean;
  rsiLength?: number;
  rsiColor?: string;
  rsiLineWidth?: number;
  // Extra indicators
  showMACD?: boolean;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  macdLineColor?: string;
  macdSignalColor?: string;
  macdHistUpColor?: string;
  macdHistDownColor?: string;
  showBollinger?: boolean;
  bbPeriod?: number;
  bbStd?: number;
  bbUpperColor?: string;
  bbLowerColor?: string;
  bbBasisColor?: string;
  showRSIDivergence?: boolean;
  rsiDivLookback?: number;
  // Overlays
  trades?: TradeMarker[];
}

// Utils
function toSec(t: string | number): UTCTime {
  if (typeof t === 'number') {
    // detect ms vs sec
    return t > 2_000_000_000 ? Math.floor(t / 1000) : Math.floor(t);
  }
  return Math.floor(new Date(t).getTime() / 1000);
}

function ema(values: number[], length: number): (number | undefined)[] {
  if (length <= 1) return values.map(v => v);
  const k = 2 / (length + 1);
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let prev: number | undefined = undefined;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || isNaN(v)) { out[i] = undefined; continue; }
    if (prev === undefined) {
      // seed with SMA for first EMA point
      if (i + 1 >= length) {
        let sum = 0; let count = 0;
        for (let j = i - length + 1; j <= i; j++) { sum += values[j]; count++; }
        prev = sum / count;
      } else {
        out[i] = undefined;
        continue;
      }
    }
    const emaVal: number = v * k + (prev as number) * (1 - k);
    out[i] = emaVal;
    prev = emaVal;
  }
  return out;
}

function rsi(values: number[], length: number): (number | undefined)[] {
  if (length <= 1) return values.map(_ => 50);
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let gains = 0; let losses = 0; let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - prev;
    prev = values[i];
    if (i <= length) {
      if (change >= 0) gains += change; else losses -= change;
      if (i === length) {
        const avgG = gains / length; const avgL = losses / length;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        out[i] = 100 - (100 / (1 + rs));
        gains = avgG; losses = avgL; // seed Wilder smoothing
      }
      continue;
    }
    // Wilder smoothing
    gains = (gains * (length - 1) + (change > 0 ? change : 0)) / length;
    losses = (losses * (length - 1) + (change < 0 ? -change : 0)) / length;
    const rs = losses === 0 ? 100 : gains / losses;
    out[i] = 100 - (100 / (1 + rs));
  }
  return out;
}

const LightweightProChart: React.FC<LightweightProChartProps> = ({
  symbol,
  platform,
  timeframe,
  height = 384,
  loadCandles,
  candleCount = 500,
  showEMA = true,
  emaLength = 9,
  emaColor = '#10B981',
  emaLineWidth = 2,
  showRSI = true,
  rsiLength = 21,
  rsiColor = '#8B5CF6',
  rsiLineWidth = 2,
  showMACD = false,
  macdFast = 12,
  macdSlow = 26,
  macdSignal = 9,
  macdLineColor = '#22d3ee',
  macdSignalColor = '#f97316',
  macdHistUpColor = '#22c55e',
  macdHistDownColor = '#ef4444',
  showBollinger = false,
  bbPeriod = 20,
  bbStd = 2,
  bbUpperColor = '#eab308',
  bbLowerColor = '#eab308',
  bbBasisColor = '#64748b',
  showRSIDivergence = false,
  rsiDivLookback = 80,
  trades = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'>>();
  const emaSeriesRef = useRef<ISeriesApi<'Line'>>();
  const rsiSeriesRef = useRef<ISeriesApi<'Line'>>();
  const chartRef = useRef<ReturnType<typeof createChart>>();
  const rsiChartRef = useRef<ReturnType<typeof createChart>>();
  const rsiLenRef = useRef<number>(0);
  const initialFitDoneRef = useRef<boolean>(false);
  const lastSymbolRef = useRef<string>(symbol);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'>>();
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'>>();
  const bbBasisSeriesRef = useRef<ISeriesApi<'Line'>>();
  const macdLineRef = useRef<ISeriesApi<'Line'>>();
  const macdSignalRef = useRef<ISeriesApi<'Line'>>();
  const macdHistRef = useRef<ISeriesApi<'Histogram'>>();
  const [data, setData] = useState<CandlestickData<Time>[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const effectiveHeight = isExpanded ? Math.max(height * 2.5, 900) : height;
  const mainH = Math.floor(effectiveHeight * 0.72);
  const subH = Math.max(100, Math.floor(effectiveHeight * 0.28));

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const half = (range.to - range.from) / 2 * 0.65;
    chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half });
  }, []);

  const handleZoomOut = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const center = (range.from + range.to) / 2;
    const half = (range.to - range.from) / 2 * 1.5;
    chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half });
  }, []);

  const handleFitContent = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
    rsiChartRef.current?.timeScale().fitContent();
  }, []);

  const handleGoToLatest = useCallback(() => {
    chartRef.current?.timeScale().scrollToRealTime();
    rsiChartRef.current?.timeScale().scrollToRealTime();
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Keyboard shortcuts when wrapper is focused
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '+' || (e.key === '=' && e.shiftKey)) { e.preventDefault(); handleZoomIn(); }
    if (e.key === '-') { e.preventDefault(); handleZoomOut(); }
    if (e.key === '0' || e.key === 'Home') { e.preventDefault(); handleFitContent(); }
    if (e.key === 'End') { e.preventDefault(); handleGoToLatest(); }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handleToggleExpand(); }
  }, [handleZoomIn, handleZoomOut, handleFitContent, handleGoToLatest, handleToggleExpand]);

  // Fetch data when symbol/timeframe changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await loadCandles(symbol, timeframe, candleCount);
        const prelim: CandlestickData<Time>[] = (raw || []).map((d: any) => ({
          time: toSec(d.time ?? d.timestamp) as Time,
          open: Number(d.open ?? d.o),
          high: Number(d.high ?? d.h),
          low: Number(d.low ?? d.l),
          close: Number(d.close ?? d.c),
        }))
        .filter((d: any) => Number.isFinite(d.open) && Number.isFinite(d.high) && Number.isFinite(d.low) && Number.isFinite(d.close) && Number.isFinite(d.time as number));
        // Normalize OHLC to avoid invalid ranges
        const normalized = prelim.map(c => {
          const hi = Math.max(c.high, c.open, c.close);
          const lo = Math.min(c.low, c.open, c.close);
          return { ...c, high: hi, low: lo };
        });
        // Ensure ascending and unique times
        normalized.sort((a, b) => (a.time as number) - (b.time as number));
        const seen = new Set<number>();
        const mapped: CandlestickData<Time>[] = [];
        for (const c of normalized) {
          const t = c.time as number;
          if (!seen.has(t)) { seen.add(t); mapped.push(c); }
        }
        if (!cancelled) setData(mapped);
      } catch (e) {
        console.error('[LWC] fetch candles failed', e);
        if (!cancelled) setData([]);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe, candleCount, loadCandles]);

  // Build EMA/RSI series data
  const emaData = useMemo(() => {
    if (!showEMA || data.length === 0) return [] as { time: Time; value: number }[];
    const closes = data.map(d => d.close);
    const e = ema(closes, emaLength);
    return data.map((d, i) => (e[i] == null ? null : { time: d.time, value: e[i]! })).filter(Boolean) as any;
  }, [data, showEMA, emaLength]);

  const rsiData = useMemo(() => {
    if (!showRSI || data.length === 0) return [] as { time: Time; value: number }[];
    const closes = data.map(d => d.close);
    const r = rsi(closes, rsiLength);
    return data.map((d, i) => (r[i] == null ? null : { time: d.time, value: Math.max(0, Math.min(100, r[i]!)) })).filter(Boolean) as any;
  }, [data, showRSI, rsiLength]);

  useEffect(() => { rsiLenRef.current = rsiData.length; }, [rsiData]);

  // Init charts
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: '#cbd5e1' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155', rightOffset: 5 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
      width: containerRef.current.clientWidth,
      height: mainH,
    });
    chartRef.current = chart;
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false,
    });
    candleSeriesRef.current = candleSeries;
    if (showEMA) {
      emaSeriesRef.current = chart.addLineSeries({ color: emaColor, lineWidth: emaLineWidth as any });
    }
    bbUpperSeriesRef.current = chart.addLineSeries({ color: bbUpperColor, lineWidth: 1 as any });
    bbLowerSeriesRef.current = chart.addLineSeries({ color: bbLowerColor, lineWidth: 1 as any });
    bbBasisSeriesRef.current = chart.addLineSeries({ color: bbBasisColor, lineWidth: 1 as any, lineStyle: LineStyle.Dotted });

    const rsiContainer = rsiContainerRef.current;
    if (rsiContainer) {
      const rsiChart = createChart(rsiContainer, {
        layout: { background: { type: ColorType.Solid, color: '#0b1220' }, textColor: '#cbd5e1' },
        grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
        rightPriceScale: { borderColor: '#334155' },
        timeScale: { borderColor: '#334155', rightOffset: 5 },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
        width: rsiContainer.clientWidth,
        height: subH,
      });
      rsiChartRef.current = rsiChart;
      rsiSeriesRef.current = rsiChart.addLineSeries({ color: rsiColor, lineWidth: rsiLineWidth as any });
      rsiSeriesRef.current.createPriceLine({ price: 70, color: '#ef4444', lineStyle: LineStyle.Dotted, axisLabelVisible: true });
      rsiSeriesRef.current.createPriceLine({ price: 50, color: '#64748b', lineStyle: LineStyle.Dotted, axisLabelVisible: true });
      rsiSeriesRef.current.createPriceLine({ price: 30, color: '#22c55e', lineStyle: LineStyle.Dotted, axisLabelVisible: true });
      macdLineRef.current = rsiChart.addLineSeries({ color: macdLineColor, lineWidth: 2 as any });
      macdSignalRef.current = rsiChart.addLineSeries({ color: macdSignalColor, lineWidth: 2 as any });
      macdHistRef.current = (rsiChart as any).addHistogramSeries({ base: 0 });
      // Sync time scales
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) rsiChart.timeScale().setVisibleLogicalRange(range);
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      try { chartRef.current?.remove(); } catch {}
      try { rsiChartRef.current?.remove(); } catch {}
      chartRef.current = undefined as any;
      rsiChartRef.current = undefined as any;
      candleSeriesRef.current = undefined as any;
      emaSeriesRef.current = undefined as any;
      rsiSeriesRef.current = undefined as any;
    };
  }, []);

  // Resize charts when expand state or height changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height: mainH });
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.applyOptions({ height: subH });
    }
  }, [mainH, subH]);

  // Set data to series
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    try {
      if (!data || data.length === 0) {
        candleSeriesRef.current.setData([] as any);
        return;
      }
      // final safety filter before applying
      const safe = data.filter(d => (
        typeof (d.time as number) === 'number' && Number.isFinite(d.time as number) &&
        Number.isFinite(d.open) && Number.isFinite(d.high) && Number.isFinite(d.low) && Number.isFinite(d.close) &&
        d.high >= d.low
      ));
      candleSeriesRef.current.setData(safe as any);
      // Only fit content on initial load or symbol change to prevent excessive chart movement
      if (safe.length > 1 && (!initialFitDoneRef.current || lastSymbolRef.current !== symbol)) {
        chartRef.current?.timeScale().fitContent();
        initialFitDoneRef.current = true;
        lastSymbolRef.current = symbol;
      }
    } catch (err) {
      console.error('[LWC] setData error', err);
    }

    // Markers from trades - ensure sorted by time ascending
    const tradeMarkers = (trades && trades.length > 0) ? trades
      .filter(t => t && typeof t.time === 'number' && Number.isFinite(t.time))
      .map(t => ({
        time: t.time as Time,
        position: t.direction === 'call' ? 'belowBar' : 'aboveBar',
        color: t.direction === 'call' ? '#22c55e' : '#ef4444',
        shape: t.direction === 'call' ? 'arrowUp' : 'arrowDown',
        text: t.label || t.direction.toUpperCase(),
      } as any))
      .sort((a, b) => (a.time as number) - (b.time as number)) : [];
    // Store sorted trade markers for later combination with divergence markers
    (candleSeriesRef.current as any)._pendingTradeMarkers = tradeMarkers;
  }, [data, trades]);

  useEffect(() => {
    if (showEMA && emaSeriesRef.current) {
      emaSeriesRef.current.applyOptions({ color: emaColor, lineWidth: emaLineWidth as any });
      emaSeriesRef.current.setData(emaData as any);
    }
    if (!showEMA && emaSeriesRef.current) {
      emaSeriesRef.current.setData([] as any);
    }
  }, [emaData, emaColor, emaLineWidth, showEMA]);

  useEffect(() => {
    if (rsiSeriesRef.current) {
      if (showRSI) {
        rsiSeriesRef.current.applyOptions({ color: rsiColor, lineWidth: rsiLineWidth as any });
        rsiSeriesRef.current.setData(rsiData as any);
      } else {
        rsiSeriesRef.current.setData([] as any);
      }
    }
  }, [rsiData, rsiColor, rsiLineWidth, showRSI]);

  // Bollinger Bands data
  useEffect(() => {
    if (!bbUpperSeriesRef.current || !bbLowerSeriesRef.current || !bbBasisSeriesRef.current) return;
    if (!showBollinger || data.length === 0) {
      bbUpperSeriesRef.current.setData([] as any);
      bbLowerSeriesRef.current.setData([] as any);
      bbBasisSeriesRef.current.setData([] as any);
      return;
    }
    const closes = data.map(d => d.close);
    const basis = sma(closes, bbPeriod);
    const stdev = rollingStd(closes, bbPeriod, basis);
    const upper = basis.map((b, i) => (b == null || stdev[i] == null ? null : { time: data[i].time, value: b + bbStd * (stdev[i] as number) })).filter(Boolean) as any;
    const lower = basis.map((b, i) => (b == null || stdev[i] == null ? null : { time: data[i].time, value: b - bbStd * (stdev[i] as number) })).filter(Boolean) as any;
    const base = basis.map((b, i) => (b == null ? null : { time: data[i].time, value: b })).filter(Boolean) as any;
    try {
      bbUpperSeriesRef.current.setData(upper);
      bbLowerSeriesRef.current.setData(lower);
      bbBasisSeriesRef.current.setData(base);
    } catch (e) {
      console.error('[LWC] bollinger setData error', e);
    }
  }, [data, showBollinger, bbPeriod, bbStd]);

  // MACD data
  useEffect(() => {
    if (!rsiChartRef.current || !macdLineRef.current || !macdSignalRef.current || !macdHistRef.current) return;
    if (!showMACD || data.length === 0) {
      macdLineRef.current.setData([] as any);
      macdSignalRef.current.setData([] as any);
      macdHistRef.current.setData([] as any);
      return;
    }
    const closes = data.map(d => d.close);
    const emaFastArr = ema(closes, macdFast).map(v => (v == null ? NaN : v));
    const emaSlowArr = ema(closes, macdSlow).map(v => (v == null ? NaN : v));
    const macdArr = closes.map((_, i) => (Number.isFinite(emaFastArr[i]) && Number.isFinite(emaSlowArr[i]) ? (emaFastArr[i] as number) - (emaSlowArr[i] as number) : undefined));
    const signalArr = ema(macdArr.map(v => (v == null ? NaN : v as number)) as any, macdSignal);
    const macdLine = data.map((d, i) => (macdArr[i] == null ? null : { time: d.time, value: macdArr[i] as number })).filter(Boolean) as any;
    const signalLine = data.map((d, i) => (signalArr[i] == null ? null : { time: d.time, value: signalArr[i] as number })).filter(Boolean) as any;
    const hist = data.map((d, i) => {
      const m = macdArr[i];
      const s = signalArr[i];
      if (m == null || s == null) return null;
      const v = (m as number) - (s as number);
      return { time: d.time, value: v, color: v >= 0 ? macdHistUpColor : macdHistDownColor } as any;
    }).filter(Boolean) as any;
    try {
      macdLineRef.current.setData(macdLine);
      macdSignalRef.current.setData(signalLine);
      macdHistRef.current.setData(hist);
    } catch (e) {
      console.error('[LWC] macd setData error', e);
    }
  }, [data, showMACD, macdFast, macdSlow, macdSignal, macdLineColor, macdSignalColor, macdHistUpColor, macdHistDownColor]);

  // RSI Divergence markers + trade markers combined
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    try {
      // Get trade markers (already sorted)
      const tradesMk: any[] = (candleSeriesRef.current as any)._pendingTradeMarkers || [];
      
      // If RSI Divergence is disabled or not enough data, just show trade markers
      if (!showRSIDivergence || !showRSI || !rsiData || rsiData.length < 10 || !data || data.length < 10) {
        // Ensure markers are sorted and valid before setting
        const sortedMarkers = tradesMk
          .filter((m: any) => m && typeof m.time === 'number' && Number.isFinite(m.time))
          .sort((a: any, b: any) => (a.time as number) - (b.time as number));
        candleSeriesRef.current.setMarkers(sortedMarkers);
        return;
      }
      
      const closes = data.map(d => d.close);
      const rvals = rsiData.map((x: any) => (x as any)?.value as number | undefined);
      const times = data.map(d => d.time as number);
      
      // Pivot detection functions
      const isPivotLow = (i: number) => {
        if (i <= 0 || i >= rvals.length - 1) return false;
        const curr = rvals[i];
        const prev = rvals[i - 1];
        const next = rvals[i + 1];
        if (curr == null || prev == null || next == null) return false;
        return curr < prev && curr < next;
      };
      const isPivotHigh = (i: number) => {
        if (i <= 0 || i >= rvals.length - 1) return false;
        const curr = rvals[i];
        const prev = rvals[i - 1];
        const next = rvals[i + 1];
        if (curr == null || prev == null || next == null) return false;
        return curr > prev && curr > next;
      };
      
      const pivL: number[] = [];
      const pivH: number[] = [];
      const start = Math.max(1, rvals.length - (rsiDivLookback || 80));
      for (let i = start; i < rvals.length - 1; i++) {
        if (isPivotLow(i)) pivL.push(i);
        if (isPivotHigh(i)) pivH.push(i);
      }
      
      // Start with trade markers
      const markers: any[] = [...tradesMk];
      
      // Add bullish divergence markers: price lower low, rsi higher low
      for (let i = 1; i < pivL.length; i++) {
        const a = pivL[i - 1], b = pivL[i];
        if (b < closes.length && a < closes.length && b < times.length) {
          if (closes[b] < closes[a] && rvals[b]! > rvals[a]!) {
            markers.push({ 
              time: times[b] as any, 
              position: 'belowBar', 
              color: '#22c55e', 
              shape: 'triangleUp', 
              text: 'Bull Div' 
            });
          }
        }
      }
      
      // Add bearish divergence markers: price higher high, rsi lower high
      for (let i = 1; i < pivH.length; i++) {
        const a = pivH[i - 1], b = pivH[i];
        if (b < closes.length && a < closes.length && b < times.length) {
          if (closes[b] > closes[a] && rvals[b]! < rvals[a]!) {
            markers.push({ 
              time: times[b] as any, 
              position: 'aboveBar', 
              color: '#ef4444', 
              shape: 'triangleDown', 
              text: 'Bear Div' 
            });
          }
        }
      }
      
      // Filter invalid markers and sort by time ascending (CRITICAL for lightweight-charts)
      const validMarkers = markers
        .filter((m: any) => m && typeof m.time === 'number' && Number.isFinite(m.time))
        .sort((a: any, b: any) => (a.time as number) - (b.time as number));
      
      candleSeriesRef.current.setMarkers(validMarkers);
    } catch (e) {
      console.error('[LWC] divergence markers error', e);
    }
  }, [showRSIDivergence, showRSI, rsiData, data, trades, rsiDivLookback]);

  const btnClass = 'p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white transition-colors';
  const divider = <div className="w-px h-4 bg-slate-600 mx-0.5" />;

  return (
    <div
      ref={wrapperRef}
      className="w-full relative outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ transition: 'all 0.3s ease' }}
    >
      {/* TradingView-style Zoom Toolbar */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-0.5 bg-slate-900/90 backdrop-blur-sm rounded-lg px-1.5 py-1 border border-slate-700 shadow-lg">
        <button onClick={handleZoomIn} className={btnClass} title="Zoom In (+)">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleZoomOut} className={btnClass} title="Zoom Out (-)">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        {divider}
        <button onClick={handleFitContent} className={btnClass} title="Ajustar todo (0)">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleGoToLatest} className={btnClass} title="Ir al presente (End)">
          <SkipForward className="w-3.5 h-3.5" />
        </button>
        {divider}
        <button
          onClick={handleToggleExpand}
          className={`${btnClass} ${isExpanded ? 'text-blue-400 hover:text-blue-300' : ''}`}
          title={isExpanded ? 'Reducir gráfico (F)' : 'Ampliar gráfico (F)'}
        >
          {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Chart panes */}
      <div ref={containerRef} style={{ height: mainH }} />
      <div ref={rsiContainerRef} style={{ height: subH }} />

      {/* Keyboard shortcut hint */}
      <div className="absolute bottom-1 left-2 text-[9px] text-slate-600 select-none pointer-events-none">
        + zoom in &nbsp;·&nbsp; - zoom out &nbsp;·&nbsp; 0 fit &nbsp;·&nbsp; F ampliar
      </div>
    </div>
  );
};

export default LightweightProChart;
