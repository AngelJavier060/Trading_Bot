// Cliente de la API del backend (Python + MT5 + PostgreSQL).
// Por defecto las peticiones van al mismo origen (/api/...) y Next.js las reenvía al
// backend (ver next.config.ts). NEXT_PUBLIC_API_URL solo hace falta si el navegador debe
// hablar directamente con un backend en otra dirección.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

const TOKEN_KEY = "tradebot_token";

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown = null) {
    super(message);
  }
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible: la sesión dura lo que la pestaña */
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal; allow503?: boolean };

/** Llama a la API. Lanza ApiError con el mensaje del backend; 401 = sesión caducada. */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`No se puede contactar con el backend (${API_URL || "proxy /api del frontend"}). ¿Está arrancado?`, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setToken("");
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // fuera de un componente no hay router: recarga completa a la pantalla de login
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiError((data as { error?: string }).error || "Sesión caducada", 401, data);
  }
  if (!res.ok && !(opts.allow503 && res.status === 503)) {
    throw new ApiError((data as { error?: string }).error || `Error HTTP ${res.status}`, res.status, data);
  }
  return data as T;
}

/** Espera a que termine una tarea de fondo del backend (backtest, walk-forward...). */
export async function waitJob<T = unknown>(id: string, onTick?: (status: string) => void): Promise<T> {
  for (;;) {
    const job = await api<{ status: string; result: T; error?: string }>(`/api/jobs/${id}`);
    if (job.status === "done") return job.result;
    if (job.status === "error") throw new ApiError(job.error || "La tarea falló", 500);
    onTick?.(job.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export function streamUrl(): string {
  return `${API_URL}/api/stream?token=${encodeURIComponent(getToken())}`;
}
