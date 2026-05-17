export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { duplicateRoutingRule } from "@/lib/wod-ivcs/routing-matrix-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;
    const rule = await duplicateRoutingRule(prisma, id, userId);
    return { rule };
  });
}
