export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../_lib/handle-workflow-api";
import {
  createDraftVersion,
  listWorkflowVersions,
} from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const versions = await listWorkflowVersions(prisma);
    return { versions };
  });
}

export async function POST(request: Request) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const body = (await req.json().catch(() => ({}))) as {
      cloneFromPublished?: boolean;
      notes?: string;
    };

    const graph = await createDraftVersion(prisma, {
      actorId: userId,
      cloneFromPublished: body.cloneFromPublished ?? true,
      notes: body.notes,
    });

    return {
      version: graph.version,
      catalogs: graph.catalogs,
      cloneSummary: graph.cloneSummary,
    };
  });
}
