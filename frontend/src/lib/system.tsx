"use client";

// Estado en vivo del sistema compartido por todas las páginas del panel.
// Se alimenta del canal de tiempo real del backend (/api/stream, Server-Sent Events)
// y, si se corta, reintenta solo.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, streamUrl } from "./api";
import type { LiveStatus, Signal, User } from "./types";

interface SystemState {
  user: User | null;
  live: LiveStatus | null;
  connected: boolean;
  recentSignals: Signal[];
  refresh: () => Promise<void>;
  connectMt5: () => Promise<void>;
}

const SystemContext = createContext<SystemState | null>(null);

async function fetchSnapshot(): Promise<LiveStatus> {
  const [mt5, bot, health] = await Promise.all([
    api<{ connected: boolean; account?: LiveStatus["mt5"]["account"]; last_error?: LiveStatus["mt5"]["last_error"] }>("/api/mt5/status"),
    api<LiveStatus["bot"]>("/api/bot/status"),
    api<{ status: string; reason: string }>("/api/health", { allow503: true }),
  ]);
  return {
    health: { ok: health.status === "ok", reason: health.reason },
    mt5: { connected: mt5.connected, account: mt5.account ?? null, last_error: mt5.last_error ?? null },
    bot,
  };
}

export function SystemProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => setLive(await fetchSnapshot()), []);

  const connectMt5 = useCallback(async () => {
    await api("/api/mt5/connect", { body: {} });
    await refresh();
  }, [refresh]);

  // estado completo al abrir, sin esperar al primer evento del canal en vivo
  useEffect(() => {
    let alive = true;
    fetchSnapshot().then((s) => { if (alive) setLive(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      const es = new EventSource(streamUrl());
      sourceRef.current = es;
      es.onopen = () => setConnected(true);
      es.addEventListener("status", (e) => setLive(JSON.parse((e as MessageEvent).data)));
      es.addEventListener("signal", (e) => {
        const s = JSON.parse((e as MessageEvent).data) as Signal;
        setRecentSignals((prev) => [s, ...prev].slice(0, 200));
      });
      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!closed) retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      sourceRef.current?.close();
    };
  }, []);

  return (
    <SystemContext.Provider value={{ user, live, connected, recentSignals, refresh, connectMt5 }}>
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem(): SystemState {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("useSystem debe usarse dentro de SystemProvider");
  return ctx;
}
