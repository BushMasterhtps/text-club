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
 * that already has a QATaskReview row (PENDING reserves globally; SUBMITTED excludes).
 */
export function buildQualityReviewEligibleTaskWhere(
  agentId: string,
  startYmd: string,
  endYmd: string,
  options?: {
    taskType?: TaskType;
    disposition?: QualityReviewDispositionFilter;
    wodIvcsSource?: WodIvcsSource | null;
  }
): Prisma.TaskWhereInput {
  const { startUtc, endExclusiveUtc } = getAgentReportingRangeBoundsUtc(startYmd, endYmd);

  const disposition = options?.disposition;
  let dispositionWhere: Prisma.StringFilter | undefined;
  if (disposition && disposition !== "all") {
    if (disposition === "Spam") {
      dispositionWhere = {
        in: [
          "Spam - Negative Feedback",
          "Spam - Positive Feedback",
          "Spam - Off Topic",
          "Spam - Gibberish",
          "Spam - One word statement",
          "Spam - Reaction Message",
        ],
      };
    } else if (disposition === "Answered in SF") {
      dispositionWhere = { contains: "Answered in SF" };
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
    qaTaskReview: null,
    ...(dispositionWhere ? { disposition: dispositionWhere } : {}),
    ...taskTypeWhere,
    ...wodSourceWhere,
  } as Prisma.TaskWhereInput;
}
