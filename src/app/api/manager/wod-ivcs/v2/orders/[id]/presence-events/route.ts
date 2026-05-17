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
    const events = await prisma.wodIvcsReportPresenceEvent.findMany({
      where: { orderId: id },
      orderBy: { observedAt: "desc" },
      take: 100,
      include: {
        importRun: { select: { id: true, fileName: true, sourceReportType: true } },
      },
    });

    return NextResponse.json({
      success: true,
      events: events.map((e) => ({
        id: e.id,
        sourceReportType: e.sourceReportType,
        presenceState: e.presenceState,
        observedAt: e.observedAt.toISOString(),
        metadataJson: e.metadataJson,
        importRun: e.importRun,
      })),
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/orders/[id]/presence-events]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load presence events" },
      { status: 500 }
    );
  }
}
