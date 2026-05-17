export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import {
  isWodIvcsOperationalQueue,
  moveWodIvcsOrdersToQueue,
} from "@/lib/wod-ivcs/order-mutation-service";

export async function POST(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = await request.json().catch(() => null);
    const orderIds = body?.orderIds;
    const targetQueue =
      typeof body?.targetQueue === "string" ? body.targetQueue.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : undefined;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : undefined;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "orderIds must be a non-empty array", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    if (!targetQueue || !isWodIvcsOperationalQueue(targetQueue)) {
      return NextResponse.json(
        { success: false, error: "targetQueue is invalid", code: "INVALID_BODY" },
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

    const result = await moveWodIvcsOrdersToQueue(prisma, {
      orderIds: ids,
      targetQueue,
      actorId: auth.userId,
      note,
      agentId: agentId || undefined,
    });

    if ("error" in result) {
      const status =
        result.code === "AGENT_NOT_FOUND"
          ? 404
          : result.code === "INVALID_TARGET_QUEUE" ||
              result.code === "ASSIGNED_REQUIRES_AGENT" ||
              result.code === "IN_PROGRESS_MOVE_BLOCKED"
            ? 400
            : 400;
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      moved: result.moved,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders/move-queue]", error);
    return NextResponse.json(
      { success: false, error: "Failed to move orders", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
