export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma, WodIvcsPresenceState } from "@prisma/client";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { isWodIvcsOperationalQueue } from "@/lib/wod-ivcs/order-mutation-service";

const OPERATIONAL_QUEUES_FOR_ASSIGNMENT = [
  "NEEDS_ACTION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_DROP_OFF",
  "NEEDS_REVIEW",
  "IT_REVIEW",
] as const;

function parsePresenceFilter(value: string | null): WodIvcsPresenceState | null {
  if (!value) return null;
  if (value === "PRESENT" || value === "DROPPED" || value === "UNKNOWN") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const url = new URL(request.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200);
    const skip = Math.max(Number(url.searchParams.get("skip") ?? 0), 0);
    const q = (url.searchParams.get("q") ?? "").trim();
    const queue = url.searchParams.get("queue");
    const cityBeauty = url.searchParams.get("cityBeauty");
    const fivePlus = url.searchParams.get("fivePlus");
    const unassignedOnly = url.searchParams.get("unassignedOnly") === "true";
    const assignedToId = (url.searchParams.get("assignedToId") ?? "").trim();
    const presenceNetSuite = parsePresenceFilter(url.searchParams.get("presenceNetSuite"));
    const presenceAging = parsePresenceFilter(url.searchParams.get("presenceAging"));
    const reportPresence = url.searchParams.get("reportPresence");
    const operationalQueuesOnly = url.searchParams.get("operationalQueuesOnly") === "true";
    const sortBy = url.searchParams.get("sortBy") ?? "updatedAt";
    const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    const and: Prisma.WodIvcsOrderWhereInput[] = [{ archivedAt: null }];

    if (queue) {
      if (!isWodIvcsOperationalQueue(queue)) {
        return NextResponse.json(
          { success: false, error: "Invalid queue filter", code: "INVALID_QUERY" },
          { status: 400 }
        );
      }
      and.push({ operationalQueue: queue });
    } else if (operationalQueuesOnly) {
      // Task Management global search — excludes COMPLETED/ARCHIVED (see Analytics/Reporting TODOs in wod-ivcs-queue-config.ts).
      and.push({ operationalQueue: { in: [...OPERATIONAL_QUEUES_FOR_ASSIGNMENT] } });
    }
    if (cityBeauty === "true") and.push({ isCityBeauty: true });
    if (fivePlus === "true") and.push({ agingIsFivePlus: true });
    if (unassignedOnly) and.push({ assignedToId: null });
    if (assignedToId) and.push({ assignedToId });
    if (presenceNetSuite) and.push({ presenceNetSuite });
    if (presenceAging) and.push({ presenceAging });
    if (reportPresence === "on_netsuite") and.push({ presenceNetSuite: "PRESENT" });
    if (reportPresence === "on_aging") and.push({ presenceAging: "PRESENT" });
    if (reportPresence === "netsuite_only") {
      and.push({ presenceNetSuite: "PRESENT", presenceAging: { not: "PRESENT" } });
    }
    if (reportPresence === "aging_only") {
      and.push({ presenceAging: "PRESENT", presenceNetSuite: { not: "PRESENT" } });
    }
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

    const orderBy: Prisma.WodIvcsOrderOrderByWithRelationInput[] =
      sortBy === "netSuiteDaysOld"
        ? [{ netSuiteDaysOld: { sort: sortDir, nulls: "last" } }, { updatedAt: "desc" }]
        : [{ updatedAt: sortDir }];

    const [total, orders] = await Promise.all([
      prisma.wodIvcsOrder.count({ where }),
      prisma.wodIvcsOrder.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          cases: { select: { sourceReportType: true, presenceState: true, lastSeenAt: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      orders: orders.map((o) => ({
        id: o.id,
        documentNumber: o.documentNumber,
        operationalQueue: o.operationalQueue,
        operationalStatus: o.operationalStatus,
        assignedToId: o.assignedToId,
        assignedTo: o.assignedTo
          ? {
              id: o.assignedTo.id,
              name: o.assignedTo.name,
              email: o.assignedTo.email,
            }
          : null,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        presenceNetSuite: o.presenceNetSuite,
        presenceAging: o.presenceAging,
        isCityBeauty: o.isCityBeauty,
        agingIsFivePlus: o.agingIsFivePlus,
        netSuiteDaysOld: o.netSuiteDaysOld,
        itemSummaryJson: o.itemSummaryJson,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        cases: o.cases.map((c) => ({
          ...c,
          lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
        })),
      })),
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load orders" },
      { status: 500 }
    );
  }
}
