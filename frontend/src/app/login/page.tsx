"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Message } from "@/components/ui";
import { api, ApiError, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needs_setup: boolean }>("/api/auth/status")
      .then((r) => setNeedsSetup(r.needs_setup))
      .catch((e: ApiError) => setError(e.message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (needsSetup && password !== password2) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ token: string }>(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        body: { username, password },
      });
      setToken(r.token);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-box">
      <div className="card">
        <h1>TradeBot MT5</h1>
        <p className="muted">
          {needsSetup === null ? "Conectando con el backend…" :
            needsSetup ? "Primera vez: crea el usuario administrador del sistema." : "Inicia sesión para continuar."}
        </p>
        {needsSetup !== null && (
          <form onSubmit={submit}>
            <label htmlFor="u">Usuario</label>
            <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
            <label htmlFor="p">Contraseña</label>
            <input id="p" type="password" autoComplete={needsSetup ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={needsSetup ? 8 : 1} />
            {needsSetup && (
              <>
                <label htmlFor="p2">Repite la contraseña</label>
                <input id="p2" type="password" autoComplete="new-password" value={password2}
                  onChange={(e) => setPassword2(e.target.value)} required minLength={8} />
                <p className="hint">Mínimo 8 caracteres.</p>
              </>
            )}
            <div className="actions">
              <button className="btn primary" type="submit" disabled={busy}>
                {needsSetup ? "Crear usuario y entrar" : "Entrar"}
              </button>
            </div>
          </form>
        )}
        <Message text={error} kind="err" />
      </div>
    </main>
  );
}
