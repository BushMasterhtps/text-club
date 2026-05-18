import type { Prisma, WodIvcsOrder } from "@prisma/client";

const AGENT_ORDER_LIST_SELECT = {
  id: true,
  documentNumber: true,
  customerName: true,
  customerEmail: true,
  operationalQueue: true,
  operationalStatus: true,
  presenceNetSuite: true,
  presenceAging: true,
  netSuiteDaysOld: true,
  agingIsFivePlus: true,
  isCityBeauty: true,
  workStartedAt: true,
  updatedAt: true,
  createdAt: true,
} satisfies Prisma.WodIvcsOrderSelect;

export type AgentOrderListRow = Prisma.WodIvcsOrderGetPayload<{
  select: typeof AGENT_ORDER_LIST_SELECT;
}>;

export function serializeAgentOrderListItem(order: AgentOrderListRow) {
  return {
    id: order.id,
    documentNumber: order.documentNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    operationalQueue: order.operationalQueue,
    operationalStatus: order.operationalStatus,
    presenceNetSuite: order.presenceNetSuite,
    presenceAging: order.presenceAging,
    netSuiteDaysOld: order.netSuiteDaysOld,
    agingIsFivePlus: order.agingIsFivePlus,
    isCityBeauty: order.isCityBeauty,
    workStartedAt: order.workStartedAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
  };
}

export function serializeAgentOrderSummary(
  order: Pick<
    WodIvcsOrder,
    | "id"
    | "documentNumber"
    | "operationalQueue"
    | "operationalStatus"
    | "assignedToId"
    | "activeWorkflowVersionId"
    | "workStartedAt"
    | "workStartedById"
  >
) {
  return {
    id: order.id,
    documentNumber: order.documentNumber,
    operationalQueue: order.operationalQueue,
    operationalStatus: order.operationalStatus,
    assignedToId: order.assignedToId,
    activeWorkflowVersionId: order.activeWorkflowVersionId,
    workStartedAt: order.workStartedAt?.toISOString() ?? null,
    workStartedById: order.workStartedById,
  };
}

export { AGENT_ORDER_LIST_SELECT };
