import type { PrismaClient } from "@prisma/client";
import { getAgentReportingRangeBoundsUtc } from "@/lib/agent-reporting-day-bounds";
import { QA_COVERAGE_TARGET_REVIEWS_PER_AGENT } from "@/lib/quality-review-constants";

export type QaCoverageStatus = "complete" | "below" | "none";

export type QaAgentCoverageRow = {
  agentId: string;
  name: string | null;
  email: string;
  reviewsCompleted: number;
  coverageTarget: number;
  coverageStatus: QaCoverageStatus;
  avgScore: number | null;
  lastReviewedAt: string | null;
  lastReviewedBy: { name: string | null; email: string } | null;
};

function classifyCoverage(count: number, target: number): QaCoverageStatus {
  if (count <= 0) return "none";
  if (count < target) return "below";
  return "complete";
}

/**
 * Coverage = count of SUBMITTED + isCurrentVersion reviews in the reporting window,
 * grouped by subjectAgentId (agent whose work was reviewed).
 */
export async function loadQaAgentCoverageRows(
  db: PrismaClient,
  params: {
    startYmd: string;
    endYmd: string;
    agentSearch?: string | null;
    coverageTarget?: number;
  }
): Promise<QaAgentCoverageRow[]> {
  const target = params.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT;
  const { startUtc, endExclusiveUtc } = getAgentReportingRangeBoundsUtc(
    params.startYmd,
    params.endYmd
  );

  const q = params.agentSearch?.trim();
  const agents = await db.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "AGENT" }, { role: "MANAGER_AGENT" }],
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

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

  return agents.map((a) => {
    const s = stats.get(a.id);
    const count = s?.count ?? 0;
    return {
      agentId: a.id,
      name: a.name,
      email: a.email,
      reviewsCompleted: count,
      coverageTarget: target,
      coverageStatus: classifyCoverage(count, target),
      avgScore: s?.avg ?? null,
      lastReviewedAt: s?.lastAt?.toISOString() ?? null,
      lastReviewedBy: lastReviewerBySubject.get(a.id) ?? null,
    };
  });
}

export async function loadQaDashboardSummary(
  db: PrismaClient,
  params: { startYmd: string; endYmd: string; coverageTarget?: number }
) {
  const rows = await loadQaAgentCoverageRows(db, params);
  const target = params.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT;
  const totalReviews = rows.reduce((s, r) => s + r.reviewsCompleted, 0);
  const fullyCovered = rows.filter((r) => r.coverageStatus === "complete").length;
  const below = rows.filter((r) => r.coverageStatus === "below").length;
  const zero = rows.filter((r) => r.coverageStatus === "none").length;
  const needsAttention = [...rows]
    .filter((r) => r.coverageStatus !== "complete")
    .sort((a, b) => a.reviewsCompleted - b.reviewsCompleted)
    .slice(0, 8);

  return {
    startYmd: params.startYmd,
    endYmd: params.endYmd,
    coverageTarget: target,
    totalReviewsCompleted: totalReviews,
    agentsFullyCovered: fullyCovered,
    agentsBelowTarget: below,
    agentsWithZeroQa: zero,
    totalAgentsListed: rows.length,
    needsAttention,
  };
}
