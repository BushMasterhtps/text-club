import type { PrismaClient } from "@prisma/client";
import { Prisma, TaskType } from "@prisma/client";

/** DB client slice needed to insert TaskWorkSession (supports transaction client). */
export type TaskWorkSessionDb = Pick<PrismaClient, "taskWorkSession">;

export const HOLDS_WORKFLOW_TYPE = "HOLDS_ASSEMBLY";
export const TASK_WORK_SESSION_SOURCE_AGENT_UI = "AGENT_UI";

export function buildHoldsTaskWorkSessionIdempotencyKey(
  taskId: string,
  agentId: string,
  completionEndTime: Date,
  disposition: string
): string {
  return `holds:${taskId}:${agentId}:${completionEndTime.toISOString()}:${disposition}`;
}

/**
 * Maps Holds disposition + queue movement to a stable outcome label for reporting (not a DB enum).
 */
export function deriveHoldsOutcomeType(params: {
  disposition: string;
  holdsStatusBefore: string | null;
  newHoldsQueue: string | null;
  shouldUnassign: boolean;
}): string {
  const { disposition, holdsStatusBefore, newHoldsQueue, shouldUnassign } = params;

  if (disposition === "Duplicate") {
    return "DUPLICATE_ROUTING";
  }
  if (disposition === "Unable to Resolve") {
    if (holdsStatusBefore === "Escalated Call 4+ Day") {
      return "ESCALATION_STAY";
    }
    return "QUEUE_HANDOFF";
  }
  if (disposition === "In Communication") {
    return "QUEUE_HANDOFF";
  }
  if (
    disposition === "International Order - Unable to Call/ Sent Email" ||
    disposition === "International Order - Unable to Call / Sent Email"
  ) {
    return "QUEUE_HANDOFF";
  }
  if (newHoldsQueue === "Completed") {
    return "FINAL_RESOLUTION";
  }
  if (shouldUnassign && newHoldsQueue !== holdsStatusBefore) {
    return "QUEUE_HANDOFF";
  }
  if (shouldUnassign) {
    return "QUEUE_HANDOFF";
  }
  return "OTHER";
}

export type CreateHoldsTaskWorkSessionParams = {
  taskId: string;
  agentId: string;
  startedAt: Date | null;
  endedAt: Date;
  durationSec: number | null;
  fromQueue: string | null;
  toQueue: string | null;
  disposition: string;
  outcomeType: string;
  countsTowardProductivity: boolean;
  isFinalResolution: boolean;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
};

/**
 * Inserts one TaskWorkSession for a Holds completion. Swallows P2002 (duplicate idempotency key).
 */
export async function createHoldsTaskWorkSessionRecord(
  db: TaskWorkSessionDb,
  params: CreateHoldsTaskWorkSessionParams
): Promise<void> {
  try {
    await db.taskWorkSession.create({
      data: {
        taskId: params.taskId,
        taskType: TaskType.HOLDS,
        agentId: params.agentId,
        startedAt: params.startedAt,
        endedAt: params.endedAt,
        durationSec: params.durationSec,
        fromQueue: params.fromQueue,
        toQueue: params.toQueue,
        disposition: params.disposition,
        outcomeType: params.outcomeType,
        countsTowardProductivity: params.countsTowardProductivity,
        isFinalResolution: params.isFinalResolution,
        source: TASK_WORK_SESSION_SOURCE_AGENT_UI,
        workflowType: HOLDS_WORKFLOW_TYPE,
        metadata: params.metadata as Prisma.InputJsonValue,
        idempotencyKey: params.idempotencyKey,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return;
    }
    throw e;
  }
}
