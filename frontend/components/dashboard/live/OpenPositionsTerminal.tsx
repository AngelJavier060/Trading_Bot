import { Fragment, useEffect, useMemo, useState } from 'react';
import { resolveMarketType, marketTypeLabel, marketTypeBadge, marketTypeIcon, type MarketTypeCategory } from '../../types/liveTrading';

export type BrokerOpenPosition = {
  order_id: string | number;
  symbol: string;
  direction: 'call' | 'put';
  amount: number;
  instrument_type: string;
  instrument_kind: string;
  is_otc: boolean;
  open_quote: number;
  current_quote: number;
  created_at_sec: number | null;
  expiration_sec: number | null;
  expected_profit: number;
};

function prettyPair(sym: string): { label: string; otc: boolean } {
  const u = sym.toUpperCase();
  const otc = u.includes('-OTC') || u.includes(' OTC');
  const core = sym.replace(/-OTC$/i, '').replace(/\s+OTC$/i, '');
  if (core.length >= 6) {
    return { label: `${core.slice(0, 3)}/`, otc };
  }
  return { label: sym, otc };
}

function formatCountdown(expSec: number | null, nowMs: number): string {
  if (expSec == null || !Number.isFinite(expSec)) return '—';
  const left = Math.max(0, Math.floor(expSec - nowMs / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function MiniPriceContext({ open, current }: { open: number; current: number }) {
  if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(current) || current <= 0) return null;
  const lo = Math.min(open, current);
  const hi = Math.max(open, current);
  const span = Math.max(hi - lo, 1e-9);
  const pctOpen = ((open - lo) / span) * 100;
  const pctCur = ((current - lo) / span) * 100;
  return (
    <div className="space-y-0.5 px-3 pb-2">
      <div className="flex justify-between text-[8px] text-[#64748b]">
        <span>
          Entrada <span className="font-mono text-[#0f172a]">{open.toFixed(5)}</span>
        </span>
        <span>
          Actual <span className="font-mono text-[#0f172a]">{current.toFixed(5)}</span>
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
        <span
          className="absolute top-0 z-10 h-full w-0.5 bg-[#2563eb]"
          style={{ left: `${pctOpen}%` }}
          title="Precio de entrada"
        />
        <span
          className="absolute top-0 z-10 h-full w-0.5 bg-[#16a34a]"
          style={{ left: `${pctCur}%` }}
          title="Precio actual"
        />
      </div>
    </div>
  );
}

function TimeProgressBar({
  createdSec,
  expSec,
  nowMs,
}: {
  createdSec: number | null;
  expSec: number | null;
  nowMs: number;
}) {
  if (createdSec == null || expSec == null || !Number.isFinite(createdSec) || !Number.isFinite(expSec)) {
    return null;
  }
  const total = expSec - createdSec;
  if (total <= 0) return null;
  const now = nowMs / 1000;
  const pct = Math.min(100, Math.max(0, ((now - createdSec) / total) * 100));
  const left = Math.max(0, Math.floor(expSec - now));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <div className="space-y-0.5 px-3 pb-2">
      <div className="flex justify-between text-[8px] text-[#64748b]">
        <span>Tiempo hasta cierre</span>
        <span className="font-mono text-[#0f172a]">
          {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')} restantes
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8f0]">
        <div
          className="h-full rounded-full bg-[#3b82f6]"
          style={{ width: `${pct}%` }}
          title="Progreso de la opción"
        />
      </div>
    </div>
  );
}

type Grouped = {
  key: string;
  rows: BrokerOpenPosition[];
  symbol: string;
  displayLabel: string;
  isOtc: boolean;
  count: number;
  totalAmount: number;
  expirationSec: number | null;
  quote: number;
  sumExpected: number;
  orderIds: (string | number)[];
};

function groupPositions(rows: BrokerOpenPosition[]): Grouped[] {
  const map = new Map<string, BrokerOpenPosition[]>();
  for (const p of rows) {
    const expKey = p.expiration_sec != null ? String(Math.floor(p.expiration_sec)) : 'na';
    const k = `${p.symbol}__${expKey}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  return [...map.entries()].map(([key, list]) => {
    const first = list[0];
    const { label, otc } = prettyPair(first.symbol);
    const quote =
      list.find((r) => r.current_quote > 0)?.current_quote ||
      list.find((r) => r.open_quote > 0)?.open_quote ||
      0;
    return {
      key,
      rows: list,
      symbol: first.symbol,
      displayLabel: label,
      isOtc: otc || list.some((r) => r.is_otc),
      count: list.length,
      totalAmount: list.reduce((a, r) => a + (r.amount || 0), 0),
      expirationSec: first.expiration_sec,
      quote,
      sumExpected: list.reduce((a, r) => a + (Number(r.expected_profit) || 0), 0),
      orderIds: list.map((r) => r.order_id),
    };
  });
}

type Props = {
  positions: BrokerOpenPosition[];
  totalExpectedProfit: number;
  baseUrl: string;
  isConnected: boolean;
  variant?: 'dark' | 'quantum';
  onLog?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  onAfterSell?: () => void;
};

export function OpenPositionsTerminal({
  positions,
  totalExpectedProfit,
  baseUrl,
  isConnected,
  variant = 'dark',
  onLog,
  onAfterSell,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sellingKey, setSellingKey] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const grouped = useMemo(() => groupPositions(positions), [positions]);

  const sellGroup = async (g: Grouped) => {
    if (!isConnected) {
      onLog?.('Sin conexión: no se puede vender desde el terminal', 'warning');
      return;
    }
    setSellingKey(g.key);
    try {
      for (const rawId of g.orderIds) {
        const order_id = typeof rawId === 'string' ? parseInt(String(rawId), 10) : Number(rawId);
        if (!Number.isFinite(order_id)) continue;
        const res = await fetch(`${baseUrl}/api/trading/close-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.status === 'error') {
          onLog?.(`Cerrar ${rawId}: ${data?.message || res.status}`, 'warning');
        }
      }
      onLog?.(`Solicitud de venta enviada (${g.count} opción(es))`, 'success');
      onAfterSell?.();
    } catch (e) {
      onLog?.(`Error al vender: ${e}`, 'error');
    } finally {
      setSellingKey(null);
    }
  };

  const totalCount = positions.length;
  const plColor = totalExpectedProfit >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]';
  const plSign = totalExpectedProfit >= 0 ? '+' : '';

  // Variant "quantum" - estilo claro y moderno
  if (variant === 'quantum') {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#cbd5e1] bg-[#f8fafc] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#475569]">
              Posiciones abiertas ({totalCount})
            </span>
            <span className="ont-[family-name:var(--font-qt-mono),monospace] text-xs font-bold">
              {plSign}{totalExpectedProfit.toFixed(2)} P/G esp.
            </span>
          </div>
          <span className="text-[10px] text-[#64748b]">IQ Option · sincronización</span>
        </div>

        {/* Body */}
        <div className="qt-scroll min-h-0 flex-1 overflow-y-auto">
          {totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <span className="text-3xl mb-2">📭</span>
              <p className="font-[family-name:var(--font-qt-mono),monospace] text-[11px] text-[#64748b]">
                Sin posiciones abiertas sincronizadas.
              </p>
              <p className="mt-1 max-w-md text-[10px] text-[#94a3b8]">
                Si ves la operación en la app IQ Option, comprueba que sea la misma cuenta (demo/real) que en este panel,
                pulsa Conectar de nuevo y espera unos segundos al sondeo del servidor.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse font-[family-name:var(--font-qt-mono),monospace] text-[11px] text-[#0f172a]">
              <thead className="sticky top-0 z-10 border-b border-[#cbd5e1] bg-[#f8fafc]">
                <tr className="text-[9px] font-bold text-[#64748b]">
                  <th className="px-3 py-2.5 text-left uppercase tracking-wider">
                    <span className="qt-ms mr-1 align-middle text-base">tune</span>
                    Nombre
                  </th>
                  <th className="px-3 py-2.5 text-left uppercase tracking-wider">Mercado</th>
                  <th className="px-3 py-2.5 text-left uppercase tracking-wider">Vencimiento</th>
                  <th className="px-3 py-2.5 text-right uppercase tracking-wider">Inversión</th>
                  <th className="px-3 py-2.5 text-left uppercase tracking-wider">Apertura</th>
                  <th className="px-3 py-2.5 text-right uppercase tracking-wider">Precio actual</th>
                  <th className="px-3 py-2.5 text-right uppercase tracking-wider">P/G esp.</th>
                  <th className="px-3 py-2.5 text-right uppercase tracking-wider">P/G venta</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {grouped.map((g) => {
                  const r0 = g.rows[0];
                  const dirUp = r0?.direction === 'call';
                  const expStr = formatCountdown(g.expirationSec, nowMs);
                  const isExpiring = g.expirationSec != null && g.expirationSec - nowMs / 1000 < 120;
                  const rowPl = g.sumExpected;
                  const rowPlCls = rowPl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]';
                  const openPx = r0?.open_quote ?? 0;
                  const curPx = r0 && Number.isFinite(r0.current_quote) && r0.current_quote > 0
                    ? r0.current_quote
                    : g.quote > 0 ? g.quote : 0;
                  const showViz = (openPx > 0 && curPx > 0) || (r0?.created_at_sec != null && g.expirationSec != null);

                  // Cálculo de P/G de venta (estimación: si vendemos ahora)
                  let sellPgl: number | null = null;
                  if (openPx > 0 && curPx > 0) {
                    const change = dirUp ? curPx - openPx : openPx - curPx;
                    const pctChange = change / openPx;
                    sellPgl = g.totalAmount * pctChange * 10; // factor de apalancamiento estimado
                  }

                  // Determinar tipo de mercado
                  const marketCat = resolveMarketType(g.symbol, r0?.instrument_type || '', g.isOtc);

                  return (
                    <Fragment key={g.key}>
                      <tr className="transition-colors hover:bg-[#f1f5f9]">
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-[#0f172a]">{g.displayLabel}</span>
                            {g.count > 1 && (
                              <span className="rounded border border-[#cbd5e1] bg-[#f1f5f9] px-1.5 py-px text-[9px] font-semibold text-[#475569]">
                                {g.count}x
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[8px] font-bold uppercase">
                              {marketTypeIcon(marketCat)} {marketTypeLabel(marketCat)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="ont-bold text-[10px]">
                              {marketTypeLabel(marketCat)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            <span className="qt-ms text-sm" style={{ color: isExpiring ? '#dc2626' : '#3b82f6' }}>schedule</span>
                            {expStr}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          <span className={dirUp ? 'text-[#16a34a]' : 'text-[#dc2626]'}>
                            
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[#475569]">
                          {openPx > 0 ? openPx.toFixed(5) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-[#0f172a]">
                          {curPx > 0 ? curPx.toFixed(5) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          {rowPl >= 0 ? '+' : ''}{rowPl.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          {sellPgl != null ? `${sellPgl >= 0 ? '+' : ''}${sellPgl.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={!isConnected || sellingKey === g.key}
                            onClick={() => void sellGroup(g)}
                            className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-[10px] font-bold transition hover:border-[#dc2626] hover:bg-[#dc2626] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {sellingKey === g.key ? '…' : '✕ Vender'}
                          </button>
                        </td>
                      </tr>
                      {showViz ? (
                        <tr className="bg-[#f8fafc]">
                          <td colSpan={9} className="px-0 py-0">
                            {openPx > 0 && curPx > 0 ? <MiniPriceContext open={openPx} current={curPx} /> : null}
                            <TimeProgressBar createdSec={r0?.created_at_sec ?? null} expSec={g.expirationSec} nowMs={nowMs} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
                <style jsx>{`
          .qt-ms {
            font-family: 'Material Symbols Outlined', sans-serif;
            font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
          }
          .qt-scroll::-webkit-scrollbar {
            width: 4px;
          }
          .qt-scroll::-webkit-scrollbar-track {
            background: #f1f5f9;
          }
          .qt-scroll::-webkit-scrollbar-thumb {
            background: #94a3b8;
            border-radius: 2px;
          }
        `}</style>
      </section>
    );
  }

  // Variant "dark" original - mejorado con colores más fuertes y contraste
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-[#334155] bg-[#0f172a] shadow-lg shadow-black/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#334155] bg-[#1e293b] px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#94a3b8]">
            Posiciones abiertas IQ
          </span>
          <span className="rounded bg-[#1e293b] px-1.5 py-0.5 font-mono text-[10px] text-[#e2e8f0]">({totalCount})</span>
          <span className="ont-mono text-xs font-bold">
            {plSign}{totalExpectedProfit.toFixed(2)} <span className="text-[9px] font-normal text-[#64748b]">P/G esp.</span>
          </span>
        </div>
        <span className="font-mono text-[9px] text-[#64748b]">Sync broker · IQ Option</span>
      </div>

      <div className="max-h-72 flex-1 overflow-y-auto">
        {totalCount === 0 ? (
          <p className="px-4 py-8 text-center font-mono text-[11px] text-[#64748b]">
            Sin posiciones abiertas en IQ Option para esta sesión.
          </p>
        ) : (
          <table className="w-full border-collapse font-mono text-[11px] text-[#e2e8f0]">
            <thead className="sticky top-0 z-10 border-b border-[#334155] bg-[#0f172a]">
              <tr className="text-[9px] font-bold uppercase tracking-wide text-[#64748b]">
                <th className="px-2 py-2 text-left">Par / grupo</th>
                <th className="px-2 py-2 text-left">Mercado</th>
                <th className="px-2 py-2 text-left">Venc.</th>
                <th className="px-2 py-2 text-right">Inversión</th>
                <th className="px-2 py-2 text-left">Apertura</th>
                <th className="px-2 py-2 text-right">Precio</th>
                <th className="px-2 py-2 text-right">P/G esp.</th>
                <th className="px-2 py-2 text-right">P/G venta</th>
                <th className="px-2 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              {grouped.map((g) => {
                const r0 = g.rows[0];
                const dirUp = r0?.direction === 'call';
                const expStr = formatCountdown(g.expirationSec, nowMs);
                const expClass = g.expirationSec != null && g.expirationSec - nowMs / 1000 < 120 ? 'text-[#f59e0b]' : 'text-[#e2e8f0]';
                const rowPl = g.sumExpected;
                const rowPlCls = rowPl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]';
                const openPx = r0?.open_quote ?? 0;
                const curPx = r0 && Number.isFinite(r0.current_quote) && r0.current_quote > 0
                  ? r0.current_quote : g.quote > 0 ? g.quote : 0;

                let sellPgl: number | null = null;
                if (openPx > 0 && curPx > 0) {
                  const change = dirUp ? curPx - openPx : openPx - curPx;
                  const pctChange = change / openPx;
                  sellPgl = g.totalAmount * pctChange * 10;
                }

                const marketCat = resolveMarketType(g.symbol, r0?.instrument_type || '', g.isOtc);

                return (
                  <tr key={g.key} className="hover:bg-[#1e293b]/60">
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-[#f1f5f9]">{g.displayLabel}</span>
                        {g.count > 1 && (
                          <span className="rounded border border-[#475569] bg-[#1e293b] px-1 font-mono text-[9px] text-[#94a3b8]">
                            {g.count}
                          </span>
                        )}
                        <span className="ounded px-1 text-[9px] font-bold uppercase">
                          {r0?.direction}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-[8px] font-bold uppercase">
                        {marketTypeLabel(marketCat)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-0.5">⏱ {expStr}</span>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-[#f1f5f9]">
                      {' '}
                      <span className={dirUp ? 'text-[#22c55e]' : 'text-[#ef4444]'}>{dirUp ? '▲' : '▼'}</span>
                    </td>
                    <td className="px-2 py-2 text-[#94a3b8]">{openPx > 0 ? openPx.toFixed(5) : '—'}</td>
                    <td className="px-2 py-2 text-right text-[#e2e8f0]">{curPx > 0 ? curPx.toFixed(5) : '—'}</td>
                    <td className="px-2 py-2 text-right font-bold">
                      {rowPl >= 0 ? '+' : ''}{rowPl.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-right font-bold">
                      {sellPgl != null ? `${sellPgl >= 0 ? '+' : ''}${sellPgl.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={!isConnected || sellingKey === g.key}
                        onClick={() => void sellGroup(g)}
                        className="rounded border border-[#475569] px-2 py-1 text-[10px] font-bold text-[#e2e8f0] transition hover:border-[#ef4444] hover:bg-[#ef4444] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sellingKey === g.key ? '…' : 'Vender'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
