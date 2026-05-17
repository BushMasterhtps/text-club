export const runtime = "nodejs";

import { handleWorkflowApi, prisma } from "../../../_lib/handle-workflow-api";
import {
  replaceDraftOutcomeRules,
  WorkflowConfigError,
  type DraftOutcomeRulePayload,
} from "@/lib/wod-ivcs/workflow-config-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleWorkflowApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { rules?: DraftOutcomeRulePayload[] };

    if (!Array.isArray(body.rules)) {
      throw new WorkflowConfigError("rules array is required", 400);
    }

    const graph = await replaceDraftOutcomeRules(prisma, id, body.rules, userId);
    return graph;
  });
}
