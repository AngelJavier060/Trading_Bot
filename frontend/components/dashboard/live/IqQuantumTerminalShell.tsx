import Head from 'next/head';
import type { ReactNode } from 'react';

export type QuantumSignalLite = {
  id: string;
  symbol: string;
  direction: 'call' | 'put';
  confidence: number;
  marketType?: string;
};

export type IqQuantumNavId = 'config' | 'strategies' | 'backtest' | 'live';

type KpiCard = { label: string; value: string; accent?: 'primary' | 'secondary' | 'error' | 'neutral' };

type Props = {
  className?: string;
  fontVars: string;
  headerModeSlot?: ReactNode;
  isConnected: boolean;
  isRunning: boolean;
  equity: string;
  pnlDay: string;
  pnlDayPositive: boolean;
  kpiCards: KpiCard[];
  openPositionsSlot: ReactNode;
  workspaceSlot: ReactNode;
  signals: QuantumSignalLite[];
  onSignalExecute?: (signalId: string) => void;
  showSignalExecute?: boolean;
  logLines: string[];
  marketSymbols: string[];
  activeNav: IqQuantumNavId;
  onNav: (id: IqQuantumNavId) => void;
  onStopEngine: () => void;
  onReset: () => void;
};

function NavBtn({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="lex h-10 w-10 items-center justify-center rounded transition-colors"
    >
      {children}
    </button>
  );
}

