export type RouteTimingPayload = {
  route: string;
  durationMs: number;
  rowCount?: number;
  email?: string | null;
  /** Optional fields (e.g. analytics slice) without duplicating log helpers at call sites */
  extra?: Record<string, unknown>;
};

export function logRouteTiming(payload: RouteTimingPayload): void {
  const { route, durationMs, rowCount, email, extra } = payload;
  const base: Record<string, unknown> = { route, durationMs };
  if (rowCount !== undefined) base.rowCount = rowCount;
  if (email) base.email = email;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      base[k] = v;
    }
  }
  if (durationMs > 2000) {
    console.warn("Slow route", base);
  } else {
    console.log("Route timing", base);
  }
}
