/** Normalize document number for dedupe/reconciliation (uppercase, trimmed, no internal spaces). */
export function normalizeDocumentNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, "").toUpperCase();
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const month = parseInt(us[1], 10) - 1;
    const day = parseInt(us[2], 10);
    let year = parseInt(us[3], 10);
    if (year < 100) year += 2000;
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export function parseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && !isNaN(value)) return value;
  const cleaned = String(value).replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function computeNetSuiteDaysOld(orderDate: Date | null, asOf: Date = new Date()): number | null {
  if (!orderDate) return null;
  return Math.max(0, daysBetween(orderDate, asOf));
}
