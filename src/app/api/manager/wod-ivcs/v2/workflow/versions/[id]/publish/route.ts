export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { publishWorkflowVersion } from "@/lib/wod-ivcs/workflow-config-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;
    const graph = await publishWorkflowVersion(prisma, id, userId);
    return graph;
  });
}
