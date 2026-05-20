import type { Prisma, WodIvcsPresenceState } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { excludeCityBeautyFromOperationalQueues } from "./city-beauty";
import { isWodIvcsOperationalQueue } from "./order-mutation-service";
import {
  buildCustomerDisplayNameOrderBySql,
  buildWodIvcsOrdersOrderBy,
  isCustomerDisplayNameSort,
  parseWodIvcsOrdersSort,
  type WodIvcsOrdersSortField,
} from "./orders-list-sort";

const OPERATIONAL_QUEUES_FOR_ASSIGNMENT = [
  "NEEDS_ACTION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_DROP_OFF",
  "NEEDS_REVIEW",
  "IT_REVIEW",
] as const;

const ORDER_LIST_INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  cases: { select: { sourceReportType: true, presenceState: true, lastSeenAt: true } },
} as const;

export const WOD_IVCS_REPORT_PRESENCE_FILTERS = [
  "on_netsuite",
  "on_aging",
  "both",
  "netsuite_only",
  "aging_only",
  "dropped_netsuite",
  "dropped_aging",
  "unknown_netsuite",
  "unknown_aging",
] as const;

export type WodIvcsReportPresenceFilter = (typeof WOD_IVCS_REPORT_PRESENCE_FILTERS)[number];

export const WOD_IVCS_AGE_BUCKETS = ["all", "0_1", "2_4", "5_plus"] as const;

export type WodIvcsAgeBucket = (typeof WOD_IVCS_AGE_BUCKETS)[number];

export type WodIvcsOrdersListQuery = {
  take: number;
  skip: number;
  q: string;
  queue: string | null;
  cityBeauty: string | null;
  includeCityBeauty: boolean;
  /** Legacy query param; resolved into ageBucket at parse when ageBucket is omitted. */
  fivePlus: string | null;
  ageBucket: WodIvcsAgeBucket;
  unassignedOnly: boolean;
  assignedToId: string;
  /** Direct presence filters (legacy API); ignored when reportPresence is set. */
  presenceNetSuite: WodIvcsPresenceState | null;
  presenceAging: WodIvcsPresenceState | null;
  reportPresence: WodIvcsReportPresenceFilter | null;
  orderDateFrom: string | null;
  orderDateTo: string | null;
  operationalQueuesOnly: boolean;
  sortBy: WodIvcsOrdersSortField;
  sortDir: "asc" | "desc";
};

function parsePresenceFilter(value: string | null): WodIvcsPresenceState | null {
  if (!value) return null;
  if (value === "PRESENT" || value === "DROPPED" || value === "UNKNOWN") return value;
  return null;
}

function parseReportPresenceFilter(
  value: string | null
): WodIvcsReportPresenceFilter | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "all") return null;
  if ((WOD_IVCS_REPORT_PRESENCE_FILTERS as readonly string[]).includes(trimmed)) {
    return trimmed as WodIvcsReportPresenceFilter;
  }
  return null;
}

function parseAgeBucket(
  ageBucketParam: string | null,
  fivePlusLegacy: string | null
): { bucket: WodIvcsAgeBucket; invalid: boolean } {
  const trimmed = ageBucketParam?.trim() ?? "";
  if (trimmed) {
    if ((WOD_IVCS_AGE_BUCKETS as readonly string[]).includes(trimmed)) {
      return { bucket: trimmed as WodIvcsAgeBucket, invalid: false };
    }
    return { bucket: "all", invalid: true };
  }
  if (fivePlusLegacy === "true") return { bucket: "5_plus", invalid: false };
  return { bucket: "all", invalid: false };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateParam(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!ISO_DATE_RE.test(trimmed)) return "invalid";
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return "invalid";
  }
  return trimmed;
}

function startOfUtcDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function endOfUtcDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

