/**
 * Market Sessions Utility — base Ecuador (UTC-5)
 * =================================================
 * Las sesiones se calculan automáticamente según la hora local Ecuador.
 * El backend usa la misma base, así la UI y el motor van sincronizados.
 *
 * Ventanas UTC reales:
 *   Sydney     22:00 – 07:00 (cruza medianoche)
 *   Tokio      00:00 – 09:00
 *   Londres    07:00 – 16:00
 *   Nueva York 13:00 – 22:00
 *
 * Hora Ecuador (UTC-5):
 *   Sydney     17:00 – 02:00 (día siguiente)
 *   Tokio      19:00 – 04:00 (día siguiente)
 *   Londres    02:00 – 11:00
 *   Nueva York 08:00 – 17:00
 */

export type MarketSessionName = "Londres" | "Nueva York" | "Tokio" | "Sydney";

export interface MarketSessionStatus {
  name: MarketSessionName;
  hours: string;        // texto en hora Ecuador
  tz: string;
  icon: string;
  open: boolean;
  pct: number;          // 0..100 porcentaje recorrido de la sesión actual
  nextChange: string;   // ISO de próximo abierto/cerrado
}

interface SessionDef {
  name: MarketSessionName;
  startHourEcu: number; // 0..23
  endHourEcu: number;   // puede ser >24 si cruza medianoche
  tz: string;
  icon: string;
}

const SESSION_DEFS: SessionDef[] = [
  { name: "Sydney",     startHourEcu: 17, endHourEcu: 26, tz: "GMT +10", icon: "beach_access" },
  { name: "Tokio",      startHourEcu: 19, endHourEcu: 28, tz: "GMT +9",  icon: "temple_buddhist" },
  { name: "Londres",    startHourEcu:  2, endHourEcu: 11, tz: "GMT +0",  icon: "location_city" },
  { name: "Nueva York", startHourEcu:  8, endHourEcu: 17, tz: "GMT -5",  icon: "corporate_fare" },
];

/** Convierte un Date a sus minutos del día en Ecuador (UTC-5). */
function ecuadorMinuteOfDay(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Ecuador = UTC - 5
  let m = utcMinutes - 5 * 60;
  if (m < 0) m += 24 * 60;
  return m;
}

function formatRange(startH: number, endH: number): string {
  const norm = (h: number) => ((h % 24) + 24) % 24;
  const fmt = (h: number) => `${String(norm(h)).padStart(2, "0")}:00`;
  return `${fmt(startH)} - ${fmt(endH)}`;
}

/**
 * Calcula el estado actual de cada sesión según hora Ecuador.
 * @param activeSessions sesiones seleccionadas por el usuario (para filtrar)
 * @param now fecha actual (default `new Date()`)
 */
export function getMarketSessions(
  activeSessions: MarketSessionName[] | string[] | null | undefined = null,
  now: Date = new Date(),
): MarketSessionStatus[] {
  const minute = ecuadorMinuteOfDay(now);
  const filter = activeSessions && activeSessions.length > 0
    ? new Set(activeSessions as string[])
    : null;

  const out: MarketSessionStatus[] = [];
  for (const def of SESSION_DEFS) {
    if (filter && !filter.has(def.name)) continue;

    const startMin = def.startHourEcu * 60;
    const endMin = def.endHourEcu * 60;
    const lengthMin = endMin - startMin;

    let open = false;
    let elapsed = 0;
    if (def.endHourEcu <= 24) {
      open = startMin <= minute && minute < endMin;
      elapsed = open ? minute - startMin : 0;
    } else {
      // Sesión que cruza medianoche
      const wrappedStart = startMin;
      const wrappedEnd = endMin - 24 * 60;
      open = minute >= wrappedStart || minute < wrappedEnd;
      if (open) {
        elapsed = minute >= wrappedStart
          ? minute - wrappedStart
          : (24 * 60 - wrappedStart) + minute;
      }
    }

    const pct = open && lengthMin > 0
      ? Math.max(0, Math.min(100, Math.round((elapsed / lengthMin) * 100)))
      : 0;

    // Próximo cambio (apertura/cierre) → ISO simple para mostrar
    const today = new Date(now);
    today.setUTCSeconds(0, 0);
    let nextChange = today.toISOString();
    try {
      // Convierte minute Ecuador objetivo a UTC: addUTCMinutes(target_minute + 5*60)
      const targetMinute = open ? endMin % (24 * 60) : startMin % (24 * 60);
      const utcOffset = (targetMinute + 5 * 60) % (24 * 60);
      const ms0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
      const target = new Date(ms0 + utcOffset * 60 * 1000);
      // si el target ya pasó, es para mañana
      if (target.getTime() < now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      nextChange = target.toISOString();
    } catch {
      nextChange = today.toISOString();
    }

    out.push({
      name: def.name,
      hours: formatRange(def.startHourEcu, def.endHourEcu),
      tz: def.tz,
      icon: def.icon,
      open,
      pct,
      nextChange,
    });
  }
  return out;
}

/** Timeframe recomendado por estrategia (display name). */
export const RECOMMENDED_TIMEFRAME: Record<string, "1m" | "5m" | "15m"> = {
  "EMA + RSI": "5m",
  "MACD": "1m",
  "Bollinger Bands": "5m",
  "RSI Divergence": "15m",
  "Ichimoku Cloud": "15m",
  "Multi-Estrategia ML": "5m",
  "Swing Trading": "15m",
  "Grid Trading": "5m",
  "Trend Following": "15m",
};
