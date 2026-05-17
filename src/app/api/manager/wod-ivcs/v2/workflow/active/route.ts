export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../_lib/handle-workflow-api";
import { getActiveWorkflowGraph } from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const active = await getActiveWorkflowGraph(prisma);
    return { active };
  });
}
