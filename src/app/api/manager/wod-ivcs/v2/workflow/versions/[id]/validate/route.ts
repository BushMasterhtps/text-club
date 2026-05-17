export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { validateWorkflowVersion } from "@/lib/wod-ivcs/workflow-config-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { id } = await params;
    const result = await validateWorkflowVersion(prisma, id);
    return { validation: result };
  });
}
