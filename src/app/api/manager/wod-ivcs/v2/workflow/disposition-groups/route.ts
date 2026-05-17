export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../_lib/handle-workflow-api";
import { listDispositionGroups } from "@/lib/wod-ivcs/routing-matrix-service";

export async function GET(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const groups = await listDispositionGroups(prisma);
    return { groups };
  });
}
