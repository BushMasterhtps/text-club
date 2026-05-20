import type {
  Prisma,
  PrismaClient,
  WodIvcsActionType,
  WodIvcsOperationalQueue,
} from "@prisma/client";
import {
  assignmentNotEligibleMessage,
  inactiveAgentAssignmentMessage,
  invalidAssigneeRoleMessage,
  isUserEligibleForTaskType,
} from "@/lib/agent-specialization";
import { isCityBeautyDocumentNumber } from "./city-beauty";

const TERMINAL_QUEUES: WodIvcsOperationalQueue[] = ["COMPLETED", "ARCHIVED"];
const ASSIGN_SOURCE_QUEUES: WodIvcsOperationalQueue[] = ["NEEDS_ACTION", "ASSIGNED"];

/** Queues managers may move into via move-queue (ASSIGNED handled separately with agentId). */
export const MANAGER_MOVE_TARGET_QUEUES: WodIvcsOperationalQueue[] = [
  "NEEDS_ACTION",
  "NEEDS_REVIEW",
  "IT_REVIEW",
  "AWAITING_DROP_OFF",
  "COMPLETED",
  "ARCHIVED",
];

const ALL_OPERATIONAL_QUEUES: WodIvcsOperationalQueue[] = [
  "NEEDS_ACTION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_DROP_OFF",
  "NEEDS_REVIEW",
  "IT_REVIEW",
  "COMPLETED",
  "ARCHIVED",
];

/** Max orders per interactive Prisma transaction (update + audit each). */
export const BULK_ORDER_MUTATION_CHUNK_SIZE = 25;

export type OrderMutationSkipCode =
  | "ORDER_NOT_FOUND"
  | "TERMINAL_QUEUE"
  | "INVALID_SOURCE_QUEUE"
  | "IN_PROGRESS_BLOCKED"
  | "NOT_ASSIGNED"
  | "INVALID_TARGET_QUEUE"
  | "ASSIGNED_REQUIRES_AGENT"
  | "IN_PROGRESS_MOVE_BLOCKED"
  | "SOURCE_TERMINAL_BLOCKED"
  | "NO_CHANGE"
  | "AGENT_NOT_FOUND"
  | "AGENT_INELIGIBLE"
  | "CITY_BEAUTY_EXCLUDED";

export type OrderMutationSkip = {
  orderId: string;
  code: OrderMutationSkipCode;
  reason: string;
};

export type AssignOrdersResult = {
  assigned: number;
  skipped: OrderMutationSkip[];
};

export type UnassignOrdersResult = {
  unassigned: number;
  skipped: OrderMutationSkip[];
};

export type MoveOrdersResult = {
  moved: number;
  skipped: OrderMutationSkip[];
};

export function isWodIvcsOperationalQueue(value: string): value is WodIvcsOperationalQueue {
  return (ALL_OPERATIONAL_QUEUES as string[]).includes(value);
}

export function chunkOrderIds(orderIds: string[], chunkSize = BULK_ORDER_MUTATION_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    chunks.push(orderIds.slice(i, i + chunkSize));
  }
  return chunks;
}

async function writeOrderAuditEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    actorId: string;
    actionType: WodIvcsActionType;
    fromQueue: WodIvcsOperationalQueue | null;
    toQueue: WodIvcsOperationalQueue | null;
    payloadJson: Prisma.InputJsonValue;
  }
) {
  await tx.wodIvcsActionEvent.create({
    data: {
      orderId: input.orderId,
      actorId: input.actorId,
      actionType: input.actionType,
      fromQueue: input.fromQueue ?? undefined,
      toQueue: input.toQueue ?? undefined,
      payloadJson: input.payloadJson,
    },
  });
}

type OrderMutationRow = {
  id: string;
  documentNumber: string;
  documentNumberNormalized: string;
  isCityBeauty: boolean;
  operationalQueue: WodIvcsOperationalQueue;
  operationalStatus: string;
  assignedToId: string | null;
  archivedAt: Date | null;
  workStartedAt: Date | null;
  workStartedById: string | null;
  activeWorkflowVersionId: string | null;
};

