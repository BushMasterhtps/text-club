export const runtime = "nodejs";

import { startAgentWodIvcsWork } from "@/lib/wod-ivcs/agent-workflow-service";
import { handleAgentWodApi, prisma } from "../../../_lib/handle-agent-wod-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleAgentWodApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;
    const result = await startAgentWodIvcsWork(prisma, { orderId: id, actorId: userId });
    return {
      order: result.order,
      workflowVersionId: result.workflowVersionId,
      idempotent: result.idempotent,
    };
  });
}
