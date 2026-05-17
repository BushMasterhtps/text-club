import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { RoutingMatrixError } from "@/lib/wod-ivcs/routing-matrix-service";
import { WorkflowConfigError } from "@/lib/wod-ivcs/workflow-config-service";
import { prisma } from "@/lib/prisma";

export async function handleWorkflowApi<T>(
  request: NextRequest,
  handler: (ctx: { userId: string; request: NextRequest }) => Promise<T>
) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const data = await handler({ userId: auth.userId, request });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    if (error instanceof WorkflowConfigError || error instanceof RoutingMatrixError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error("[wod-ivcs/v2/workflow]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Request failed",
      },
      { status: 500 }
    );
  }
}

export { prisma };
