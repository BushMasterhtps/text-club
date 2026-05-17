export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../../_lib/handle-workflow-api";
import { compileRoutingMatrixVersion } from "@/lib/wod-ivcs/routing-matrix-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;
    const result = await compileRoutingMatrixVersion(prisma, id, userId);
    return result;
  });
}