function appendReportPresenceToPrisma(
  and: Prisma.WodIvcsOrderWhereInput[],
  reportPresence: WodIvcsReportPresenceFilter | null,
  presenceNetSuite: WodIvcsPresenceState | null,
  presenceAging: WodIvcsPresenceState | null
): void {
  if (reportPresence) {
    switch (reportPresence) {
      case "on_netsuite":
        and.push({ presenceNetSuite: "PRESENT" });
        break;
      case "on_aging":
        and.push({ presenceAging: "PRESENT" });
        break;
      case "both":
        and.push({ presenceNetSuite: "PRESENT", presenceAging: "PRESENT" });
        break;
      case "netsuite_only":
        and.push({ presenceNetSuite: "PRESENT", presenceAging: { not: "PRESENT" } });
        break;
      case "aging_only":
        and.push({ presenceAging: "PRESENT", presenceNetSuite: { not: "PRESENT" } });
        break;
      case "dropped_netsuite":
        and.push({ presenceNetSuite: "DROPPED" });
        break;
      case "dropped_aging":
        and.push({ presenceAging: "DROPPED" });
        break;
      case "unknown_netsuite":
        and.push({ presenceNetSuite: "UNKNOWN" });
        break;
      case "unknown_aging":
        and.push({ presenceAging: "UNKNOWN" });
        break;
    }
    return;
  }
  if (presenceNetSuite) and.push({ presenceNetSuite });
  if (presenceAging) and.push({ presenceAging });
}

