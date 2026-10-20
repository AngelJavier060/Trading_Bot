// Formato de números y fechas en español.

export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("es", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signedText(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${num(v, digits)}`;
}

export function tone(v: number | null | undefined): "pos" | "neg" | "" {
  if (!v) return "";
  return v > 0 ? "pos" : "neg";
}

export function dateTime(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export const DECISIONS: Record<string, string> = {
  opened: "abierta",
  dry_run: "simulada",
  blocked: "bloqueada",
  ml_filtered: "filtrada ML",
  rejected: "rechazada",
};

export const SIDES: Record<string, string> = { buy: "Compra", sell: "Venta" };

export const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400,
};
