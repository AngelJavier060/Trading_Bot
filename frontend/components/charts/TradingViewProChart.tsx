import React, { useEffect, useRef, useState } from 'react';
import tvDatafeed from '../../utils/tvDatafeed';

/**
 * Props for TradingViewProChart.
 *
 * The Charting Library is **not** distributed via npm; it must be requested at
 * https://www.tradingview.com/charting-library/ and copied into
 * `frontend/public/charting_library/`. While the library is missing this
 * component renders an inline guidance card so the rest of the dashboard keeps
 * working.
 */
export interface TradingViewProChartTrade {
  /** epoch milliseconds for the entry */
  time: number;
  /** entry price */
  price: number;
  /** call = BUY, put = SELL */
  direction: 'call' | 'put';
  /** 0..100 confidence percentage shown on the entry shape */
  confidence?: number;
  /** take profit price (rendered as a green dashed order line) */
  tp?: number;
  /** stop loss price (rendered as a red dashed order line) */
  sl?: number;
  /** stable identifier so we can keep / dispose drawings between renders */
  id?: string | number;
}

interface TradingViewProChartProps {
  symbol: string;
  /** TradingView resolution code: '1' | '5' | '15' | '60' | 'D' ... */
  interval: string;
  /** Theme to use; the library exposes 'Light' or 'Dark' (case sensitive) */
  theme?: 'Light' | 'Dark';
  /** Whether the user can switch the symbol from the UI */
  allowSymbolChange?: boolean;
  /** Trades to render with createShape() + createOrderLine() */
  trades?: TradingViewProChartTrade[];
  /** Locale code, defaults to Spanish */
  locale?: string;
  /** Container fill height in px (defaults to 540) */
  height?: number;
}

const LIBRARY_PATH = '/charting_library/';
const LIBRARY_SCRIPT = `${LIBRARY_PATH}charting_library.standalone.js`;

let loadingPromise: Promise<boolean> | null = null;

