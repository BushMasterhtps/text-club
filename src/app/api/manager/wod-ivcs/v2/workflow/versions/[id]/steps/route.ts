export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import {
  replaceDraftSteps,
  WorkflowConfigError,
  type DraftStepPayload,
} from "@/lib/wod-ivcs/workflow-config-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { steps?: DraftStepPayload[] };

    if (!Array.isArray(body.steps)) {
      throw new WorkflowConfigError("steps array is required", 400);
    }

    const graph = await replaceDraftSteps(prisma, id, body.steps, userId);
    return graph;
  });
}
