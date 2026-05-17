export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { unassignWodIvcsOrders } from "@/lib/wod-ivcs/order-mutation-service";

export async function POST(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = await request.json().catch(() => null);
    const orderIds = body?.orderIds;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "orderIds must be a non-empty array", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const ids = orderIds.filter((id: unknown) => typeof id === "string" && id.length > 0);
    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid order IDs provided", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const result = await unassignWodIvcsOrders(prisma, {
      orderIds: ids,
      actorId: auth.userId,
    });

    return NextResponse.json({
      success: true,
      unassigned: result.unassigned,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders/unassign]", error);
    return NextResponse.json(
      { success: false, error: "Failed to unassign orders", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
