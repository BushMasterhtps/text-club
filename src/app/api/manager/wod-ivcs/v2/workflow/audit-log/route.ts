export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../_lib/handle-workflow-api";
import { listWorkflowAuditLog } from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ request: req }) => {
    const url = new URL(req.url);
    const result = await listWorkflowAuditLog(prisma, {
      action: url.searchParams.get("action") ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
      actorId: url.searchParams.get("actorId") ?? undefined,
      take: Number(url.searchParams.get("take") ?? 50),
      skip: Number(url.searchParams.get("skip") ?? 0),
    });

    return {
      total: result.total,
      entries: result.entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
