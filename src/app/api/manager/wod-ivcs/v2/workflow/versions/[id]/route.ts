export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../_lib/handle-workflow-api";
import {
  getWorkflowVersionGraph,
  updateDraftVersionMetadata,
} from "@/lib/wod-ivcs/workflow-config-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async () => {
    const { id } = await params;
    const graph = await getWorkflowVersionGraph(prisma, id);
    return graph;
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { notes?: string | null };

    const version = await updateDraftVersionMetadata(prisma, id, {
      actorId: userId,
      notes: body.notes,
    });

    return { version };
  });
}
