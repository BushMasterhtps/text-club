/**
 * Read-only SQL fragments for EmailMacro.brand filtering when the UI sends
 * atomic brand tokens (comma-split semantics). Raw brand cells are unchanged;
 * matching is: any comma-separated segment equals any selected token (trim, case-insensitive).
 */

import { Prisma } from "@prisma/client";

/**
 * `tableAlias` must match the SQL alias for "EmailMacro" (e.g. `e`).
 */
export function emailMacroBrandMatchesTokensSql(tableAlias: string, tokens: string[]): Prisma.Sql {
  const cleaned = [...new Set(tokens.map((t) => t.trim()).filter((t) => t.length > 0))];
  if (cleaned.length === 0) return Prisma.sql`TRUE`;

  const brandRef = Prisma.raw(`"${tableAlias}"."brand"`);
  const segMatch = Prisma.join(
    cleaned.map((t) => Prisma.sql`(lower(trim(seg)) = lower(trim(${t})))`),
    " OR "
  );

  return Prisma.sql`EXISTS (
    SELECT 1
    FROM unnest(string_to_array(COALESCE(${brandRef}, ''), ',')) AS seg
    WHERE trim(seg) <> '' AND (${segMatch})
  )`;
}

/**
 * Token segment match OR legacy whole-cell match (case-insensitive trim).
 * Supports older callers that pass a full raw `brand` string in brandIn instead of atomic tokens.
 */
export function emailMacroBrandMatchesTokensOrLegacySql(tableAlias: string, tokens: string[]): Prisma.Sql {
  const cleaned = [...new Set(tokens.map((t) => t.trim()).filter((t) => t.length > 0))];
  if (cleaned.length === 0) return Prisma.sql`TRUE`;

  const tokenPart = emailMacroBrandMatchesTokensSql(tableAlias, cleaned);
  const brandRef = Prisma.raw(`"${tableAlias}"."brand"`);
  const legacyCells = Prisma.join(
    cleaned.map((b) => Prisma.sql`(${brandRef} IS NOT NULL AND lower(trim(${brandRef})) = lower(trim(${b})))`),
    " OR "
  );

  return Prisma.sql`(${tokenPart} OR (${legacyCells}))`;
}
