import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";

/** Server-side sort fields for GET /api/manager/wod-ivcs/v2/orders (scalar / relation only). */
export const WOD_IVCS_ORDERS_SORT_FIELDS = [
  "documentNumber",
  "customerName",
  "netSuiteDaysOld",
  "updatedAt",
  "assignedToName",
  "presenceNetSuite",
  "presenceAging",
  "operationalQueue",
] as const;

export type WodIvcsOrdersSortField = (typeof WOD_IVCS_ORDERS_SORT_FIELDS)[number];

export const DEFAULT_WOD_IVCS_ORDERS_SORT: {
  sortBy: WodIvcsOrdersSortField;
  sortDir: "asc" | "desc";
} = {
  sortBy: "netSuiteDaysOld",
  sortDir: "desc",
};

export function parseWodIvcsOrdersSort(
  sortByParam: string | null,
  sortDirParam: string | null
): { sortBy: WodIvcsOrdersSortField; sortDir: "asc" | "desc" } {
  const sortDir: "asc" | "desc" = sortDirParam === "asc" ? "asc" : "desc";
  const sortBy = WOD_IVCS_ORDERS_SORT_FIELDS.includes(sortByParam as WodIvcsOrdersSortField)
    ? (sortByParam as WodIvcsOrdersSortField)
    : DEFAULT_WOD_IVCS_ORDERS_SORT.sortBy;
  return { sortBy, sortDir };
}

/** Default direction when activating a new sort column in the UI. */
export function defaultSortDirForField(field: WodIvcsOrdersSortField): "asc" | "desc" {
  if (field === "netSuiteDaysOld" || field === "updatedAt") return "desc";
  return "asc";
}

export function isCustomerDisplayNameSort(sortBy: WodIvcsOrdersSortField): boolean {
  return sortBy === "customerName";
}

/**
 * Strip leading CUS/profile ID prefixes for display-name sorting (mirrors Postgres regexp_replace).
 * Display values are unchanged; used for tests/docs only.
 */
export function stripCustomerNameSortPrefix(customerName: string | null | undefined): string {
  if (!customerName?.trim()) return "";
  let value = customerName.trim();
  value = value.replace(/^CUS\d+\s+/i, "");
  value = value.replace(/^\d+\s+/, "");
  return value.trim();
}

/** LOWER(TRIM(normalized person name)) for ORDER BY on alias `o`. */
export function customerDisplayNameSortKeySql(): PrismaNamespace.Sql {
  return PrismaNamespace.sql`LOWER(TRIM(
    COALESCE(
      NULLIF(TRIM(
        regexp_replace(
          regexp_replace(COALESCE(o."customerName", ''), '^CUS[0-9]+\\s+', '', 'i'),
          '^[0-9]+\\s+', '', ''
        )
      ), ''),
      COALESCE(o."customerName", '')
    )
  ))`;
}

/** Server-side ORDER BY for sortBy=customerName (full filtered set, paginated). */
export function buildCustomerDisplayNameOrderBySql(sortDir: "asc" | "desc"): PrismaNamespace.Sql {
  const dir = sortDir === "asc" ? PrismaNamespace.raw("ASC") : PrismaNamespace.raw("DESC");
  const key = customerDisplayNameSortKeySql();
  return PrismaNamespace.sql`
    (CASE WHEN o."customerName" IS NULL THEN 1 ELSE 0 END) ASC,
    ${key} ${dir},
    o."customerName" ${dir},
    o."documentNumber" ASC,
    o."updatedAt" DESC
  `;
}

export function buildWodIvcsOrdersOrderBy(
  sortBy: WodIvcsOrdersSortField,
  sortDir: "asc" | "desc"
): Prisma.WodIvcsOrderOrderByWithRelationInput[] {
  const tiebreaker: Prisma.WodIvcsOrderOrderByWithRelationInput = { updatedAt: "desc" };

  switch (sortBy) {
    case "documentNumber":
      return [{ documentNumber: sortDir }, tiebreaker];
    case "customerName":
      // Raw SQL path in fetchWodIvcsOrdersList — Prisma orderBy uses full customerName string.
      return [{ customerName: { sort: sortDir, nulls: "last" } }, tiebreaker];
    case "netSuiteDaysOld":
      return [{ netSuiteDaysOld: { sort: sortDir, nulls: "last" } }, tiebreaker];
    case "updatedAt":
      return [{ updatedAt: sortDir }];
    case "assignedToName":
      return [
        { assignedTo: { name: { sort: sortDir, nulls: "last" } } },
        { assignedTo: { email: sortDir } },
        tiebreaker,
      ];
    case "presenceNetSuite":
      return [{ presenceNetSuite: sortDir }, tiebreaker];
    case "presenceAging":
      return [{ presenceAging: sortDir }, tiebreaker];
    case "operationalQueue":
      return [{ operationalQueue: sortDir }, tiebreaker];
    default:
      return [{ netSuiteDaysOld: { sort: sortDir, nulls: "last" } }, tiebreaker];
  }
}