/** Loads the TradingView library script once; resolves true if `window.TradingView` is ready. */
function loadCharting(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).TradingView?.widget) return Promise.resolve(true);
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise(resolve => {
    const existing = document.querySelector(`script[data-tv-library]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean((window as any).TradingView?.widget)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = LIBRARY_SCRIPT;
    script.async = true;
    script.dataset.tvLibrary = 'true';
    script.onload = () => resolve(Boolean((window as any).TradingView?.widget));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return loadingPromise;
}

const TradingViewProChart: React.FC<TradingViewProChartProps> = ({
  symbol,
  interval,
  theme = 'Light',
  allowSymbolChange = false,
  trades = [],
  locale = 'es',
  height = 540,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const shapeIdsRef = useRef<Map<string, string>>(new Map());
  const orderLinesRef = useRef<Map<string, any>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  // ── Init / dispose widget ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadCharting();
      if (cancelled) return;
      if (!ok) { setStatus('missing'); return; }
      if (!containerRef.current) return;
      try {
        const TV = (window as any).TradingView;
        const widget = new TV.widget({
          symbol,
          interval,
          container: containerRef.current,
          datafeed: tvDatafeed,
          library_path: LIBRARY_PATH,
          locale,
          autosize: true,
          theme,
          timezone: 'America/Guayaquil',
          enabled_features: [
            'study_templates',
            'side_toolbar_in_fullscreen_mode',
          ],
          disabled_features: [
            'header_compare',
            'header_symbol_search' + (allowSymbolChange ? '_disabled_marker' : ''),
            'use_localstorage_for_settings',
            'volume_force_overlay',
          ].filter(f => allowSymbolChange ? f !== 'header_symbol_search' : true),
          overrides: theme === 'Light'
            ? {
                'paneProperties.background': '#ffffff',
                'paneProperties.backgroundType': 'solid',
                'paneProperties.vertGridProperties.color': '#eef0f4',
                'paneProperties.horzGridProperties.color': '#eef0f4',
                'mainSeriesProperties.candleStyle.upColor':       '#16a34a',
                'mainSeriesProperties.candleStyle.downColor':     '#ef4444',
                'mainSeriesProperties.candleStyle.borderUpColor': '#16a34a',
                'mainSeriesProperties.candleStyle.borderDownColor':'#ef4444',
                'mainSeriesProperties.candleStyle.wickUpColor':   '#16a34a',
                'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
                'scalesProperties.textColor': '#1f2937',
              }
            : {},
          loading_screen: { backgroundColor: theme === 'Light' ? '#ffffff' : '#0f172a' },
          favorites: {
            intervals: ['1', '5', '15', '60', '240', 'D'] as any,
          },
        });
        widgetRef.current = widget;
        widget.onChartReady(() => {
          if (cancelled) return;
          setStatus('ready');
          try { applyTradeDrawings(widget, trades, shapeIdsRef.current, orderLinesRef.current); } catch {}
        });
      } catch (err) {
        console.error('[TradingViewProChart] init failed', err);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      try { widgetRef.current?.remove?.(); } catch {}
      widgetRef.current = null;
      shapeIdsRef.current.clear();
      orderLinesRef.current.clear();
    };
    // We intentionally do not include `trades`; drawings are managed in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, theme, allowSymbolChange, locale]);

  // ── Update drawings whenever the trades list changes ─────────────────────
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || status !== 'ready') return;
    try {
      applyTradeDrawings(widget, trades, shapeIdsRef.current, orderLinesRef.current);
    } catch (err) {
      console.error('[TradingViewProChart] drawing update failed', err);
    }
  }, [trades, status]);

  if (status === 'missing') {
    return <MissingLibraryNotice />;
  }
  if (status === 'error') {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm p-4 rounded-xl">
        No se pudo iniciar TradingView Advanced Charts.
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-xl overflow-hidden" style={{ height }}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs z-0">
          Cargando TradingView Pro…
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0 z-10" />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconciles the widget drawings with the provided list of trades:
 *   - draws an arrow_up / arrow_down shape at the entry time/price
 *   - draws TP / SL as horizontal order lines
 *
 * Old drawings whose ids are no longer present are removed.
 */
function applyTradeDrawings(
  widget: any,
  trades: TradingViewProChartTrade[],
  shapeIds: Map<string, string>,
  orderLines: Map<string, any>,
) {
  if (!widget?.activeChart) return;
  const chart = widget.activeChart();
  if (!chart) return;

  const wantedKeys = new Set<string>();
  trades.forEach((t, idx) => {
    const key = String(t.id ?? `${t.time}-${t.direction}-${idx}`);
    wantedKeys.add(key);

    // ── Entry arrow ────────────────────────────────────────────────────────
    if (!shapeIds.has(`${key}:entry`)) {
      try {
        const shape = chart.createShape(
          { time: Math.floor(t.time / 1000), price: t.price },
          {
            shape: t.direction === 'call' ? 'arrow_up' : 'arrow_down',
            text: `${t.direction === 'call' ? 'BUY' : 'SELL'}${typeof t.confidence === 'number' ? ` ${Math.round(t.confidence)}%` : ''}`,
            lock: true,
            disableSelection: true,
            disableSave: true,
            disableUndo: true,
            overrides: {
              color:        t.direction === 'call' ? '#16a34a' : '#dc2626',
              textcolor:    t.direction === 'call' ? '#16a34a' : '#dc2626',
              backgroundColor: '#ffffff',
              fontsize:     12,
              transparency: 0,
            },
          },
        );
        if (shape) shapeIds.set(`${key}:entry`, shape);
      } catch (err) {
        console.warn('[TradingViewProChart] createShape failed', err);
      }
    }

    // ── TP order line ──────────────────────────────────────────────────────
    if (typeof t.tp === 'number' && Number.isFinite(t.tp)) {
      const tpKey = `${key}:tp`;
      if (!orderLines.has(tpKey)) {
        try {
          const ol = chart.createOrderLine()
            .setText('TP')
            .setQuantity(`${t.tp}`)
            .setPrice(t.tp)
            .setLineStyle(2)
            .setLineLength(80)
            .setLineColor('#16a34a')
            .setBodyTextColor('#16a34a')
            .setBodyBorderColor('#16a34a')
            .setBodyBackgroundColor('#dcfce7')
            .setQuantityBackgroundColor('#dcfce7')
            .setQuantityBorderColor('#16a34a');
          orderLines.set(tpKey, ol);
        } catch (err) {
          console.warn('[TradingViewProChart] createOrderLine TP failed', err);
        }
      }
    }

    // ── SL order line ──────────────────────────────────────────────────────
    if (typeof t.sl === 'number' && Number.isFinite(t.sl)) {
      const slKey = `${key}:sl`;
      if (!orderLines.has(slKey)) {
        try {
          const ol = chart.createOrderLine()
            .setText('SL')
            .setQuantity(`${t.sl}`)
            .setPrice(t.sl)
            .setLineStyle(2)
            .setLineLength(80)
            .setLineColor('#dc2626')
            .setBodyTextColor('#dc2626')
            .setBodyBorderColor('#dc2626')
            .setBodyBackgroundColor('#fee2e2')
            .setQuantityBackgroundColor('#fee2e2')
            .setQuantityBorderColor('#dc2626');
          orderLines.set(slKey, ol);
        } catch (err) {
          console.warn('[TradingViewProChart] createOrderLine SL failed', err);
        }
      }
    }
  });

  // ── Remove drawings for trades that disappeared ────────────────────────
  Array.from(shapeIds.keys()).forEach(k => {
    const baseKey = k.replace(/:entry$/, '');
    if (!wantedKeys.has(baseKey)) {
      try { chart.removeEntity(shapeIds.get(k)); } catch {}
      shapeIds.delete(k);
    }
  });
  Array.from(orderLines.keys()).forEach(k => {
    const baseKey = k.replace(/:tp$|:sl$/, '');
    if (!wantedKeys.has(baseKey)) {
      try { orderLines.get(k)?.remove?.(); } catch {}
      orderLines.delete(k);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback shown when the Charting Library is not bundled in /public.
// ─────────────────────────────────────────────────────────────────────────────

const MissingLibraryNotice: React.FC = () => (
  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900">
    <div className="flex items-start gap-3">
      <span className="material-symbols-outlined text-amber-500 text-2xl">info</span>
      <div className="flex-1 space-y-2 text-sm">
        <p className="font-bold">TradingView Advanced Charts no está instalado</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Solicita acceso (gratis) en{' '}
            <a
              href="https://www.tradingview.com/charting-library/"
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold"
            >
              tradingview.com/charting-library
            </a>
            .
          </li>
          <li>Descarga el repositorio privado que TradingView te enviará por GitHub.</li>
          <li>
            Copia la carpeta <code className="bg-amber-100 px-1 rounded">charting_library</code> dentro de{' '}
            <code className="bg-amber-100 px-1 rounded">frontend/public/</code>.
          </li>
          <li>Recarga el dashboard. Mientras tanto seguimos usando Lightweight Charts.</li>
        </ol>
        <p className="text-xs text-amber-700">
          El backend ya expone el datafeed UDF en <code>/api/tv/*</code>, así que no tendrás que tocar
          nada del servidor cuando bajes la librería.
        </p>
      </div>
    </div>
  </div>
);

export default TradingViewProChart;
