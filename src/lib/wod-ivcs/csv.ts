import { parse } from "csv-parse/sync";

export function parseCsvText(csvText: string): Record<string, string>[] {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

/** Case-insensitive header lookup; returns first matching key from record. */
export function getColumnValue(
  row: Record<string, string>,
  aliases: string[]
): string | null {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find((k) => k.trim().toLowerCase() === alias.toLowerCase());
    if (found != null && row[found] != null && String(row[found]).trim() !== "") {
      return String(row[found]).trim();
    }
  }
  return null;
}

/** First column whose header matches alias list (order preserved by CSV column order). */
export function getFirstColumnByAliases(
  headers: string[],
  aliases: string[]
): string | null {
  const lowerAliases = aliases.map((a) => a.toLowerCase());
  for (const h of headers) {
    if (lowerAliases.includes(h.trim().toLowerCase())) return h;
  }
  return null;
}

export function csvHeaders(rows: Record<string, string>[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]);
}
