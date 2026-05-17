export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../_lib/handle-workflow-api";
import { getActiveWorkflowDefinition } from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { definition, publishedVersion } = await getActiveWorkflowDefinition(prisma);
    return {
      definition,
      publishedVersion,
    };
  });
}
