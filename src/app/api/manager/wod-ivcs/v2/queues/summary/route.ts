export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { buildWodIvcsQueuesSummary } from "@/lib/wod-ivcs/queues-summary-service";

export async function GET(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const summary = await buildWodIvcsQueuesSummary(prisma);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("[wod-ivcs/v2/queues/summary]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load queue summary" },
      { status: 500 }
    );
  }
}
