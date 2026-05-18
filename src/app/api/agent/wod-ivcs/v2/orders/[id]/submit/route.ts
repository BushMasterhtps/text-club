export const runtime = "nodejs";

import { AgentWorkflowError, submitAgentWodIvcsWorkflow } from "@/lib/wod-ivcs/agent-workflow-service";
import { handleAgentWodApi, prisma } from "../../../_lib/handle-agent-wod-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleAgentWodApi(request as import("next/server").NextRequest, async ({ userId, request: req }) => {
    const { id } = await params;
    let body: { answers?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      throw new AgentWorkflowError("Invalid JSON body", 400, "INVALID_BODY");
    }

    if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
      throw new AgentWorkflowError("answers object is required", 400, "INVALID_BODY");
    }

    const result = await submitAgentWodIvcsWorkflow(prisma, {
      orderId: id,
      actorId: userId,
      answers: body.answers,
    });

    return {
      submissionId: result.submissionId,
      targetQueue: result.targetQueue,
      matchedRoutingRule: result.matchedRoutingRule,
      matchedOutcome: result.matchedOutcome,
      order: result.order,
    };
  });
}
