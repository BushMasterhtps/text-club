import type { Prisma, PrismaClient } from "@prisma/client";
import { getAgentReportingRangeBoundsUtc } from "@/lib/agent-reporting-day-bounds";
import {
  QA_COVERAGE_TARGET_REVIEWS_PER_AGENT,
  QA_NEEDS_ATTENTION_SNAPSHOT_LIMIT,
  QA_SMART_QUEUE_LIMIT,
} from "@/lib/quality-review-constants";
import { buildQualityReviewEligibleTaskWhere } from "@/lib/quality-review-eligibility";

/** URL/query values for roster scope (who appears in the table). */
export const QA_ROSTER_SCOPE_ALL = "all";
export const QA_ROSTER_SCOPE_TRACKED = "tracked";

/** URL/query: unset or this value = any QA team. */
export const QA_TEAM_FILTER_ANY = "__any__";

/** URL/query: only users with no qaTeam label. */
export const QA_TEAM_FILTER_UNASSIGNED = "__unassigned__";

/** Row display status for QA coverage (mutually exclusive). */
export type QaCoverageDisplayStatus =
  | "exempt"
  | "no_eligible_work"
  | "complete"
  | "below"
  | "none";

export type QaAgentCoverageRow = {
  agentId: string;
  name: string | null;
  email: string;
  qaIsTracked: boolean;
  qaTeam: string | null;
  qaExemptReason: string | null;
  eligibleTaskCount: number;
  reviewsCompleted: number;
  coverageTarget: number;
  coverageStatus: QaCoverageDisplayStatus;
  avgScore: number | null;
  lastReviewedAt: string | null;
  lastReviewedBy: { name: string | null; email: string } | null;
};

const COVERAGE_STATUSES: QaCoverageDisplayStatus[] = [
  "exempt",
  "no_eligible_work",
  "complete",
  "below",
  "none",
];

export function parseCoverageStatusQuery(
  raw: string | null | undefined
): QaCoverageDisplayStatus | null {
  const v = raw?.trim();
  if (!v) return null;
  return COVERAGE_STATUSES.includes(v as QaCoverageDisplayStatus)
    ? (v as QaCoverageDisplayStatus)
    : null;
}

/** Build dashboard URL with filters (client-side navigation). */
export function buildQaDashboardUrl(opts: {
  startYmd: string;
  endYmd: string;
  rosterScope?: string | null;
  qaTeamFilter?: string | null;
  coverageStatus?: QaCoverageDisplayStatus | null;
  agentId?: string | null;
  q?: string | null;
}): string {
  const sp = new URLSearchParams();
  sp.set("startDate", opts.startYmd);
  sp.set("endDate", opts.endYmd);
  if (opts.rosterScope === QA_ROSTER_SCOPE_TRACKED) {
    sp.set("rosterScope", QA_ROSTER_SCOPE_TRACKED);
  }
  if (opts.qaTeamFilter && opts.qaTeamFilter !== QA_TEAM_FILTER_ANY) {
    sp.set("qaTeam", opts.qaTeamFilter);
  }
  if (opts.coverageStatus) {
    sp.set("coverageStatus", opts.coverageStatus);
  }
  if (opts.agentId?.trim()) {
    sp.set("agentId", opts.agentId.trim());
  }
  if (opts.q?.trim()) {
    sp.set("q", opts.q.trim());
  }
  return `/manager/quality-review/dashboard?${sp.toString()}`;
}

/** Sort for “who needs QA next” and snapshot needs-attention (urgency first). */
export function compareQaQueuePriority(a: QaAgentCoverageRow, b: QaAgentCoverageRow): number {
  const statusRank = (s: QaCoverageDisplayStatus) =>
    s === "none" ? 0 : s === "below" ? 1 : 2;
  const sr = statusRank(a.coverageStatus) - statusRank(b.coverageStatus);
  if (sr !== 0) return sr;
  if (b.eligibleTaskCount !== a.eligibleTaskCount) {
    return b.eligibleTaskCount - a.eligibleTaskCount;
  }
  const ta = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : 0;
  const tb = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: "base" });
}

function qaTeamClauseFromFilter(teamRaw: string | null | undefined): Prisma.UserWhereInput {
  const t = (teamRaw ?? QA_TEAM_FILTER_ANY).trim() || QA_TEAM_FILTER_ANY;
  if (t === QA_TEAM_FILTER_UNASSIGNED) return { qaTeam: null };
  if (t === QA_TEAM_FILTER_ANY || t === "") return {};
  return { qaTeam: t };
}

function classifyCoverageDisplay(
  qaIsTracked: boolean,
  eligibleTaskCount: number,
  reviewsCompleted: number,
  target: number
): QaCoverageDisplayStatus {
  if (!qaIsTracked) return "exempt";
  if (eligibleTaskCount <= 0) return "no_eligible_work";
  if (reviewsCompleted >= target) return "complete";
  if (reviewsCompleted > 0) return "below";
  return "none";
}