export function IqQuantumTerminalShell({
  className = '',
  fontVars,
  headerModeSlot,
  isConnected,
  isRunning,
  equity,
  pnlDay,
  pnlDayPositive,
  kpiCards,
  openPositionsSlot,
  workspaceSlot,
  signals,
  onSignalExecute,
  showSignalExecute = false,
  logLines,
  marketSymbols,
  activeNav,
  onNav,
  onStopEngine,
  onReset,
}: Props) {
  return (
    <>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        className="grid h-full min-h-0 w-full grid-cols-[52px_1fr_260px] grid-rows-[44px_1fr] overflow-hidden bg-[#eef2f6] text-[#1e293b]  font-[family-name:var(--font-qt-inter),system-ui,sans-serif]"
      >
                <style jsx global>{`
          .qt-ms {
            font-family: 'Material Symbols Outlined', sans-serif;
            font-size: 18px;
            font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20;
            color: #475569;
          }
          .qt-scroll::-webkit-scrollbar {
            width: 4px;
          }
          .qt-scroll::-webkit-scrollbar-track {
            background: #e2e8f0;
          }
          .qt-scroll::-webkit-scrollbar-thumb {
            background: #94a3b8;
            border-radius: 2px;
          }
          .qt-chart-grid {
            background-image: radial-gradient(#cbd5e1 0.5px, transparent 0.5px);
            background-size: 20px 20px;
          }
        `}</style>

        {/* Header - más moderno y compacto */}
        <header className="col-span-3 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-[#cbd5e1] bg-white px-4 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-tight text-[#0f172a]">
                Quant<span className="text-[#2563eb]">Terminal</span>
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">v4 Pro</span>
            </div>
            <div className="h-4 w-px shrink-0 bg-[#cbd5e1]" />
            {headerModeSlot ? <div className="flex min-w-0 items-center gap-2">{headerModeSlot}</div> : null}
            <div className="h-4 w-px shrink-0 bg-[#cbd5e1] hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" />
                <span className="text-[10px] font-semibold font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[#475569]">
                  {isConnected ? 'Conectado' : 'Sin conexión'}
                </span>
              </div>
              <div className="hidden items-center gap-1 sm:flex">
                <span className="text-[10px] font-semibold uppercase text-[#64748b]">Motor</span>
                <div className="h-1 w-16 overflow-hidden rounded-full bg-[#cbd5e1]">
                  <div
                    className="h-full rounded-full transition-all"
                  />
                </div>
                <span className="text-[10px] font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[#475569]">
                  {isRunning ? 'En marcha' : 'En pausa'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-3 border-r border-[#cbd5e1] pr-3 sm:flex">
              <div className="text-right">
                <div className="text-[9px] font-semibold uppercase text-[#64748b]">Patrimonio</div>
                <div className="text-xs font-bold font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[#0f172a]">{equity}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-semibold uppercase text-[#64748b]">P&amp;L del día</div>
                <div
                  className="ext-xs font-bold font-[family-name:var(--font-qt-mono),ui-monospace,monospace]"
                >
                  {pnlDay}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onStopEngine}
                className="h-8 rounded-lg bg-[#dc2626] px-3 text-[10px] font-bold uppercase tracking-tight text-white shadow-sm transition hover:bg-[#b91c1c]"
              >
                Detener
              </button>
              <button
                type="button"
                onClick={onReset}
                className="h-8 rounded-lg border border-[#cbd5e1] bg-white px-3 text-[10px] font-bold uppercase tracking-tight text-[#475569] transition hover:bg-[#f8fafc]"
              >
                Limpiar
              </button>
            </div>
          </div>
        </header>

        {/* Nav */}
        <nav className="flex flex-col items-center gap-3 border-r border-[#cbd5e1] bg-white py-3">
          <NavBtn active={activeNav === 'live'} onClick={() => onNav('live')} label="Trading en vivo">
            <span className="qt-ms">dashboard</span>
          </NavBtn>
          <NavBtn active={activeNav === 'backtest'} onClick={() => onNav('backtest')} label="Backtesting">
            <span className="qt-ms">analytics</span>
          </NavBtn>
          <NavBtn active={activeNav === 'strategies'} onClick={() => onNav('strategies')} label="Estrategias">
            <span className="qt-ms">developer_board</span>
          </NavBtn>
          <NavBtn active={activeNav === 'config'} onClick={() => onNav('config')} label="Configuración">
            <span className="qt-ms">settings</span>
          </NavBtn>
        </nav>

        {/* Main workspace - NUEVO ORDEN: Panel en vivo ARRIBA, Posiciones ABAJO */}
        <main className="grid min-h-0 grid-rows-[auto_1fr_minmax(180px,240px)] gap-1 overflow-hidden bg-[#eef2f6] p-1">
          {/* Row 1: KPI Cards */}
          <section className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
            {kpiCards.map((c) => {
              const border = c.accent === 'primary'
                  ? 'border-[#2563eb]/30 bg-[#eff6ff]'
                  : 'border-[#cbd5e1] bg-white';
              const val = c.accent === 'secondary'
                  ? 'text-[#16a34a]'
                  : c.accent === 'error'
                    ? 'text-[#dc2626]'
                    : 'text-[#0f172a]';
              return (
                <div
                  key={c.label}
                  className="lex flex-col border p-2 shadow-sm  font-[family-name:var(--font-qt-mono),ui-monospace,monospace] min-w-0"
                >
                  <span className="truncate text-[9px] font-bold uppercase tracking-widest text-[#64748b]">
                    {c.label}
                  </span>
                  <span className="runcate text-lg font-bold">{c.value}</span>
                </div>
              );
            })}
          </section>

          {/* Row 2: Panel en vivo + Workspace (MOVED UP - was Row 3) */}
          <section className="grid min-h-0 grid-cols-1 gap-1 lg:grid-cols-[1fr_280px]">
            <div className="grid min-h-0 grid-rows-[1fr_minmax(100px,130px)] gap-1">
              {/* Chart / Live Panel */}
              <div className="flex min-h-0 flex-col overflow-hidden border border-[#cbd5e1] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#cbd5e1] bg-[#f8fafc] px-3 py-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#0f172a]">Panel en vivo</span>
                    <div className="flex gap-px overflow-hidden rounded border border-[#cbd5e1]">
                      <button className="bg-[#2563eb] px-2 py-0.5 text-[9px] font-bold text-white">1M</button>
                      <button className="bg-white px-2 py-0.5 text-[9px] font-bold text-[#475569] hover:bg-[#f8fafc]">5M</button>
                      <button className="bg-white px-2 py-0.5 text-[9px] font-bold text-[#475569] hover:bg-[#f8fafc]">15M</button>
                      <button className="bg-white px-2 py-0.5 text-[9px] font-bold text-[#475569] hover:bg-[#f8fafc]">1H</button>
                    </div>
                    <span className="text-[10px] font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[#64748b]">O:1.0842 H:1.0845 L:1.0841 C:1.0843</span>
                  </div>
                  <span className="qt-ms cursor-pointer text-[#64748b] hover:text-[#2563eb]">sync_alt</span>
                </div>
                <div className="qt-chart-grid relative min-h-0 flex-1 overflow-auto p-2">
                  {workspaceSlot}
                </div>
              </div>
              {/* System Logs */}
              <div className="flex min-h-0 flex-col overflow-hidden border border-[#cbd5e1] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#cbd5e1] bg-[#f8fafc] px-3 py-1">
                  <span className="text-[9px] font-bold text-[#2563eb] font-[family-name:var(--font-qt-mono),ui-monospace,monospace]">
                    SISTEMA · IQ EN VIVO
                  </span>
                  <span className="text-[8px] uppercase text-[#64748b] font-[family-name:var(--font-qt-mono),ui-monospace,monospace]">
                    bitácora
                  </span>
                </div>
                <div className="qt-scroll flex-1 space-y-px overflow-y-auto p-2 font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[10px] leading-tight">
                  {logLines.length === 0 ? (
                    <span className="text-[#94a3b8]">Sin eventos aún…</span>
                  ) : (
                    logLines.slice(-20).map((line, i) => (
                      <div key={`${i}-`} className="text-[#475569]">
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar: Signals + Engine Health */}
            <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-[#cbd5e1] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#cbd5e1] bg-[#f8fafc] px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#64748b]">Señales en vivo</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                </div>
                <div className="qt-scroll flex-1 space-y-1 overflow-y-auto p-1">
                  {signals.length === 0 ? (
                    <p className="p-2 text-center text-[10px] text-[#94a3b8]">Sin señales en lista</p>
                  ) : (
                    signals.slice(0, 8).map((sig) => (
                      <div
                        key={sig.id}
                        className="border border-[#cbd5e1] bg-[#f8fafc] p-2 transition hover:border-[#2563eb]/50"
                      >
                        <div className="mb-1 flex items-start justify-between gap-1">
                          <span className="text-xs font-bold text-[#0f172a]">{sig.symbol}</span>
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase text-white ${
                                sig.direction === 'call' ? 'bg-[#16a34a]' : 'bg-[#dc2626]'
                              }`}
                            >
                              {sig.direction === 'call' ? 'SUBE' : 'BAJA'}
                            </span>
                            {sig.marketType && (
                              <span className={`rounded border px-1 py-0.5 text-[8px] font-bold ${
                                sig.marketType === 'otc'
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : sig.marketType === 'mercado_normal'
                                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                                    : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              }`}>
                                {sig.marketType === 'otc' ? '📈 OTC' : sig.marketType === 'mercado_normal' ? '💹 Normal' : '📊 Binarias'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-[#64748b] font-[family-name:var(--font-qt-mono),ui-monospace,monospace]">
                            Confianza
                          </span>
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#e2e8f0]">
                            <div
                              className="h-full"
                              style={{ width: `${Math.min(100, sig.confidence)}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-bold font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[#0f172a]">
                            {sig.confidence}%
                          </span>
                        </div>
                        {showSignalExecute && onSignalExecute ? (
                          <button
                            type="button"
                            onClick={() => onSignalExecute(sig.id)}
                            className={`mt-2 w-full rounded py-1 text-[10px] font-semibold text-white ${
                              sig.direction === 'call' ? 'bg-[#16a34a] hover:bg-[#15803d]' : 'bg-[#dc2626] hover:bg-[#b91c1c]'
                            }`}
                          >
                            Operar en broker
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="shrink-0 space-y-2 border border-[#cbd5e1] bg-white p-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#64748b]">Salud del motor</span>
                  <span
                    className="ext-[9px] font-bold font-[family-name:var(--font-qt-mono),ui-monospace,monospace]"
                  >
                    {isRunning ? 'Activo' : 'Parado'}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <div
                    className="h-full transition-all"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Row 3: Open Positions (MOVED DOWN - was Row 2) - con altura más prominente */}
          <section className="min-h-0 overflow-hidden border border-[#cbd5e1] bg-white shadow-sm">
            {openPositionsSlot}
          </section>
        </main>

        {/* Aside */}
        <aside className="flex min-h-0 flex-col border-l border-[#cbd5e1] bg-white">
          <div className="qt-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-2">
            <div>
              <h3 className="mb-2 px-1 text-[9px] font-bold uppercase tracking-widest text-[#64748b]">Monitor de Mercado</h3>
              <div>
                {(marketSymbols.length ? marketSymbols : ['EURUSD', 'GBPUSD', 'USDJPY']).slice(0, 8).map((sym) => {
                  const isOtc = sym.toUpperCase().includes('-OTC');
                  const base = sym.replace('-OTC', '').replace(' OTC', '');
                  return (
                    <div
                      key={sym}
                      className="flex cursor-pointer items-center justify-between border-b border-[#cbd5e1]/50 px-1 py-2 text-[10px] transition hover:bg-[#f8fafc]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#0f172a]">{base}</span>
                        {isOtc && (
                          <span className="rounded bg-[#fef3c7] px-1 py-px text-[8px] font-bold text-[#92400e]">OTC</span>
                        )}
                      </div>
                      <span className="font-bold font-[family-name:var(--font-qt-mono),ui-monospace,monospace] text-[#64748b]">—</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-auto rounded border border-[#cbd5e1] bg-[#f8fafc] p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#64748b]">Liquidez</span>
                <span className="text-[9px] font-bold text-[#2563eb] font-[family-name:var(--font-qt-mono),ui-monospace,monospace]">Estable</span>
              </div>
              <div className="flex gap-px">
                {[1,1,1,0.3,1].map((o, i) => (
                  <div key={i} className="h-4 w-1 rounded-sm bg-[#2563eb]" style={{ opacity: o }} />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
