export const runtime = "nodejs";

import { AgentWorkflowError } from "@/lib/wod-ivcs/agent-workflow-service";
import { handleAgentWodApi, prisma } from "../../_lib/handle-agent-wod-api";
import { serializeAgentOrderSummary } from "../../_lib/agent-order-serialization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleAgentWodApi(request as import("next/server").NextRequest, async ({ userId }) => {
    const { id } = await params;

    const order = await prisma.wodIvcsOrder.findFirst({
      where: { id, assignedToId: userId },
      select: {
        id: true,
        documentNumber: true,
        customerName: true,
        customerEmail: true,
        operationalQueue: true,
        operationalStatus: true,
        assignedToId: true,
        presenceNetSuite: true,
        presenceAging: true,
        netSuiteDaysOld: true,
        agingIsFivePlus: true,
        isCityBeauty: true,
        activeWorkflowVersionId: true,
        workStartedAt: true,
        workStartedById: true,
        itemSummaryJson: true,
        latestNetSuiteSnapshotJson: true,
        latestAgingSnapshotJson: true,
        awaitingDropOffStartedAt: true,
        awaitingDropOffDeadlineAt: true,
        replacementOrderNumber: true,
        processedReship: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!order) {
      throw new AgentWorkflowError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const latestSubmission = await prisma.wodIvcsWorkflowSubmission.findFirst({
      where: { orderId: id },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        submittedAt: true,
        targetQueue: true,
        matchedOutcomeRuleName: true,
        matchedOutcomeRulePriority: true,
        matchedRoutingRuleId: true,
        workflowVersionId: true,
      },
    });

    return {
      order: {
        ...serializeAgentOrderSummary(order),
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        presenceNetSuite: order.presenceNetSuite,
        presenceAging: order.presenceAging,
        netSuiteDaysOld: order.netSuiteDaysOld,
        agingIsFivePlus: order.agingIsFivePlus,
        isCityBeauty: order.isCityBeauty,
        itemSummaryJson: order.itemSummaryJson,
        latestNetSuiteSnapshotJson: order.latestNetSuiteSnapshotJson,
        latestAgingSnapshotJson: order.latestAgingSnapshotJson,
        awaitingDropOffStartedAt: order.awaitingDropOffStartedAt?.toISOString() ?? null,
        awaitingDropOffDeadlineAt: order.awaitingDropOffDeadlineAt?.toISOString() ?? null,
        replacementOrderNumber: order.replacementOrderNumber,
        processedReship: order.processedReship,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
      latestSubmission: latestSubmission
        ? {
            id: latestSubmission.id,
            submittedAt: latestSubmission.submittedAt.toISOString(),
            targetQueue: latestSubmission.targetQueue,
            matchedOutcomeRuleName: latestSubmission.matchedOutcomeRuleName,
            matchedOutcomeRulePriority: latestSubmission.matchedOutcomeRulePriority,
            matchedRoutingRuleId: latestSubmission.matchedRoutingRuleId,
            workflowVersionId: latestSubmission.workflowVersionId,
          }
        : null,
    };
  });
}
