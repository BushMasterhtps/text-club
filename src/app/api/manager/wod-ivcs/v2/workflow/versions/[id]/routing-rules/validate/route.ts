export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../../_lib/handle-workflow-api";
import { validateRoutingMatrixVersion } from "@/lib/wod-ivcs/routing-matrix-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { id } = await params;
    const validation = await validateRoutingMatrixVersion(prisma, id);
    return { validation };
  });
}
