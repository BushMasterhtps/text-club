export const runtime = "nodejs";

import { AgentWorkflowError, previewAgentWodIvcsWorkflow } from "@/lib/wod-ivcs/agent-workflow-service";
import { handleAgentWodApi, prisma } from "../../../../_lib/handle-agent-wod-api";

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

    const preview = await previewAgentWodIvcsWorkflow(prisma, {
      orderId: id,
      actorId: userId,
      answers: body.answers,
    });

    return {
      workflowVersionId: preview.workflowVersionId,
      validation: preview.validation,
      visibleSteps: preview.visibleSteps,
      matchedRoutingRule: preview.matchedRoutingRule,
      matchedOutcome: preview.matchedOutcome,
      predictedTargetQueue: preview.predictedTargetQueue,
      requiredConfirmations: {
        requiresRetriggerConfirmation: preview.matchedOutcome.requiresRetriggerConfirmation,
        requiresItEscalation: preview.matchedOutcome.requiresItEscalation,
        requiresReplacementOrderNumber: preview.matchedOutcome.requiresReplacementOrderNumber,
        requiresProcessedReship: preview.matchedOutcome.requiresProcessedReship,
      },
    };
  });
}
