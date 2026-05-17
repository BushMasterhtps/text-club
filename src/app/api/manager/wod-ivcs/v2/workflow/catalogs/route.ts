export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../_lib/handle-workflow-api";
import { listCatalogs } from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const catalogs = await listCatalogs(prisma);
    return {
      catalogs: catalogs.map((c) => ({
        id: c.id,
        catalogType: c.catalogType,
        slug: c.slug,
        displayName: c.displayName,
        isActive: c.isActive,
        optionCount: c._count.options,
        options: c.options,
      })),
    };
  });
}
