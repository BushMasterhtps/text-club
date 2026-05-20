export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import {
  fetchWodIvcsOrdersList,
  parseWodIvcsOrdersListQuery,
} from "@/lib/wod-ivcs/orders-list-query";

export async function GET(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const url = new URL(request.url);
    const query = parseWodIvcsOrdersListQuery(url);
    const { total, orders } = await fetchWodIvcsOrdersList(prisma, query);

    return NextResponse.json({
      success: true,
      total,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
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
    if (error instanceof Error) {
      if (error.message === "INVALID_QUEUE") {
        return NextResponse.json(
          { success: false, error: "Invalid queue filter", code: "INVALID_QUERY" },
          { status: 400 }
        );
      }
      if (error.message === "INVALID_DATE") {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid order date filter. Use YYYY-MM-DD for orderDateFrom and orderDateTo.",
            code: "INVALID_QUERY",
          },
          { status: 400 }
        );
      }
      if (
        error.message === "INVALID_AGE_BUCKET" ||
        error.message === "INVALID_REPORT_PRESENCE"
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid filter parameter", code: "INVALID_QUERY" },
          { status: 400 }
        );
      }
    }
    console.error("[wod-ivcs/v2/orders]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load orders" },
      { status: 500 }
    );
  }
}
