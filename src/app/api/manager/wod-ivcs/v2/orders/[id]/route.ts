export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { id } = await params;
    const order = await prisma.wodIvcsOrder.findUnique({
      where: { id },
      include: {
        cases: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdByImportRun: { select: { id: true, fileName: true, createdAt: true } },
        updatedByImportRun: { select: { id: true, fileName: true, createdAt: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        orderDateFromNetSuiteReport:
          order.orderDateFromNetSuiteReport?.toISOString() ?? null,
        lastSeenInNetSuiteAt: order.lastSeenInNetSuiteAt?.toISOString() ?? null,
        lastSeenInAgingAt: order.lastSeenInAgingAt?.toISOString() ?? null,
        droppedFromNetSuiteAt: order.droppedFromNetSuiteAt?.toISOString() ?? null,
        droppedFromAgingAt: order.droppedFromAgingAt?.toISOString() ?? null,
        awaitingDropOffStartedAt: order.awaitingDropOffStartedAt?.toISOString() ?? null,
        awaitingDropOffDeadlineAt: order.awaitingDropOffDeadlineAt?.toISOString() ?? null,
        archivedAt: order.archivedAt?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        cases: order.cases.map((c) => ({
          ...c,
          lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders/[id]]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load order" },
      { status: 500 }
    );
  }
}