async function loadOrdersByIds(prisma: PrismaClient, orderIds: string[]) {
  const unique = [...new Set(orderIds.filter(Boolean))];
  const orders = await prisma.wodIvcsOrder.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      documentNumber: true,
      documentNumberNormalized: true,
      isCityBeauty: true,
      operationalQueue: true,
      operationalStatus: true,
      assignedToId: true,
      archivedAt: true,
      workStartedAt: true,
      workStartedById: true,
      activeWorkflowVersionId: true,
    },
  });
  const byId = new Map(orders.map((o) => [o.id, o as OrderMutationRow]));
  return { unique, byId };
}

/** Reset agent work session so reassigned agents must Start again (no completion credit). */
function clearedWorkSessionUpdate() {
  return {
    workStartedAt: null,
    workStartedById: null,
    activeWorkflowVersionId: null,
  };
}

function clearedWorkSessionAuditFields(order: OrderMutationRow) {
  const clearedWorkSessionFields: string[] = [];
  if (order.workStartedAt) clearedWorkSessionFields.push("workStartedAt");
  if (order.workStartedById) clearedWorkSessionFields.push("workStartedById");
  if (order.activeWorkflowVersionId) clearedWorkSessionFields.push("activeWorkflowVersionId");

  return {
    clearedWorkSessionFields,
    previousWorkStartedAt: order.workStartedAt?.toISOString() ?? null,
    previousWorkStartedById: order.workStartedById,
    previousActiveWorkflowVersionId: order.activeWorkflowVersionId,
  };
}

type ValidatedAssigneeAgent = {
  id: string;
  name: string | null;
  email: string;
};

async function validateAssigneeAgent(prisma: PrismaClient, agentId: string) {
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, email: true, agentTypes: true, isActive: true, role: true },
  });

  if (!agent) {
    return { ok: false as const, error: "Agent not found", code: "AGENT_NOT_FOUND" as const };
  }
  if (!agent.isActive) {
    return { ok: false as const, error: inactiveAgentAssignmentMessage(), code: "AGENT_INELIGIBLE" as const };
  }
  if (agent.role !== "AGENT" && agent.role !== "MANAGER_AGENT") {
    return { ok: false as const, error: invalidAssigneeRoleMessage(), code: "AGENT_INELIGIBLE" as const };
  }
  if (!isUserEligibleForTaskType(agent, "WOD_IVCS")) {
    return {
      ok: false as const,
      error: assignmentNotEligibleMessage("WOD_IVCS"),
      code: "AGENT_INELIGIBLE" as const,
    };
  }

  return { ok: true as const, agent };
}

