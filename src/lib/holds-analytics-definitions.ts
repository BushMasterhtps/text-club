import type { Prisma } from "@prisma/client";
import { TaskType } from "@prisma/client";

/**
 * Actionable Holds assembly queues (normal operational work).
 * Duplicates is tracked separately as an import/assignment exception bucket.
 */
export const HOLDS_ACTIONABLE_QUEUES = [
  "Agent Research",
  "Customer Contact",
  "Escalated Call 4+ Day",
] as const;

export type HoldsActionableQueue = (typeof HOLDS_ACTIONABLE_QUEUES)[number];

export const HOLDS_DUPLICATE_EXCEPTION_QUEUE = "Duplicates" as const;

/**
 * Open workflow queues excluding Completed (matches assembly-line list minus Completed).
 * For Prisma filters that need all non-completed queue rows including duplicate exceptions.
 */
export const HOLDS_ACTIVE_WORKFLOW_QUEUES = [
  ...HOLDS_ACTIONABLE_QUEUES,
  HOLDS_DUPLICATE_EXCEPTION_QUEUE,
] as const;

export type HoldsActiveWorkflowQueue = (typeof HOLDS_ACTIVE_WORKFLOW_QUEUES)[number];

const ACTIVE_SET = new Set<string>(HOLDS_ACTIVE_WORKFLOW_QUEUES);
const ACTIONABLE_SET = new Set<string>(HOLDS_ACTIONABLE_QUEUES);

export function isHoldsActiveWorkflowQueue(holdsStatus: string | null | undefined): boolean {
  if (!holdsStatus) return false;
  return ACTIVE_SET.has(holdsStatus);
}

export function isHoldsActionableQueue(holdsStatus: string | null | undefined): boolean {
  if (!holdsStatus) return false;
  return ACTIONABLE_SET.has(holdsStatus);
}

/** Operational inventory: actionable queues only. Queue placement is holdsStatus; do not filter by Task.status. */
export function actionableHoldsQueueWhere(): Prisma.TaskWhereInput {
  return {
    taskType: TaskType.HOLDS,
    holdsStatus: { in: [...HOLDS_ACTIONABLE_QUEUES] },
  };
}

/** Duplicate exception rows (same as workflow Duplicates queue). */
export function duplicateExceptionHoldsWhere(): Prisma.TaskWhereInput {
  return {
    taskType: TaskType.HOLDS,
    holdsStatus: HOLDS_DUPLICATE_EXCEPTION_QUEUE,
  };
}

/**
 * All open non-Completed assembly queues (actionable + duplicate exceptions).
 * Excludes holdsStatus Completed only by omission.
 */
export function holdsOpenWorkflowQueuesWhere(): Prisma.TaskWhereInput {
  return {
    taskType: TaskType.HOLDS,
    holdsStatus: { in: [...HOLDS_ACTIVE_WORKFLOW_QUEUES] },
  };
}

/**
 * @deprecated Use actionableHoldsQueueWhere() or holdsOpenWorkflowQueuesWhere() by intent.
 * Previously required status PENDING, which excluded IN_PROGRESS and other active Holds work.
 */
export function activeHoldsInventoryWhere(): Prisma.TaskWhereInput {
  return actionableHoldsQueueWhere();
}

/**
 * Order age in whole days since holdsOrderDate (UTC calendar math, same as prior analytics).
 * Returns null if order date missing.
 */
export function holdsOrderAgeDays(orderDate: Date | null | undefined, now: Date): number | null {
  if (!orderDate) return null;
  return Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
}

/** Actionable task, order age 5+ days (not SLA; days since import/order date). */
export function isOrderAgeAging5Plus(days: number | null): boolean {
  return days !== null && days >= 5;
}

/** Actionable task, order age 3–4 days (approaching aging). */
export function isOrderAgeApproaching3To4(days: number | null): boolean {
  return days !== null && days >= 3 && days <= 4;
}

/** Actionable task, order age 0–2 days. */
export function isOrderAgeFresh0To2(days: number | null): boolean {
  return days === null || days <= 2;
}
