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

export type WodIvcsOrdersListQuery = {
  take: number;
  skip: number;
  q: string;
  queue: string | null;
  cityBeauty: string | null;
  includeCityBeauty: boolean;
  fivePlus: string | null;
  unassignedOnly: boolean;
  assignedToId: string;
  presenceNetSuite: WodIvcsPresenceState | null;
  presenceAging: WodIvcsPresenceState | null;
  reportPresence: string | null;
  operationalQueuesOnly: boolean;
  sortBy: WodIvcsOrdersSortField;
  sortDir: "asc" | "desc";
};

function parsePresenceFilter(value: string | null): WodIvcsPresenceState | null {
  if (!value) return null;
  if (value === "PRESENT" || value === "DROPPED" || value === "UNKNOWN") return value;
  return null;
}

export function parseWodIvcsOrdersListQuery(url: URL): WodIvcsOrdersListQuery {
  const { sortBy, sortDir } = parseWodIvcsOrdersSort(
    url.searchParams.get("sortBy"),
    url.searchParams.get("sortDir")
  );

  return {
    take: Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200),
    skip: Math.max(Number(url.searchParams.get("skip") ?? 0), 0),
    q: (url.searchParams.get("q") ?? "").trim(),
    queue: url.searchParams.get("queue"),
    cityBeauty: url.searchParams.get("cityBeauty"),
    includeCityBeauty: url.searchParams.get("includeCityBeauty") === "true",
    fivePlus: url.searchParams.get("fivePlus"),
    unassignedOnly: url.searchParams.get("unassignedOnly") === "true",
    assignedToId: (url.searchParams.get("assignedToId") ?? "").trim(),
    presenceNetSuite: parsePresenceFilter(url.searchParams.get("presenceNetSuite")),
    presenceAging: parsePresenceFilter(url.searchParams.get("presenceAging")),
    reportPresence: url.searchParams.get("reportPresence"),
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
  if (query.fivePlus === "true") and.push({ agingIsFivePlus: true });
  if (query.unassignedOnly) and.push({ assignedToId: null });
  if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
  if (query.presenceNetSuite) and.push({ presenceNetSuite: query.presenceNetSuite });
  if (query.presenceAging) and.push({ presenceAging: query.presenceAging });
  if (query.reportPresence === "on_netsuite") and.push({ presenceNetSuite: "PRESENT" });
  if (query.reportPresence === "on_aging") and.push({ presenceAging: "PRESENT" });
  if (query.reportPresence === "netsuite_only") {
    and.push({ presenceNetSuite: "PRESENT", presenceAging: { not: "PRESENT" } });
  }
  if (query.reportPresence === "aging_only") {
    and.push({ presenceAging: "PRESENT", presenceNetSuite: { not: "PRESENT" } });
  }
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
  if (query.fivePlus === "true") parts.push(PrismaNamespace.sql`o."agingIsFivePlus" = true`);
  if (query.unassignedOnly) parts.push(PrismaNamespace.sql`o."assignedToId" IS NULL`);
  if (query.assignedToId) parts.push(PrismaNamespace.sql`o."assignedToId" = ${query.assignedToId}`);
  if (query.presenceNetSuite) {
    parts.push(
      PrismaNamespace.sql`o."presenceNetSuite" = ${query.presenceNetSuite}::"WodIvcsPresenceState"`
    );
  }
  if (query.presenceAging) {
    parts.push(
      PrismaNamespace.sql`o."presenceAging" = ${query.presenceAging}::"WodIvcsPresenceState"`
    );
  }
  if (query.reportPresence === "on_netsuite") {
    parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'PRESENT'::"WodIvcsPresenceState"`);
  }
  if (query.reportPresence === "on_aging") {
    parts.push(PrismaNamespace.sql`o."presenceAging" = 'PRESENT'::"WodIvcsPresenceState"`);
  }
  if (query.reportPresence === "netsuite_only") {
    parts.push(PrismaNamespace.sql`o."presenceNetSuite" = 'PRESENT'::"WodIvcsPresenceState"`);
    parts.push(PrismaNamespace.sql`o."presenceAging" <> 'PRESENT'::"WodIvcsPresenceState"`);
  }
  if (query.reportPresence === "aging_only") {
    parts.push(PrismaNamespace.sql`o."presenceAging" = 'PRESENT'::"WodIvcsPresenceState"`);
    parts.push(PrismaNamespace.sql`o."presenceNetSuite" <> 'PRESENT'::"WodIvcsPresenceState"`);
  }
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