async function assignOrderIdsInTransaction(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  byId: Map<string, OrderMutationRow>,
  input: { agentId: string; actorId: string },
  agent: ValidatedAssigneeAgent
): Promise<{ assigned: number; skipped: OrderMutationSkip[] }> {
  const skipped: OrderMutationSkip[] = [];
  let assigned = 0;

  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (!order) {
      skipped.push({
        orderId,
        code: "ORDER_NOT_FOUND",
        reason: "Order not found",
      });
      continue;
    }

    if (TERMINAL_QUEUES.includes(order.operationalQueue)) {
      skipped.push({
        orderId,
        code: "TERMINAL_QUEUE",
        reason: `Cannot assign orders in ${order.operationalQueue}`,
      });
      continue;
    }

    if (order.isCityBeauty || isCityBeautyDocumentNumber(order.documentNumberNormalized)) {
      skipped.push({
        orderId,
        code: "CITY_BEAUTY_EXCLUDED",
        reason:
          "City Beauty orders are routed to IT bulk processing and cannot be assigned through active queues",
      });
      continue;
    }

    if (order.operationalQueue === "IN_PROGRESS") {
      const fromQueue = order.operationalQueue;
      const toQueue: WodIvcsOperationalQueue = "ASSIGNED";
      const previousAgentId = order.assignedToId;

      await tx.wodIvcsOrder.update({
        where: { id: orderId },
        data: {
          assignedToId: input.agentId,
          operationalQueue: toQueue,
          ...clearedWorkSessionUpdate(),
        },
      });

      await writeOrderAuditEvent(tx, {
        orderId,
        actorId: input.actorId,
        actionType: "MANAGER_OVERRIDE",
        fromQueue,
        toQueue,
        payloadJson: {
          action: "FORCE_REASSIGN_IN_PROGRESS",
          previousAgentId,
          newAgentId: input.agentId,
          agentEmail: agent.email,
          agentName: agent.name,
          previousQueue: fromQueue,
          targetQueue: toQueue,
          documentNumber: order.documentNumber,
          ...clearedWorkSessionAuditFields(order),
        },
      });

      assigned++;
      continue;
    }

    if (!ASSIGN_SOURCE_QUEUES.includes(order.operationalQueue)) {
      skipped.push({
        orderId,
        code: "INVALID_SOURCE_QUEUE",
        reason: `Assignment is only allowed from Needs Action or Assigned (current: ${order.operationalQueue})`,
      });
      continue;
    }

    const sameAssignee =
      order.assignedToId === input.agentId && order.operationalQueue === "ASSIGNED";
    if (sameAssignee) {
      skipped.push({
        orderId,
        code: "NO_CHANGE",
        reason: "Order is already assigned to this agent",
      });
      continue;
    }

    const fromQueue = order.operationalQueue;
    const toQueue: WodIvcsOperationalQueue = "ASSIGNED";

    await tx.wodIvcsOrder.update({
      where: { id: orderId },
      data: {
        assignedToId: input.agentId,
        operationalQueue: toQueue,
      },
    });

    const queueChanged = fromQueue !== toQueue;
    await writeOrderAuditEvent(tx, {
      orderId,
      actorId: input.actorId,
      actionType: queueChanged ? "QUEUE_CHANGED" : "MANAGER_OVERRIDE",
      fromQueue,
      toQueue: queueChanged ? toQueue : fromQueue,
      payloadJson: {
        action: "ASSIGN",
        agentId: agent.id,
        agentEmail: agent.email,
        agentName: agent.name,
        documentNumber: order.documentNumber,
      },
    });

    assigned++;
  }

  return { assigned, skipped };
}

async function unassignOrderIdsInTransaction(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  byId: Map<string, OrderMutationRow>,
  actorId: string
): Promise<{ unassigned: number; skipped: OrderMutationSkip[] }> {
  const skipped: OrderMutationSkip[] = [];
  let unassigned = 0;

  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (!order) {
      skipped.push({
        orderId,
        code: "ORDER_NOT_FOUND",
        reason: "Order not found",
      });
      continue;
    }

    if (TERMINAL_QUEUES.includes(order.operationalQueue)) {
      skipped.push({
        orderId,
        code: "TERMINAL_QUEUE",
        reason: `Cannot unassign orders in ${order.operationalQueue}`,
      });
      continue;
    }

    if (order.operationalQueue === "IN_PROGRESS") {
      const fromQueue = order.operationalQueue;
      const toQueue: WodIvcsOperationalQueue = "NEEDS_ACTION";
      const previousAgentId = order.assignedToId;

      await tx.wodIvcsOrder.update({
        where: { id: orderId },
        data: {
          assignedToId: null,
          operationalQueue: toQueue,
          ...clearedWorkSessionUpdate(),
        },
      });

      await writeOrderAuditEvent(tx, {
        orderId,
        actorId,
        actionType: "MANAGER_OVERRIDE",
        fromQueue,
        toQueue,
        payloadJson: {
          action: "FORCE_UNASSIGN_IN_PROGRESS",
          previousAgentId,
          previousQueue: fromQueue,
          targetQueue: toQueue,
          documentNumber: order.documentNumber,
          ...clearedWorkSessionAuditFields(order),
        },
      });

      unassigned++;
      continue;
    }

    if (!order.assignedToId) {
      skipped.push({
        orderId,
        code: "NOT_ASSIGNED",
        reason: "Order is not assigned to an agent",
      });
      continue;
    }

    const fromQueue = order.operationalQueue;
    const toQueue: WodIvcsOperationalQueue =
      fromQueue === "ASSIGNED" ? "NEEDS_ACTION" : fromQueue;

    await tx.wodIvcsOrder.update({
      where: { id: orderId },
      data: {
        assignedToId: null,
        operationalQueue: toQueue,
      },
    });

    await writeOrderAuditEvent(tx, {
      orderId,
      actorId,
      actionType: fromQueue !== toQueue ? "QUEUE_CHANGED" : "MANAGER_OVERRIDE",
      fromQueue,
      toQueue,
      payloadJson: {
        action: "UNASSIGN",
        previousAgentId: order.assignedToId,
        documentNumber: order.documentNumber,
      },
    });

    unassigned++;
  }

  return { unassigned, skipped };
}

