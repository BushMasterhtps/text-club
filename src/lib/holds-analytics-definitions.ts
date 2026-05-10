import type { Prisma } from "@prisma/client";
import { TaskType } from "@prisma/client";

/**
 * Holds workflow queues that count as active / open inventory for Queue Health and Aging.
 * Excludes Completed (final / warehouse) and any other status.
 */
export const HOLDS_ACTIVE_WORKFLOW_QUEUES = [
  "Agent Research",
  "Customer Contact",
  "Escalated Call 4+ Day",
  "Duplicates",
] as const;

export type HoldsActiveWorkflowQueue = (typeof HOLDS_ACTIVE_WORKFLOW_QUEUES)[number];

const ACTIVE_SET = new Set<string>(HOLDS_ACTIVE_WORKFLOW_QUEUES);

export function isHoldsActiveWorkflowQueue(holdsStatus: string | null | undefined): boolean {
  if (!holdsStatus) return false;
  return ACTIVE_SET.has(holdsStatus);
}

/**
 * Prisma filter: pending Holds tasks in an active assembly queue (not Completed / not historical completed rows).
 */
export function activeHoldsInventoryWhere(): Prisma.TaskWhereInput {
  return {
    taskType: TaskType.HOLDS,
    status: "PENDING",
    holdsStatus: { in: [...HOLDS_ACTIVE_WORKFLOW_QUEUES] },
  };
}

/**
 * Order age in whole days since holdsOrderDate (UTC calendar math, same as prior analytics).
 * Returns null if order date missing.
 */
export function holdsOrderAgeDays(orderDate: Date | null | undefined, now: Date): number | null {
  if (!orderDate) return null;
  return Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
}

/** Active task, order age 5+ days (not SLA; days since import/order date). */
export function isOrderAgeAging5Plus(days: number | null): boolean {
  return days !== null && days >= 5;
}

/** Active task, order age 3–4 days (approaching aging). */
export function isOrderAgeApproaching3To4(days: number | null): boolean {
  return days !== null && days >= 3 && days <= 4;
}

/** Active task, order age 0–2 days. */
export function isOrderAgeFresh0To2(days: number | null): boolean {
  return days === null || days <= 2;
}

/**
 * Imported CSV priority (holdsPriority). Per schema comments: 1–2 White Glove, 4–5 Normal.
 */
export const HOLDS_PRIORITY_IMPORT_NOTE =
  "Values come from the Holds import (holdsPriority). Typically 1–2 = White Glove, 4–5 = Normal; this is not a queue SLA.";