export type QaCoverageLoadResult = {
  rows: QaAgentCoverageRow[];
  /** Distinct non-null qaTeam values among tracked active agents (for filter UI). */
  teamOptions: string[];
};

/**
 * Coverage: roster-aware. Reviews = SUBMITTED + isCurrentVersion in window.
 * Eligible tasks = completed tasks in window with no QATaskReview row (any task type, any disposition).
 */
export async function loadQaAgentCoverageRows(
  db: PrismaClient,
  params: {
    startYmd: string;
    endYmd: string;
    agentSearch?: string | null;
    /** When set, only this user id (still subject to role/active filters). */
    agentId?: string | null;
    /** `all` (default) or `tracked` (qaIsTracked only). */
    rosterScope?: string | null;
    /** `__any__` / absent = any team; `__unassigned__` = qaTeam null; else exact qaTeam string. */
    qaTeamFilter?: string | null;
    /** When set, only rows with this coverage display status. */
    coverageStatus?: QaCoverageDisplayStatus | null;
    coverageTarget?: number;
  }
): Promise<QaCoverageLoadResult> {
  const target = params.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT;
  const { startUtc, endExclusiveUtc } = getAgentReportingRangeBoundsUtc(
    params.startYmd,
    params.endYmd
  );

  const q = params.agentSearch?.trim();
  const rosterRaw = params.rosterScope?.trim() || QA_ROSTER_SCOPE_ALL;
  const rosterScope =
    rosterRaw === QA_ROSTER_SCOPE_TRACKED ? QA_ROSTER_SCOPE_TRACKED : QA_ROSTER_SCOPE_ALL;

  const teamRaw = params.qaTeamFilter?.trim() || QA_TEAM_FILTER_ANY;
  const teamClause: Prisma.UserWhereInput = qaTeamClauseFromFilter(teamRaw);

  const rosterClause: Prisma.UserWhereInput =
    rosterScope === QA_ROSTER_SCOPE_TRACKED ? { qaIsTracked: true } : {};

  const agentId = params.agentId?.trim() || null;

  const agents = await db.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "AGENT" }, { role: "MANAGER_AGENT" }],
      ...(agentId ? { id: agentId } : {}),
      ...rosterClause,
      ...teamClause,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      qaIsTracked: true,
      qaTeam: true,
      qaExemptReason: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  const teamGroups = await db.user.groupBy({
    by: ["qaTeam"],
    where: {
      isActive: true,
      OR: [{ role: "AGENT" }, { role: "MANAGER_AGENT" }],
      qaIsTracked: true,
      qaTeam: { not: null },
    },
  });
  const teamOptions = teamGroups
    .map((g) => g.qaTeam)
    .filter((t): t is string => Boolean(t))
    .sort((a, b) => a.localeCompare(b));

  const grouped = await db.qATaskReview.groupBy({
    by: ["subjectAgentId"],
    where: {
      status: "SUBMITTED",
      isCurrentVersion: true,
      subjectAgentId: { not: null },
      submittedAt: { gte: startUtc, lt: endExclusiveUtc },
    },
    _count: { id: true },
    _avg: { finalScore: true },
    _max: { submittedAt: true },
  });

  const stats = new Map<
    string,
    { count: number; avg: number | null; lastAt: Date | null }
  >();
  for (const g of grouped) {
    if (!g.subjectAgentId) continue;
    stats.set(g.subjectAgentId, {
      count: g._count.id,
      avg: g._avg.finalScore != null ? Number(g._avg.finalScore) : null,
      lastAt: g._max.submittedAt,
    });
  }

  type DistinctRow = {
    subjectAgentId: string;
    submittedAt: Date;
    reviewerId: string;
  };

  const distinctLatest = await db.$queryRaw<DistinctRow[]>`
    SELECT DISTINCT ON ("subjectAgentId")
      "subjectAgentId",
      "submittedAt",
      "reviewerId"
    FROM "QATaskReview"
    WHERE "status" = 'SUBMITTED'
      AND "isCurrentVersion" = true
      AND "subjectAgentId" IS NOT NULL
      AND "submittedAt" >= ${startUtc}
      AND "submittedAt" < ${endExclusiveUtc}
    ORDER BY "subjectAgentId", "submittedAt" DESC
  `;

  const reviewerIds = [...new Set(distinctLatest.map((r) => r.reviewerId))];
  const reviewers = await db.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true, email: true },
  });
  const reviewerMap = new Map(reviewers.map((u) => [u.id, u]));
  const lastReviewerBySubject = new Map<
    string,
    { name: string | null; email: string }
  >();
  for (const row of distinctLatest) {
    const u = reviewerMap.get(row.reviewerId);
    if (u) {
      lastReviewerBySubject.set(row.subjectAgentId, {
        name: u.name,
        email: u.email,
      });
    }
  }

  const eligibleWhereBase = (agentId: string) =>
    buildQualityReviewEligibleTaskWhere(agentId, params.startYmd, params.endYmd, {
      omitDispositionFilter: true,
    });

  const chunkSize = 25;
  const eligibleByAgent = new Map<string, number>();
  const trackedAgents = agents.filter((a) => a.qaIsTracked);
  for (let i = 0; i < trackedAgents.length; i += chunkSize) {
    const slice = trackedAgents.slice(i, i + chunkSize);
    const counts = await Promise.all(
      slice.map((a) => db.task.count({ where: eligibleWhereBase(a.id) }))
    );
    slice.forEach((a, j) => eligibleByAgent.set(a.id, counts[j]!));
  }

  const rows: QaAgentCoverageRow[] = agents.map((a) => {
    const s = stats.get(a.id);
    const reviewsCompleted = s?.count ?? 0;
    const eligibleTaskCount = a.qaIsTracked ? (eligibleByAgent.get(a.id) ?? 0) : 0;
    const coverageStatus = classifyCoverageDisplay(
      a.qaIsTracked,
      eligibleTaskCount,
      reviewsCompleted,
      target
    );
    return {
      agentId: a.id,
      name: a.name,
      email: a.email,
      qaIsTracked: a.qaIsTracked,
      qaTeam: a.qaTeam,
      qaExemptReason: a.qaExemptReason,
      eligibleTaskCount,
      reviewsCompleted,
      coverageTarget: target,
      coverageStatus,
      avgScore: s?.avg ?? null,
      lastReviewedAt: s?.lastAt?.toISOString() ?? null,
      lastReviewedBy: lastReviewerBySubject.get(a.id) ?? null,
    };
  });

  const statusFilter = params.coverageStatus ?? null;
  const filteredRows =
    statusFilter != null ? rows.filter((r) => r.coverageStatus === statusFilter) : rows;

  return { rows: filteredRows, teamOptions };
}