async function moveOrderIdsInTransaction(
  tx: Prisma.TransactionClient,
  orderIds: string[],
  byId: Map<string, OrderMutationRow>,
  input: {
    targetQueue: WodIvcsOperationalQueue;
    actorId: string;
    note?: string;
    assignAgent: ValidatedAssigneeAgent | null;
  }
): Promise<{ moved: number; skipped: OrderMutationSkip[] }> {
  const skipped: OrderMutationSkip[] = [];
  let moved = 0;

  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (!order) {
      skipped.push({
        orderId,
        code: "ORDER_NOT_FOUND",
        reason: "Order not found",
      });
      continue;
    }

    if (TERMINAL_QUEUES.includes(order.operationalQueue)) {
      skipped.push({
        orderId,
        code: "SOURCE_TERMINAL_BLOCKED",
        reason: `Cannot move orders from ${order.operationalQueue}`,
      });
      continue;
    }

    if (order.operationalQueue === "IN_PROGRESS") {
      skipped.push({
        orderId,
        code: "IN_PROGRESS_MOVE_BLOCKED",
        reason: "Cannot move orders while In Progress",
      });
      continue;
    }

    if (input.targetQueue === "ASSIGNED" && !input.assignAgent) {
      skipped.push({
        orderId,
        code: "ASSIGNED_REQUIRES_AGENT",
        reason: "agentId is required when moving to Assigned",
      });
      continue;
    }

    const fromQueue = order.operationalQueue;
    const toQueue = input.targetQueue;

    if (fromQueue === toQueue && order.assignedToId === (input.assignAgent?.id ?? order.assignedToId)) {
      if (toQueue !== "NEEDS_ACTION" || !order.assignedToId) {
        skipped.push({
          orderId,
          code: "NO_CHANGE",
          reason: "Order is already in the target queue",
        });
        continue;
      }
    }

    const updateData: Prisma.WodIvcsOrderUpdateInput = {
      operationalQueue: toQueue,
    };

    if (toQueue === "NEEDS_ACTION") {
      updateData.assignedTo = { disconnect: true };
    } else if (toQueue === "ASSIGNED" && input.assignAgent) {
      updateData.assignedTo = { connect: { id: input.assignAgent.id } };
    } else if (
      toQueue === "NEEDS_REVIEW" ||
      toQueue === "IT_REVIEW" ||
      toQueue === "AWAITING_DROP_OFF" ||
      toQueue === "COMPLETED" ||
      toQueue === "ARCHIVED"
    ) {
      // Keep assignee unless moving to NEEDS_ACTION (handled above).
    }

    if (toQueue === "ARCHIVED") {
      updateData.archivedAt = new Date();
      updateData.operationalStatus = "ARCHIVED";
    }

    await tx.wodIvcsOrder.update({
      where: { id: orderId },
      data: updateData,
    });

    await writeOrderAuditEvent(tx, {
      orderId,
      actorId: input.actorId,
      actionType: "QUEUE_CHANGED",
      fromQueue,
      toQueue,
      payloadJson: {
        action: "MOVE_QUEUE",
        note: input.note?.trim() || null,
        agentId: input.assignAgent?.id ?? null,
        documentNumber: order.documentNumber,
      },
    });

    moved++;
  }

  return { moved, skipped };
}

