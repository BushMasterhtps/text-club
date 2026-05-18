export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { buildManagerOrderDetail } from "@/lib/wod-ivcs/manager-order-detail-service";

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
    const detail = await buildManagerOrderDetail(prisma, id);

    if (!detail) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: detail.order,
      synopsisRows: detail.synopsisRows,
      managerRows: detail.managerRows,
      latestSubmission: detail.latestSubmission,
      awaitingDropOffReview: detail.awaitingDropOffReview,
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders/[id]]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load order" },
      { status: 500 }
    );
  }
}
