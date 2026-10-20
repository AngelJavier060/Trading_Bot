"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, DataTable, Message, PageHead } from "@/components/ui";
import { api, API_URL, setToken } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useSystem } from "@/lib/system";
import type { User } from "@/lib/types";

export default function AjustesPage() {
  const { user, refresh } = useSystem();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "viewer" });
  const [userMsg, setUserMsg] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });
  const [json, setJson] = useState("");
  const [jsonMsg, setJsonMsg] = useState<{ text: string; kind?: "err" | "ok" }>({ text: "" });
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    api<{ config: unknown }>("/api/bot/config").then((r) => setJson(JSON.stringify(r.config ?? {}, null, 2))).catch(() => undefined);
    if (isAdmin) api<{ users: User[] }>("/api/users").then((r) => setUsers(r.users)).catch(() => undefined);
  }, [isAdmin]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/auth/password", { body: { current, new: next } });
      setPwMsg({ text: "Contraseña cambiada. Vuelve a iniciar sesión.", kind: "ok" });
      setTimeout(() => { setToken(""); router.replace("/login"); }, 1500);
    } catch (err) { setPwMsg({ text: (err as Error).message, kind: "err" }); }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/users", { body: newUser });
      setUsers((await api<{ users: User[] }>("/api/users")).users);
      setNewUser({ username: "", password: "", role: "viewer" });
      setUserMsg({ text: "Usuario creado.", kind: "ok" });
    } catch (err) { setUserMsg({ text: (err as Error).message, kind: "err" }); }
  }

  async function removeUser(id: number) {
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      setUsers((await api<{ users: User[] }>("/api/users")).users);
    } catch (err) { setUserMsg({ text: (err as Error).message, kind: "err" }); }
  }

  async function saveJson(start: boolean) {
    try {
      const body = JSON.parse(json);
      await api(start ? "/api/bot/start" : "/api/bot/config", { body });
      setJsonMsg({ text: start ? "Guardada e iniciado." : "Guardada.", kind: "ok" });
      await refresh();
    } catch (err) { setJsonMsg({ text: (err as Error).message, kind: "err" }); }
  }

  return (
    <>
      <PageHead title="Ajustes">Usuario, accesos y configuración avanzada. Backend: {API_URL || "mismo origen (proxy de Next.js)"}</PageHead>
      <div className="grid2">
        <Card title="Cambiar mi contraseña">
          <form onSubmit={changePassword}>
            <label htmlFor="cur">Contraseña actual</label>
            <input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <label htmlFor="nw">Contraseña nueva (mín. 8)</label>
            <input id="nw" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
            <div className="actions"><button className="btn primary" type="submit">Cambiar</button></div>
          </form>
          <Message text={pwMsg.text} kind={pwMsg.kind} />
        </Card>
        {isAdmin && (
          <Card title="Usuarios">
            <DataTable<User> rows={users} rowKey={(u) => u.id} empty="" columns={[
              { title: "Usuario", render: (u) => u.username },
              { title: "Rol", render: (u) => u.role },
              { title: "Último acceso", render: (u) => dateTime(u.last_login) },
              { title: "", render: (u) => u.id !== user?.id && <button className="btn danger" onClick={() => removeUser(u.id)}>Borrar</button> },
            ]} />
            <form onSubmit={addUser}>
              <div className="fields">
                <div><label htmlFor="nu">Usuario</label><input id="nu" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required minLength={3} /></div>
                <div><label htmlFor="np">Contraseña</label><input id="np" type="password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={8} /></div>
                <div><label htmlFor="nr">Rol</label>
                  <select id="nr" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="viewer">Solo lectura</option><option value="admin">Administrador</option></select></div>
              </div>
              <div className="actions"><button className="btn" type="submit">Crear usuario</button></div>
            </form>
            <Message text={userMsg.text} kind={userMsg.kind} />
          </Card>
        )}
      </div>
      <Card title="Configuración del bot en JSON (avanzado)">
        <p className="muted small">Lo normal es usar la página Estrategia; aquí se edita la misma configuración en bruto.</p>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Configuración JSON" />
        <div className="actions">
          <button className="btn" onClick={() => saveJson(false)}>Guardar</button>
          <button className="btn primary" onClick={() => saveJson(true)}>Guardar e iniciar</button>
        </div>
        <Message text={jsonMsg.text} kind={jsonMsg.kind} />
      </Card>
    </>
  );
}