export async function assignWodIvcsOrdersToAgent(
  prisma: PrismaClient,
  input: { orderIds: string[]; agentId: string; actorId: string }
): Promise<AssignOrdersResult | { error: string; code: OrderMutationSkipCode }> {
  const agentCheck = await validateAssigneeAgent(prisma, input.agentId);
  if (!agentCheck.ok) {
    return { error: agentCheck.error, code: agentCheck.code };
  }
  const agent = agentCheck.agent;

  const { unique, byId } = await loadOrdersByIds(prisma, input.orderIds);
  const skipped: OrderMutationSkip[] = [];
  let assigned = 0;

  for (const chunk of chunkOrderIds(unique)) {
    const chunkResult = await prisma.$transaction((tx) =>
      assignOrderIdsInTransaction(tx, chunk, byId, input, agent)
    );
    assigned += chunkResult.assigned;
    skipped.push(...chunkResult.skipped);
  }

  return { assigned, skipped };
}

export async function unassignWodIvcsOrders(
  prisma: PrismaClient,
  input: { orderIds: string[]; actorId: string }
): Promise<UnassignOrdersResult> {
  const { unique, byId } = await loadOrdersByIds(prisma, input.orderIds);
  const skipped: OrderMutationSkip[] = [];
  let unassigned = 0;

  for (const chunk of chunkOrderIds(unique)) {
    const chunkResult = await prisma.$transaction((tx) =>
      unassignOrderIdsInTransaction(tx, chunk, byId, input.actorId)
    );
    unassigned += chunkResult.unassigned;
    skipped.push(...chunkResult.skipped);
  }

  return { unassigned, skipped };
}

export async function moveWodIvcsOrdersToQueue(
  prisma: PrismaClient,
  input: {
    orderIds: string[];
    targetQueue: WodIvcsOperationalQueue;
    actorId: string;
    note?: string;
    agentId?: string;
  }
): Promise<MoveOrdersResult | { error: string; code: OrderMutationSkipCode }> {
  if (!isWodIvcsOperationalQueue(input.targetQueue)) {
    return { error: "Invalid target queue", code: "INVALID_TARGET_QUEUE" };
  }

  if (input.targetQueue === "IN_PROGRESS") {
    return {
      error: "Moving to In Progress is reserved for agent workflow",
      code: "IN_PROGRESS_MOVE_BLOCKED",
    };
  }

  let assignAgent: ValidatedAssigneeAgent | null = null;
  if (input.targetQueue === "ASSIGNED") {
    const agentId = input.agentId;
    if (!agentId) {
      return {
        error: "agentId is required when moving orders to Assigned",
        code: "ASSIGNED_REQUIRES_AGENT",
      };
    }
    const agentCheck = await validateAssigneeAgent(prisma, agentId);
    if (!agentCheck.ok) {
      return { error: agentCheck.error, code: agentCheck.code };
    }
    assignAgent = agentCheck.agent;
  } else if (!MANAGER_MOVE_TARGET_QUEUES.includes(input.targetQueue)) {
    return { error: "Target queue is not allowed for manager moves", code: "INVALID_TARGET_QUEUE" };
  }

  const { unique, byId } = await loadOrdersByIds(prisma, input.orderIds);
  const skipped: OrderMutationSkip[] = [];
  let moved = 0;

  const moveInput = {
    targetQueue: input.targetQueue,
    actorId: input.actorId,
    note: input.note,
    assignAgent,
  };

  for (const chunk of chunkOrderIds(unique)) {
    const chunkResult = await prisma.$transaction((tx) =>
      moveOrderIdsInTransaction(tx, chunk, byId, moveInput)
    );
    moved += chunkResult.moved;
    skipped.push(...chunkResult.skipped);
  }

  return { moved, skipped };
}
