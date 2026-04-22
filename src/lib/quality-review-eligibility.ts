import type { Prisma, TaskType, WodIvcsSource } from "@prisma/client";
import { getAgentReportingRangeBoundsUtc } from "@/lib/agent-reporting-day-bounds";

export type QualityReviewDispositionFilter =
  | string
  | "Spam"
  | "Answered in SF"
  | "all"
  | null
  | undefined;

/**
 * Completed tasks for an agent in a PST-fixed calendar range, excluding any task
 * that already has any QATaskReview row (PENDING reserves globally; SUBMITTED excludes).
 */
export function buildQualityReviewEligibleTaskWhere(
  agentId: string,
  startYmd: string,
  endYmd: string,
  options?: {
    taskType?: TaskType;
    disposition?: QualityReviewDispositionFilter;
    wodIvcsSource?: WodIvcsSource | null;
    /** When true, do not filter by disposition (used to list disposition options / unfiltered breakdowns). */
    omitDispositionFilter?: boolean;
  }
): Prisma.TaskWhereInput {
  const { startUtc, endExclusiveUtc } = getAgentReportingRangeBoundsUtc(startYmd, endYmd);

  const disposition = options?.omitDispositionFilter ? undefined : options?.disposition;
  let dispositionWhere: Prisma.StringNullableFilter | undefined;
  if (disposition && disposition !== "all") {
    if (disposition === "__NONE__") {
      dispositionWhere = { equals: null };
    } else {
      dispositionWhere = { equals: disposition };
    }
  }

  const taskTypeWhere =
    options?.taskType != null ? { taskType: options.taskType } : ({} as Prisma.TaskWhereInput);

  const wodSourceWhere =
    options?.taskType === "WOD_IVCS" && options.wodIvcsSource != null
      ? { wodIvcsSource: options.wodIvcsSource }
      : ({} as Prisma.TaskWhereInput);

  return {
    status: "COMPLETED",
    endTime: {
      gte: startUtc,
      lt: endExclusiveUtc,
    },
    OR: [{ assignedToId: agentId }, { completedBy: agentId }],
    qaTaskReviews: { none: {} },
    ...(dispositionWhere ? { disposition: dispositionWhere } : {}),
    ...taskTypeWhere,
    ...wodSourceWhere,
  } as Prisma.TaskWhereInput;
}
