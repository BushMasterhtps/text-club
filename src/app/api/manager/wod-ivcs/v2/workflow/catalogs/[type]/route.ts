export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../_lib/handle-workflow-api";
import {
  getCatalogByType,
  normalizeCatalogType,
  WorkflowConfigError,
} from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { type } = await params;
    const catalogType = normalizeCatalogType(type);
    if (!catalogType) {
      throw new WorkflowConfigError(`Invalid catalog type: ${type}`, 400, "INVALID_CATALOG_TYPE");
    }
    const catalog = await getCatalogByType(prisma, catalogType);
    return { catalog };
  });
}
