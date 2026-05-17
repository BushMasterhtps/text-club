export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { buildReversalPlan, persistReversalPreview } from "@/lib/wod-ivcs/reversal-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { id } = await params;
    const plan = await buildReversalPlan(prisma, id);
    await persistReversalPreview(prisma, id, plan);

    const ordersToArchive = plan.orders.filter((o) => o.action === "ARCHIVE");
    const ordersToRestore = plan.orders.filter((o) => o.action === "RESTORE_SOURCE");
    const dropsToUndo = plan.orders.filter((o) => o.action === "RESTORE_PRESENCE_ONLY");
    const blockedOrders = plan.orders.filter((o) => o.action === "BLOCKED");

    return NextResponse.json({
      success: true,
      importRunId: plan.importRunId,
      sourceReportType: plan.sourceReportType,
      canFullyReverse: plan.canFullyReverse,
      blockers: plan.blockers,
      warnings: plan.warnings,
      summary: plan.summary,
      ordersToArchive,
      ordersToRestore,
      dropsToUndo,
      blockedOrders,
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/import/runs/[id]/reverse/preview]", error);
    const message = error instanceof Error ? error.message : "Preview failed";
    const status = message === "Import run not found" ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
