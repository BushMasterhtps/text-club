export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import { discardDraftVersion } from "@/lib/wod-ivcs/workflow-config-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;
    const result = await discardDraftVersion(prisma, id, userId);
    return result;
  });
}
