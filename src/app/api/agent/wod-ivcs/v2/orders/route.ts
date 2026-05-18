export const runtime = "nodejs";

import type { Prisma, WodIvcsOperationalQueue } from "@prisma/client";
import { handleAgentWodApi, prisma } from "../_lib/handle-agent-wod-api";
import {
  AGENT_ORDER_LIST_SELECT,
  serializeAgentOrderListItem,
} from "../_lib/agent-order-serialization";

const DEFAULT_QUEUES: WodIvcsOperationalQueue[] = ["ASSIGNED", "IN_PROGRESS"];

function parseQueueFilter(value: string | null): WodIvcsOperationalQueue | null {
  if (!value) return null;
  if (value === "ASSIGNED" || value === "IN_PROGRESS") return value;
  return null;
}

export async function GET(request: Request) {
  return handleAgentWodApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const url = new URL(req.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200);
    const skip = Math.max(Number(url.searchParams.get("skip") ?? 0), 0);
    const q = (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "").trim();
    const queueFilter = parseQueueFilter(url.searchParams.get("queue"));

    const and: Prisma.WodIvcsOrderWhereInput[] = [
      { assignedToId: userId },
      { archivedAt: null },
      { operationalQueue: queueFilter ? queueFilter : { in: DEFAULT_QUEUES } },
    ];

    if (q) {
      and.push({
        OR: [
          { documentNumber: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { customerEmail: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.WodIvcsOrderWhereInput = { AND: and };

    const [total, orders] = await Promise.all([
      prisma.wodIvcsOrder.count({ where }),
      prisma.wodIvcsOrder.findMany({
        where,
        orderBy: [{ operationalQueue: "asc" }, { updatedAt: "desc" }],
        take,
        skip,
        select: AGENT_ORDER_LIST_SELECT,
      }),
    ]);

    return {
      total,
      orders: orders.map(serializeAgentOrderListItem),
    };
  });
}