export async function loadQaDashboardSummary(
  db: PrismaClient,
  params: {
    startYmd: string;
    endYmd: string;
    coverageTarget?: number;
    rosterScope?: string | null;
    qaTeamFilter?: string | null;
  }
) {
  const { rows, teamOptions } = await loadQaAgentCoverageRows(db, {
    startYmd: params.startYmd,
    endYmd: params.endYmd,
    coverageTarget: params.coverageTarget,
    rosterScope: params.rosterScope,
    qaTeamFilter: params.qaTeamFilter,
    coverageStatus: null,
    agentId: null,
  });
  const target = params.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT;

  const tracked = rows.filter((r) => r.qaIsTracked);
  const trackedWithEligible = tracked.filter((r) => r.eligibleTaskCount > 0);

  const totalReviewsCompleted = tracked.reduce((s, r) => s + r.reviewsCompleted, 0);
  const fullyCovered = trackedWithEligible.filter((r) => r.coverageStatus === "complete").length;
  const below = trackedWithEligible.filter((r) => r.coverageStatus === "below").length;
  const zero = trackedWithEligible.filter((r) => r.coverageStatus === "none").length;
  const qaTf = params.qaTeamFilter ?? QA_TEAM_FILTER_ANY;
  const agentsExempt = await db.user.count({
    where: {
      isActive: true,
      OR: [{ role: "AGENT" }, { role: "MANAGER_AGENT" }],
      qaIsTracked: false,
      ...qaTeamClauseFromFilter(qaTf),
    },
  });
  const agentsNoEligibleWork = tracked.filter((r) => r.coverageStatus === "no_eligible_work").length;
  const agentsTracked = tracked.length;

  const needsAttention = [...trackedWithEligible]
    .filter((r) => r.coverageStatus !== "complete")
    .sort(compareQaQueuePriority)
    .slice(0, QA_NEEDS_ATTENTION_SNAPSHOT_LIMIT);

  const smartQueue = [...trackedWithEligible]
    .filter((r) => r.coverageStatus !== "complete")
    .sort(compareQaQueuePriority)
    .slice(0, QA_SMART_QUEUE_LIMIT);

  return {
    startYmd: params.startYmd,
    endYmd: params.endYmd,
    coverageTarget: target,
    rosterScope: params.rosterScope ?? QA_ROSTER_SCOPE_ALL,
    qaTeamFilter: params.qaTeamFilter ?? QA_TEAM_FILTER_ANY,
    teamOptions,
    totalReviewsCompleted,
    agentsFullyCovered: fullyCovered,
    agentsBelowTarget: below,
    agentsWithZeroQa: zero,
    agentsExempt,
    agentsNoEligibleWork,
    agentsTracked,
    totalAgentsListed: rows.length,
    needsAttention,
    smartQueue,
  };
}
