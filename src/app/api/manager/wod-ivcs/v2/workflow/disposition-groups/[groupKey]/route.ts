export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../_lib/handle-workflow-api";
import { getDispositionGroup } from "@/lib/wod-ivcs/routing-matrix-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupKey: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { groupKey } = await params;
    const group = await getDispositionGroup(prisma, groupKey);
    return { group };
  });
}
