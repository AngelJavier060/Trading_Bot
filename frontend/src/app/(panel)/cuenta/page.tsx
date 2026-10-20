"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Message, PageHead } from "@/components/ui";
import { api } from "@/lib/api";
import { useSystem } from "@/lib/system";
import type { SavedAccount } from "@/lib/types";

interface AccountsData { accounts: SavedAccount[]; active: string | null; terminals: string[] }

async function fetchAccounts(): Promise<AccountsData> {
  const [acc, term] = await Promise.all([
    api<{ accounts: SavedAccount[]; active: string | null }>("/api/mt5/accounts"),
    api<{ terminals: string[] }>("/api/mt5/terminals"),
  ]);
  return { accounts: acc.accounts, active: acc.active, terminals: term.terminals };
}

export default function CuentaPage() {
  const { live, refresh } = useSystem();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<string[]>([]);
  const [kind, setKind] = useState<"demo" | "real">("demo");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [server, setServer] = useState("");
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });
  const [busy, setBusy] = useState(false);

  const apply = useCallback((d: AccountsData) => {
    setAccounts(d.accounts);
    setActive(d.active);
    setTerminals(d.terminals);
  }, []);
  const load = useCallback(async () => apply(await fetchAccounts()), [apply]);

  useEffect(() => {
    let alive = true;
    fetchAccounts()
      .then((d) => { if (alive) apply(d); })
      .catch((e: Error) => { if (alive) setMsg({ text: e.message, kind: "err" }); });
    return () => { alive = false; };
  }, [apply]);

  const current = live?.mt5.account;

  async function connect(body: Record<string, unknown>) {
    setBusy(true);
    setMsg({ text: "Conectando con MetaTrader 5…" });
    try {
      const r = await api<{ warning?: string; account: { login: number } }>("/api/mt5/connect", { body });
      setPassword("");
      setMsg({ text: `Conectado a la cuenta ${r.account.login}. ${r.warning || ""}`, kind: r.warning ? undefined : "ok" });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    connect({ login: login.trim(), password, server: server.trim(), path, kind, label: label.trim(), remember_password: remember });
  }

  function pickSaved(a: SavedAccount) {
    setLogin(String(a.login)); setServer(a.server); setLabel(a.label); setPath(a.path); setKind(a.kind);
    setRemember(a.has_password); setPassword("");
    if (a.has_password) connect({ login: a.login, server: a.server, path: a.path, kind: a.kind, label: a.label, remember_password: true });
    else setMsg({ text: "Escribe la contraseña de esta cuenta y pulsa Conectar." });
  }

  async function forget(a: SavedAccount) {
    await api(`/api/mt5/accounts/${a.login}/${encodeURIComponent(a.server)}`, { method: "DELETE" });
    await load();
  }

  async function logoutMt5() {
    try {
      await api("/api/mt5/disconnect", { body: {} });
      setMsg({ text: "Sesión de MT5 cerrada. El sistema no se reconectará hasta que elijas una cuenta.", kind: "ok" });
      await refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message, kind: "err" });
    }
  }

  const servers = Array.from(new Set([...accounts.map((a) => a.server), "AdmiralsSC-Demo", "AdmiralsSC-Live"]));

  return (
    <>
      <PageHead title="Cuenta MetaTrader 5">
        El sistema usa el terminal MT5 instalado en la máquina del backend. Al conectar otra cuenta, el terminal cambia a ella.
      </PageHead>
      <div className="grid2">
        <div>
          <Card title="Cuenta conectada">
            {current ? (
              <>
                <p><b>{current.name}</b><span className={`tag ${current.mode}`}>{current.mode === "real" ? "CUENTA REAL" : "CUENTA DEMO"}</span></p>
                <p className="muted">{current.login} · {current.server} · balance {current.balance} {current.currency} · equity {current.equity} · 1:{current.leverage}</p>
                <div className="actions"><button className="btn danger" onClick={logoutMt5}>Cerrar sesión de MT5</button></div>
              </>
            ) : <p className="muted">Ninguna. Elige una cuenta guardada o ingresa una nueva.</p>}
          </Card>
          <Card title="Cuentas guardadas">
            {accounts.length === 0 && <div className="empty">Todavía no hay cuentas guardadas.</div>}
            {accounts.map((a) => (
              <div key={a.key} className="card" style={{ marginBottom: 8, borderColor: a.key === active ? "var(--accent)" : undefined }}>
                <b>{a.label || a.name || a.login}</b><span className={`tag ${a.kind}`}>{a.kind === "real" ? "CUENTA REAL" : "CUENTA DEMO"}</span>
                <div className="muted small">{a.login} · {a.server}{a.has_password ? " · contraseña guardada" : ""}{a.key === active ? " · activa" : ""}</div>
                <div className="actions">
                  <button className="btn primary" disabled={busy} onClick={() => pickSaved(a)}>{a.has_password ? "Conectar" : "Usar"}</button>
                  <button className="btn danger" onClick={() => forget(a)}>Olvidar</button>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <Card title="Conectar a MetaTrader 5">
          <label>Tipo de cuenta</label>
          <div className="seg" role="group" aria-label="Tipo de cuenta">
            <button type="button" className={kind === "demo" ? "on" : ""} onClick={() => setKind("demo")}>Demo</button>
            <button type="button" className={kind === "real" ? "on real" : ""} onClick={() => setKind("real")}>Real</button>
          </div>
          {kind === "real" && (
            <p className="warnbox">Cuenta REAL: puedes conectarla y ver datos, pero el bot solo enviará órdenes si el backend tiene
              <b> ALLOW_REAL_ACCOUNT=true</b>. Valida antes en demo.</p>
          )}
          <form onSubmit={submit} autoComplete="on">
            <div className="fields">
              <div><label htmlFor="lg">Número de cuenta (login)</label>
                <input id="lg" inputMode="numeric" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required /></div>
              <div><label htmlFor="sv">Servidor</label>
                <input id="sv" list="servers" value={server} onChange={(e) => setServer(e.target.value)} required placeholder="AdmiralsSC-Demo" />
                <datalist id="servers">{servers.map((s) => <option key={s} value={s} />)}</datalist></div>
            </div>
            <label htmlFor="pw">Contraseña</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input id="pw" type={showPw ? "text" : "password"} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn" onClick={() => setShowPw(!showPw)}>{showPw ? "Ocultar" : "Ver"}</button>
            </div>
            <p className="hint">Vacía = usa la contraseña guardada o la que recuerde el terminal.</p>
            <div className="fields">
              <div><label htmlFor="tm">Terminal MT5</label>
                <select id="tm" value={path} onChange={(e) => setPath(e.target.value)}>
                  <option value="">Automático (el que esté abierto)</option>
                  {terminals.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><label htmlFor="lb">Nombre para recordarla (opcional)</label>
                <input id="lb" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Admirals demo" /></div>
            </div>
            <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recordar contraseña en el equipo del backend (cifrada con Windows)</label>
            <div className="actions"><button className="btn primary" type="submit" disabled={busy}>Conectar MT5</button></div>
          </form>
          <Message text={msg.text} kind={msg.kind} />
        </Card>
      </div>
    </>
  );
}