function appendReportPresenceToSql(
  parts: PrismaNamespace.Sql[],
  reportPresence: WodIvcsReportPresenceFilter | null,
  presenceNetSuite: WodIvcsPresenceState | null,
  presenceAging: WodIvcsPresenceState | null
): void {
  if (reportPresence) {
    switch (reportPresence) {
      case "on_netsuite":
        parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'PRESENT'::"WodIvcsPresenceState"`);
        break;
      case "on_aging":
        parts.push(PrismaNamespace.sql`o."presenceAging" = 'PRESENT'::"WodIvcsPresenceState"`);
        break;
      case "both":
        parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'PRESENT'::"WodIvcsPresenceState"`);
        parts.push(PrismaNamespace.sql`o."presenceAging" = 'PRESENT'::"WodIvcsPresenceState"`);
        break;
      case "netsuite_only":
        parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'PRESENT'::"WodIvcsPresenceState"`);
        parts.push(PrismaNamespace.sql`o."presenceAging" <> 'PRESENT'::"WodIvcsPresenceState"`);
        break;
      case "aging_only":
        parts.push(PrismaNamespace.sql`o."presenceAging" = 'PRESENT'::"WodIvcsPresenceState"`);
        parts.push(PrismaNamespace.sql`o."presenceNetSuite" <> 'PRESENT'::"WodIvcsPresenceState"`);
        break;
      case "dropped_netsuite":
        parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'DROPPED'::"WodIvcsPresenceState"`);
        break;
      case "dropped_aging":
        parts.push(PrismaNamespace.sql`o."presenceAging" = 'DROPPED'::"WodIvcsPresenceState"`);
        break;
      case "unknown_netsuite":
        parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'UNKNOWN'::"WodIvcsPresenceState"`);
        break;
      case "unknown_aging":
        parts.push(PrismaNamespace.sql`o."presenceAging" = 'UNKNOWN'::"WodIvcsPresenceState"`);
        break;
    }
    return;
  }
  if (presenceNetSuite) {
    parts.push(
      PrismaNamespace.sql`o."presenceNetSuite" = ${presenceNetSuite}::"WodIvcsPresenceState"`
    );
  }
  if (presenceAging) {
    parts.push(
      PrismaNamespace.sql`o."presenceAging" = ${presenceAging}::"WodIvcsPresenceState"`
    );
  }
}

function appendAgeBucketToPrisma(and: Prisma.WodIvcsOrderWhereInput[], ageBucket: WodIvcsAgeBucket): void {
  switch (ageBucket) {
    case "0_1":
      and.push({ netSuiteDaysOld: { gte: 0, lte: 1 } });
      break;
    case "2_4":
      and.push({ netSuiteDaysOld: { gte: 2, lte: 4 } });
      break;
    case "5_plus":
      and.push({
        OR: [{ netSuiteDaysOld: { gte: 5 } }, { agingIsFivePlus: true }],
      });
      break;
    case "all":
      break;
  }
}

function appendAgeBucketToSql(parts: PrismaNamespace.Sql[], ageBucket: WodIvcsAgeBucket): void {
  switch (ageBucket) {
    case "0_1":
      parts.push(
        PrismaNamespace.sql`o."netSuiteDaysOld" IS NOT NULL AND o."netSuiteDaysOld" >= 0 AND o."netSuiteDaysOld" <= 1`
      );
      break;
    case "2_4":
      parts.push(
        PrismaNamespace.sql`o."netSuiteDaysOld" IS NOT NULL AND o."netSuiteDaysOld" >= 2 AND o."netSuiteDaysOld" <= 4`
      );
      break;
    case "5_plus":
      parts.push(
        PrismaNamespace.sql`(o."netSuiteDaysOld" >= 5 OR o."agingIsFivePlus" = true)`
      );
      break;
    case "all":
      break;
  }
}

function appendOrderDateRangeToPrisma(
  and: Prisma.WodIvcsOrderWhereInput[],
  orderDateFrom: string | null,
  orderDateTo: string | null
): void {
  if (orderDateFrom) {
    and.push({ orderDateFromNetSuiteReport: { gte: startOfUtcDay(orderDateFrom) } });
  }
  if (orderDateTo) {
    and.push({ orderDateFromNetSuiteReport: { lte: endOfUtcDay(orderDateTo) } });
  }
}

function appendOrderDateRangeToSql(
  parts: PrismaNamespace.Sql[],
  orderDateFrom: string | null,
  orderDateTo: string | null
): void {
  if (orderDateFrom) {
    parts.push(
      PrismaNamespace.sql`o."orderDateFromNetSuiteReport" >= ${startOfUtcDay(orderDateFrom)}`
    );
  }
  if (orderDateTo) {
    parts.push(
      PrismaNamespace.sql`o."orderDateFromNetSuiteReport" <= ${endOfUtcDay(orderDateTo)}`
    );
  }
}

export function parseWodIvcsOrdersListQuery(url: URL): WodIvcsOrdersListQuery {
  const { sortBy, sortDir } = parseWodIvcsOrdersSort(
    url.searchParams.get("sortBy"),
    url.searchParams.get("sortDir")
  );

  const ageBucketParam = url.searchParams.get("ageBucket");
  const fivePlusLegacy = url.searchParams.get("fivePlus");
  const parsedAge =
    ageBucketParam != null && ageBucketParam !== ""
      ? parseAgeBucket(ageBucketParam, null)
      : parseAgeBucket(null, fivePlusLegacy);
  if (parsedAge.invalid) throw new Error("INVALID_AGE_BUCKET");
  const ageBucket = parsedAge.bucket;

  const reportPresence = parseReportPresenceFilter(url.searchParams.get("reportPresence"));
  const reportPresenceRaw = url.searchParams.get("reportPresence")?.trim() ?? "";
  if (
    reportPresenceRaw &&
    reportPresenceRaw !== "all" &&
    reportPresence === null
  ) {
    throw new Error("INVALID_REPORT_PRESENCE");
  }

  const orderDateFrom = parseIsoDateParam(url.searchParams.get("orderDateFrom"));
  const orderDateTo = parseIsoDateParam(url.searchParams.get("orderDateTo"));
  if (orderDateFrom === "invalid" || orderDateTo === "invalid") {
    throw new Error("INVALID_DATE");
  }

  return {
    take: Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200),
    skip: Math.max(Number(url.searchParams.get("skip") ?? 0), 0),
    q: (url.searchParams.get("q") ?? "").trim(),
    queue: url.searchParams.get("queue"),
    cityBeauty: url.searchParams.get("cityBeauty"),
    includeCityBeauty: url.searchParams.get("includeCityBeauty") === "true",
    fivePlus: fivePlusLegacy,
    ageBucket,
    unassignedOnly: url.searchParams.get("unassignedOnly") === "true",
    assignedToId: (url.searchParams.get("assignedToId") ?? "").trim(),
    presenceNetSuite: reportPresence
      ? null
      : parsePresenceFilter(url.searchParams.get("presenceNetSuite")),
    presenceAging: reportPresence
      ? null
      : parsePresenceFilter(url.searchParams.get("presenceAging")),
    reportPresence,
    orderDateFrom,
    orderDateTo,
    operationalQueuesOnly: url.searchParams.get("operationalQueuesOnly") === "true",
    sortBy,
    sortDir,
  };
}

export function buildWodIvcsOrdersWhereInput(
  query: WodIvcsOrdersListQuery
): Prisma.WodIvcsOrderWhereInput {
  const and: Prisma.WodIvcsOrderWhereInput[] = [{ archivedAt: null }];

  if (query.queue) {
    if (!isWodIvcsOperationalQueue(query.queue)) {
      throw new Error("INVALID_QUEUE");
    }
    and.push({ operationalQueue: query.queue });
  } else if (query.operationalQueuesOnly) {
    and.push({ operationalQueue: { in: [...OPERATIONAL_QUEUES_FOR_ASSIGNMENT] } });
  }
  if (query.cityBeauty === "true") {
    and.push({ isCityBeauty: true });
  } else if (!query.includeCityBeauty) {
    and.push(excludeCityBeautyFromOperationalQueues());
  }
  appendAgeBucketToPrisma(and, query.ageBucket);
  if (query.unassignedOnly) and.push({ assignedToId: null });
  if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
  appendReportPresenceToPrisma(
    and,
    query.reportPresence,
    query.presenceNetSuite,
    query.presenceAging
  );
  appendOrderDateRangeToPrisma(and, query.orderDateFrom, query.orderDateTo);
  if (query.q) {
    and.push({
      OR: [
        { documentNumber: { contains: query.q, mode: "insensitive" } },
        { customerName: { contains: query.q, mode: "insensitive" } },
        { customerEmail: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: and };
}

/** SQL WHERE mirror of buildWodIvcsOrdersWhereInput (alias `o`). */
export function buildWodIvcsOrdersWhereSql(query: WodIvcsOrdersListQuery): PrismaNamespace.Sql {
  const parts: PrismaNamespace.Sql[] = [PrismaNamespace.sql`o."archivedAt" IS NULL`];

  if (query.queue) {
    parts.push(
      PrismaNamespace.sql`o."operationalQueue" = ${query.queue}::"WodIvcsOperationalQueue"`
    );
  } else if (query.operationalQueuesOnly) {
    parts.push(
      PrismaNamespace.sql`o."operationalQueue" IN (${PrismaNamespace.join(
        OPERATIONAL_QUEUES_FOR_ASSIGNMENT.map((q) => PrismaNamespace.sql`${q}::"WodIvcsOperationalQueue"`),
        ", "
      )})`
    );
  }
  if (query.cityBeauty === "true") {
    parts.push(PrismaNamespace.sql`o."isCityBeauty" = true`);
  } else if (!query.includeCityBeauty) {
    parts.push(PrismaNamespace.sql`o."isCityBeauty" = false`);
    parts.push(PrismaNamespace.sql`o."documentNumberNormalized" NOT LIKE 'CB%'`);
  }
  appendAgeBucketToSql(parts, query.ageBucket);
  if (query.unassignedOnly) parts.push(PrismaNamespace.sql`o."assignedToId" IS NULL`);
  if (query.assignedToId) parts.push(PrismaNamespace.sql`o."assignedToId" = ${query.assignedToId}`);
  appendReportPresenceToSql(
    parts,
    query.reportPresence,
    query.presenceNetSuite,
    query.presenceAging
  );
  appendOrderDateRangeToSql(parts, query.orderDateFrom, query.orderDateTo);
  if (query.q) {
    const pattern = `%${query.q}%`;
    parts.push(PrismaNamespace.sql`(
      o."documentNumber" ILIKE ${pattern}
      OR o."customerName" ILIKE ${pattern}
      OR o."customerEmail" ILIKE ${pattern}
    )`);
  }

  return PrismaNamespace.join(parts, " AND ");
}

type OrderRow = Prisma.WodIvcsOrderGetPayload<{ include: typeof ORDER_LIST_INCLUDE }>;

async function fetchOrdersByIdsInOrder(
  prisma: PrismaClient,
  ids: string[]
): Promise<OrderRow[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.wodIvcsOrder.findMany({
    where: { id: { in: ids } },
    include: ORDER_LIST_INCLUDE,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is OrderRow => r != null);
}

async function fetchOrdersSortedByDisplayCustomerName(
  prisma: PrismaClient,
  query: WodIvcsOrdersListQuery
): Promise<OrderRow[]> {
  const whereSql = buildWodIvcsOrdersWhereSql(query);
  const orderSql = buildCustomerDisplayNameOrderBySql(query.sortDir);

  const idRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o.id
    FROM "WodIvcsOrder" o
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ${query.take} OFFSET ${query.skip}
  `;

  return fetchOrdersByIdsInOrder(
    prisma,
    idRows.map((r) => r.id)
  );
}

export async function fetchWodIvcsOrdersList(
  prisma: PrismaClient,
  query: WodIvcsOrdersListQuery
): Promise<{ total: number; orders: OrderRow[] }> {
  const where = buildWodIvcsOrdersWhereInput(query);
  const total = await prisma.wodIvcsOrder.count({ where });

  if (isCustomerDisplayNameSort(query.sortBy)) {
    const orders = await fetchOrdersSortedByDisplayCustomerName(prisma, query);
    return { total, orders };
  }

  const orders = await prisma.wodIvcsOrder.findMany({
    where,
    orderBy: buildWodIvcsOrdersOrderBy(query.sortBy, query.sortDir),
    take: query.take,
    skip: query.skip,
    include: ORDER_LIST_INCLUDE,
  });

  return { total, orders };
}
