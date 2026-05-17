export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import {
  executeReversal,
  MIN_REVERSAL_REASON_LENGTH,
} from "@/lib/wod-ivcs/reversal-service";

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
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason : "";

    if (reason.trim().length < MIN_REVERSAL_REASON_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `A reversal reason of at least ${MIN_REVERSAL_REASON_LENGTH} characters is required.`,
        },
        { status: 400 }
      );
    }

    const result = await executeReversal(prisma, {
      importRunId: id,
      actorId: auth.userId,
      reason,
    });

    return NextResponse.json({
      success: true,
      status: result.status,
      summary: result.plan.summary,
      applied: result.applied,
      canFullyReverse: result.plan.canFullyReverse,
      blockedOrders: result.plan.orders.filter((o) => o.action === "BLOCKED"),
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : null;
    const plan =
      error && typeof error === "object" && "plan" in error
        ? (error as { plan: unknown }).plan
        : undefined;

    console.error("[wod-ivcs/v2/import/runs/[id]/reverse]", error);

    if (code === "ALL_BLOCKED") {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "All orders blocked",
          plan,
        },
        { status: 409 }
      );
    }

    if (code === "ALREADY_REVERSED") {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Already reversed",
        },
        { status: 409 }
      );
    }

    if (code === "NOT_REVERSIBLE") {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Not reversible",
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Reversal failed";
    const status = message === "Import run not found" ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
