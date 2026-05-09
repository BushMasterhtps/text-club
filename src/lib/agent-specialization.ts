import type { Prisma } from "@prisma/client";

/** Task types that participate in specialization-based assignment (matches User.agentTypes / update-types). */
export const ASSIGNMENT_ELIGIBLE_TASK_TYPES = [
  "TEXT_CLUB",
  "HOLDS",
  "WOD_IVCS",
  "EMAIL_REQUESTS",
  "YOTPO",
  "STANDALONE_REFUNDS",
] as const;

export type AssignmentEligibleTaskType = (typeof ASSIGNMENT_ELIGIBLE_TASK_TYPES)[number];

export function isAssignmentEligibleTaskType(s: string): s is AssignmentEligibleTaskType {
  return (ASSIGNMENT_ELIGIBLE_TASK_TYPES as readonly string[]).includes(s);
}

export type UserForSpecializationCheck = {
  agentTypes: string[];
  isActive: boolean;
  role: string;
};

/**
 * Whether a user may receive new tasks of this task type.
 * - Must be active AGENT or MANAGER_AGENT.
 * - TEXT_CLUB: explicit TEXT_CLUB or legacy empty agentTypes.
 * - Other types: must explicitly include the task type in agentTypes.
 */
export function isUserEligibleForTaskType(
  user: UserForSpecializationCheck,
  taskType: string
): boolean {
  if (!user.isActive) return false;
  if (user.role !== "AGENT" && user.role !== "MANAGER_AGENT") return false;

  const types = user.agentTypes ?? [];
  if (taskType === "TEXT_CLUB") {
    return types.length === 0 || types.includes("TEXT_CLUB");
  }
  return types.includes(taskType);
}

export function assignmentNotEligibleMessage(taskType: string): string {
  return `Agent is not eligible for ${taskType} tasks. Update Agent Specializations first.`;
}

export function inactiveAgentAssignmentMessage(): string {
  return "Cannot assign tasks to inactive users.";
}

export function invalidAssigneeRoleMessage(): string {
  return "Only agents can receive task assignments.";
}

/** Prisma where for GET /api/manager/agents?filter=… (active specialists only). */
export function eligibleAgentsWhereForTaskType(
  taskType: AssignmentEligibleTaskType
): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {
    role: { in: ["AGENT", "MANAGER_AGENT"] },
    isActive: true,
  };

  if (taskType === "TEXT_CLUB") {
    return {
      ...base,
      OR: [{ agentTypes: { has: "TEXT_CLUB" } }, { agentTypes: { isEmpty: true } }],
    };
  }

  return {
    ...base,
    agentTypes: { has: taskType },
  };
}

/** Parse ?filter= from manager agents API; unknown values → null (no specialization filter). */
export function parseAgentsFilterParam(filter: string | null): AssignmentEligibleTaskType | null {
  const t = filter?.trim();
  if (!t) return null;
  return isAssignmentEligibleTaskType(t) ? t : null;
}
