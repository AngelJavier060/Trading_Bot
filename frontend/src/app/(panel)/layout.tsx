"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";
import { num } from "@/lib/format";
import { SystemProvider, useSystem } from "@/lib/system";
import type { User } from "@/lib/types";

const NAV = [
  ["/", "Resumen"],
  ["/estrategia", "Estrategia"],
  ["/grafico", "Gráfico"],
  ["/senales", "Señales"],
  ["/operaciones", "Operaciones"],
  ["/pruebas", "Pruebas"],
  ["/experimentos", "Experimentos"],
  ["/cuenta", "Cuenta MT5"],
  ["/eventos", "Eventos"],
  ["/ajustes", "Ajustes"],
] as const;

export default function PanelLayout({ children }: LayoutProps<"/">) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<{ user: User }>("/api/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) return <main className="center-box muted">Cargando…</main>;
  return (
    <SystemProvider user={user}>
      <Shell>{children}</Shell>
    </SystemProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">TradeBot MT5<span>sistema autónomo</span></div>
        <nav className="nav" aria-label="Secciones">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="main">
        <AccountFlag />
        <TopBar />
        <ConnectBanner />
        {children}
      </div>
    </div>
  );
}

function TopBar() {
  const { user, live, connected } = useSystem();
  const router = useRouter();
  const acc = live?.mt5.account;
  const bot = live?.bot;
  const cfg = bot?.config;
  const botState = bot?.running ? "en marcha" : bot?.wants_to_run ? "esperando para arrancar" : "detenido";

  function logout() {
    setToken("");
    router.replace("/login");
  }

  return (
    <div className="topbar">
      <div className="pills">
        <span className="pill"><span className={`dot ${live?.mt5.connected ? "good" : "bad"}`} />
          MT5 <b>{live?.mt5.connected ? "conectado" : "Sin conexión"}</b>
          {acc && live?.mt5.connected && <> · {acc.login} · {acc.server}<span className={`tag ${acc.mode}`}>{acc.mode === "real" ? "CUENTA REAL" : "CUENTA DEMO"}</span></>}
        </span>
        <span className="pill"><span className={`dot ${bot?.running ? "good" : bot?.wants_to_run ? "warn" : "bad"}`} />
          Bot <b>{botState}</b>
          {cfg && live?.mt5.connected && <> · {cfg.dry_run ? "solo señales (sin order_send)" : "órdenes a la cuenta"} · {cfg.params.strategy} {cfg.params.timeframe}</>}
        </span>
        <span className="pill"><span className={`dot ${live?.health.ok ? "good" : "bad"}`} />
          {live?.health.ok ? "Sano" : live?.health.reason || "…"}
          {bot?.heartbeat_age_s != null && <> · ciclo hace {num(bot.heartbeat_age_s, 0)} s</>}
        </span>
        <span className="pill"><span className={`dot ${connected ? "good" : "warn"}`} />{connected ? "En vivo" : "Reconectando…"}</span>
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <span className="muted small">{user?.username}</span>
        <button className="btn" onClick={logout}>Salir</button>
      </div>
    </div>
  );
}

function AccountFlag() {
  const { live, connectMt5 } = useSystem();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const acc = live?.mt5.account;

  async function conectar() {
    setBusy(true);
    setErr("");
    try {
      await connectMt5();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!live?.mt5.connected || !acc) {
    const mt5err = live?.mt5.last_error;
    return (
      <div className="account-flag off">
        SIN CONEXIÓN
        <div className="meta">
          El aviso de React DevTools / HMR no es MetaTrader. Abre MT5 con tu demo Admiral y pulsa Conectar.
          {mt5err ? ` · last_error: ${mt5err.join(" ")}` : ""}
          {err ? ` · ${err}` : ""}
        </div>
        <div className="actions" style={{ justifyContent: "center", marginTop: 8 }}>
          <button className="btn primary" disabled={busy} onClick={conectar}>
            {busy ? "Conectando…" : "Conectar MT5 (cuenta del terminal / .env)"}
          </button>
        </div>
      </div>
    );
  }
  const real = acc.mode === "real";
  return (
    <div className={`account-flag ${real ? "real" : "demo"}`}>
      {real ? "CUENTA REAL" : "CUENTA DEMO"}
      <div className="meta">{acc.login} · {acc.server} · balance {acc.balance} {acc.currency} · equity {acc.equity}</div>
    </div>
  );
}

function ConnectBanner() {
  const { live, connectMt5 } = useSystem();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  if (!live || live.mt5.connected || pathname === "/cuenta") return null;
  return (
    <div className="card warnbox">
      Sin conexión con Admiral/MT5: el gráfico y el saldo no pueden salir. No uses el Probador de MT5 para esto.
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await connectMt5(); } catch { /* el error queda en la cinta */ } finally { setBusy(false); }
        }}>{busy ? "Conectando…" : "Conectar ahora"}</button>
        <Link href="/cuenta">O escribe login y servidor</Link>
      </div>
    </div>
  );
}
