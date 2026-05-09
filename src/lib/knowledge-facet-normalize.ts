/**
 * Knowledge Base facet normalization (Phase 1, no DB writes).
 *
 * These helpers only affect how /api/knowledge/facets clusters values and how
 * /api/knowledge/browse interprets email brand filters. Raw imported rows in
 * EmailMacro.brand and ProductInquiryQA.product are never modified.
 *
 * Rules are deterministic ASCII-only transforms — no fuzzy matching, Levenshtein, or ML.
 */

export type KnowledgeFacetOption = { label: string; values: string[] };

/** Full-cell literals (trimmed, compared case-insensitively) that stay one facet token — no comma splitting. */
const EMAIL_BRAND_WHOLE_CELL_LITERALS = new Set([
  "all brands",
  "all pet brands",
  "all retail brands",
  "myaccount brands",
]);

/**
 * Collapse internal ASCII whitespace to single spaces.
 */
export function collapseAsciiWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Facet clustering key for product names (and brand tokens after comma split).
 * - trim + lowercase + collapse whitespace
 * - remove all characters except a-z and 0-9 (punctuation/spacing between tokens drops away)
 *
 * Examples: "C-15 Advantage" and "C15 Advantage" → "c15advantage"
 */
export function alphanumericFacetKey(s: string): string {
  const base = collapseAsciiWhitespace(s).toLowerCase();
  return base.replace(/[^a-z0-9]/g, "");
}

/**
 * Pick a single human-readable label from raw variants in a cluster.
 * Prefer longer strings (often more descriptive), then stable locale order.
 */
export function pickFacetLabel(candidates: string[]): string {
  const uniq = [...new Set(candidates.filter((c) => c.trim().length > 0))];
  if (uniq.length === 0) return "";
  uniq.sort(
    (a, b) =>
      b.trim().length - a.trim().length || a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" })
  );
  return uniq[0]!.trim();
}

/**
 * Cluster raw DB strings into facet options using a deterministic key function.
 * Each option's `values` lists every distinct raw string in that cluster (for exact IN queries).
 */
export function clusterByFacetKey(rawValues: string[], keyOf: (raw: string) => string): KnowledgeFacetOption[] {
  const byKey = new Map<string, Set<string>>();
  for (const raw of rawValues) {
    if (raw == null || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = keyOf(trimmed);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(raw);
  }
  const out: KnowledgeFacetOption[] = [];
  for (const [, set] of byKey) {
    const values = Array.from(set).sort((a, b) =>
      a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" })
    );
    out.push({ label: pickFacetLabel(values), values });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}

/**
 * Split EmailMacro.brand into atomic tokens for facets and filtering.
 * - Primary delimiter: comma (CSV-style combined brands).
 * - Whole-cell matches for reserved "All * Brands" style literals are kept unsplit.
 */
export function splitEmailBrandIntoTokens(brand: string | null | undefined): string[] {
  if (brand == null) return [];
  const cell = brand.trim();
  if (!cell) return [];

  const literalKey = cell.toLowerCase();
  if (EMAIL_BRAND_WHOLE_CELL_LITERALS.has(literalKey)) {
    return [cell];
  }

  const parts = cell.split(",");
  const tokens: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t) tokens.push(t);
  }
  return tokens.length > 0 ? tokens : [];
}

/**
 * Build email macro brand facet options from distinct raw brand cells (groupBy).
 * Expands comma lists, clusters token spellings with alphanumericFacetKey, values[] = raw token spellings for SQL IN.
 */
export function clusterEmailBrandTokensFromRawCells(rawBrandCells: string[]): KnowledgeFacetOption[] {
  const byKey = new Map<string, Set<string>>();
  for (const cell of rawBrandCells) {
    if (!cell || !cell.trim()) continue;
    for (const token of splitEmailBrandIntoTokens(cell)) {
      const key = alphanumericFacetKey(token);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(token.trim());
    }
  }
  const out: KnowledgeFacetOption[] = [];
  for (const [, set] of byKey) {
    const values = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    out.push({ label: pickFacetLabel(values), values });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}
