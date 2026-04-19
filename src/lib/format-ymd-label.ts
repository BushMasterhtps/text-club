const DEFAULT_DISPLAY_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/**
 * Format a calendar `YYYY-MM-DD` string for UI.
 * `new Date("YYYY-MM-DD")` parses as UTC midnight and often renders as the prior local day;
 * this builds a local-midnight Date from the numeric parts instead.
 */
export function formatYmdStringForDisplay(
  ymd: string,
  locale = 'en-US',
  options: Intl.DateTimeFormatOptions = DEFAULT_DISPLAY_OPTS
): string {
  const trimmed = (ymd || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return trimmed;
  const local = new Date(y, m - 1, d);
  if (Number.isNaN(local.getTime())) return trimmed;
  return local.toLocaleDateString(locale, options);
}
