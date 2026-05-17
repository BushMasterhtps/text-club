export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { moveRoutingRule, RoutingMatrixError } from "@/lib/wod-ivcs/routing-matrix-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { direction?: string };
    if (body.direction !== "up" && body.direction !== "down") {
      throw new RoutingMatrixError('direction must be "up" or "down"', 400, "INVALID_DIRECTION");
    }
    const result = await moveRoutingRule(prisma, id, body.direction, userId);
    return result;
  });
}
