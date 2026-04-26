/**
 * Session Bands Utility
 * =====================
 * Computes colored time-range bands (in UTC epoch seconds) for major Forex
 * trading sessions. Pass the result to LightweightProChart as `sessionBands`.
 *
 * Session UTC ranges (approximate):
 *  Sydney     21:00 – 06:00  (next day)
 *  Tokyo      00:00 – 09:00
 *  Londres    07:00 – 16:00
 *  Nueva York 13:00 – 22:00
 */

export interface SessionBand {
  from: number;   // UTC epoch seconds
  to: number;
  color: string;
  label: string;
}

interface SessionDef {
  name: string;
  startHour: number; // UTC
  endHour: number;   // UTC (may be < startHour for overnight sessions)
  color: string;
}

const SESSION_DEFS: SessionDef[] = [
  { name: 'Sydney',     startHour: 21, endHour:  6, color: 'rgba(139, 92, 246, 0.10)' },
  { name: 'Tokio',      startHour:  0, endHour:  9, color: 'rgba(234, 179,  8, 0.10)' },
  { name: 'Londres',    startHour:  7, endHour: 16, color: 'rgba( 59,130,246, 0.12)' },
  { name: 'Nueva York', startHour: 13, endHour: 22, color: 'rgba( 16,185,129, 0.10)' },
];

/**
 * Returns session bands for a window of ±`days` days around today (UTC).
 * Only returns bands for sessions listed in `activeSessions`.
 */
export function computeSessionBands(
  activeSessions: string[],
  days = 5,
): SessionBand[] {
  if (!activeSessions || activeSessions.length === 0) return [];

  const bands: SessionBand[] = [];
  const now = new Date();

  // Iterate over a range of days
  for (let d = -days; d <= days; d++) {
    const base = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + d,
    ));

    for (const def of SESSION_DEFS) {
      if (!activeSessions.includes(def.name)) continue;

      let from: Date;
      let to: Date;

      if (def.startHour < def.endHour) {
        // Same-day session
        from = new Date(base);
        from.setUTCHours(def.startHour, 0, 0, 0);
        to = new Date(base);
        to.setUTCHours(def.endHour, 0, 0, 0);
      } else {
        // Overnight session (e.g. Sydney 21:00 → +1 day 06:00)
        from = new Date(base);
        from.setUTCHours(def.startHour, 0, 0, 0);
        to = new Date(base);
        to.setUTCDate(to.getUTCDate() + 1);
        to.setUTCHours(def.endHour, 0, 0, 0);
      }

      bands.push({
        from: Math.floor(from.getTime() / 1000),
        to:   Math.floor(to.getTime()   / 1000),
        color: def.color,
        label: def.name,
      });
    }
  }

  return bands;
}
