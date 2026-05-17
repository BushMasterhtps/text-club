export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { assignWodIvcsOrdersToAgent } from "@/lib/wod-ivcs/order-mutation-service";

export async function POST(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = await request.json().catch(() => null);
    const orderIds = body?.orderIds;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "orderIds must be a non-empty array", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "agentId is required", code: "INVALID_BODY" },
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

    const result = await assignWodIvcsOrdersToAgent(prisma, {
      orderIds: ids,
      agentId,
      actorId: auth.userId,
    });

    if ("error" in result) {
      const status = result.code === "AGENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      assigned: result.assigned,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders/assign]", error);
    return NextResponse.json(
      { success: false, error: "Failed to assign orders", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
