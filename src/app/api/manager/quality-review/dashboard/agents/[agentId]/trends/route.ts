import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { getAgentReportingRangeBoundsUtc } from "@/lib/agent-reporting-day-bounds";
import {
  aggregateReviewsByTaskType,
  avg,
  buildLineCoachingRowsForTaskType,
  dailyScoreBuckets,
  formatScoreTrendArrow,
  previousMatchingReportingRangeYmd,
  trendFromScoreDelta,
  type ReviewForTrend,
} from "@/lib/quality-review-agent-trends";

function serializeForClientJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      if (v && typeof v === "object") {
        const ctor = (v as { constructor?: { name?: string } }).constructor?.name;
        if (ctor === "Decimal") return (v as { toString: () => string }).toString();
      }
      return v;
    })
  );
}

const reviewInclude = {
  finalScore: true,
  submittedAt: true,
  templateVersion: {
    select: { template: { select: { taskType: true } } },
  },
  lineResults: {
    select: {
      response: true,
      labelSnapshot: true,
      line: {
        select: {
          slug: true,
          sectionTitle: true,
          label: true,
          sectionOrder: true,
          lineOrder: true,
        },
      },
    },
  },
} as const;

function mapReviews(
  rows: Array<{
    finalScore: { toString(): string } | null;
    submittedAt: Date | null;
    templateVersion: { template: { taskType: string } };
    lineResults: Array<{
      response: string;
      labelSnapshot: string;
      line: {
        slug: string;
        sectionTitle: string;
        label: string;
        sectionOrder: number;
        lineOrder: number;
      } | null;
    }>;
  }>
): ReviewForTrend[] {
  return rows.map((r) => ({
    finalScore: r.finalScore != null ? Number(r.finalScore) : null,
    submittedAt: r.submittedAt,
    templateVersion: r.templateVersion,
    lineResults: r.lineResults.map((lr) => ({
      response: lr.response,
      labelSnapshot: lr.labelSnapshot,
      line: lr.line,
    })),
  }));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ agentId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { agentId } = await context.params;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { success: false, error: "startDate and endDate are required (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  try {
    const { prevStartYmd, prevEndYmd } = previousMatchingReportingRangeYmd(startDate, endDate);
    const curBounds = getAgentReportingRangeBoundsUtc(startDate, endDate);
    const prevBounds = getAgentReportingRangeBoundsUtc(prevStartYmd, prevEndYmd);

    const baseWhere = {
      subjectAgentId: agentId,
      status: "SUBMITTED" as const,
      isCurrentVersion: true,
    };

    const [currentRows, previousRows] = await Promise.all([
      prisma.qATaskReview.findMany({
        where: {
          ...baseWhere,
          submittedAt: { gte: curBounds.startUtc, lt: curBounds.endExclusiveUtc },
        },
        include: reviewInclude,
        orderBy: { submittedAt: "asc" },
      }),
      prisma.qATaskReview.findMany({
        where: {
          ...baseWhere,
          submittedAt: { gte: prevBounds.startUtc, lt: prevBounds.endExclusiveUtc },
        },
        include: reviewInclude,
        orderBy: { submittedAt: "asc" },
      }),
    ]);

    const currentReviews = mapReviews(currentRows);
    const previousReviews = mapReviews(previousRows);

    const curScores = currentReviews
      .map((r) => r.finalScore)
      .filter((s): s is number => s != null && Number.isFinite(s));
    const prevScores = previousReviews
      .map((r) => r.finalScore)
      .filter((s): s is number => s != null && Number.isFinite(s));

    const currentAvg = avg(curScores);
    const previousAvg = avg(prevScores);
    const prevHas = previousReviews.length > 0;
    const { delta, trend } = trendFromScoreDelta(currentAvg, previousAvg, prevHas);

    const byCur = aggregateReviewsByTaskType(currentReviews);
    const byPrev = aggregateReviewsByTaskType(previousReviews);
    const taskTypes = new Set<string>([...byCur.keys(), ...byPrev.keys()]);
    const byTaskType = [...taskTypes].map((taskType) => {
      const c = byCur.get(taskType);
      const p = byPrev.get(taskType);
      const cReviews = c?.reviews.length ?? 0;
      const pReviews = p?.reviews.length ?? 0;
      const cAvg = c && c.scores.length ? avg(c.scores) : null;
      const pAvg = p && p.scores.length ? avg(p.scores) : null;
      if (cReviews === 0 && pReviews === 0) {
        return {
          taskType,
          currentCount: 0,
          previousCount: 0,
          currentAvg: null,
          previousAvg: null,
          deltaPercent: null,
          trend: "none" as const,
          trendLabel: "—",
        };
      }
      if (cReviews === 0 && pReviews > 0) {
        return {
          taskType,
          currentCount: 0,
          previousCount: pReviews,
          currentAvg: null,
          previousAvg: pAvg != null ? Math.round(pAvg * 10) / 10 : null,
          deltaPercent: null,
          trend: "none" as const,
          trendLabel: "—",
        };
      }
      const pHasT = pReviews > 0;
      const t = trendFromScoreDelta(cAvg, pAvg, pHasT);
      let taskTrend = t.trend;
      if (cReviews > 0 && !pHasT) taskTrend = "new";
      if (cReviews > 0 && pHasT && cAvg != null && pAvg == null) taskTrend = "new";
      return {
        taskType,
        currentCount: cReviews,
        previousCount: pReviews,
        currentAvg: cAvg != null ? Math.round(cAvg * 10) / 10 : null,
        previousAvg: pAvg != null ? Math.round(pAvg * 10) / 10 : null,
        deltaPercent: t.delta,
        trend: taskTrend,
        trendLabel: formatScoreTrendArrow(taskTrend, t.delta),
      };
    });
    byTaskType.sort(
      (a, b) =>
        b.currentCount - a.currentCount ||
        (a.taskType ?? "").localeCompare(b.taskType ?? "", undefined, { sensitivity: "base" })
    );

    const lo = startDate <= endDate ? startDate : endDate;
    const hi = startDate <= endDate ? endDate : startDate;
    const scoreChart = dailyScoreBuckets(currentReviews, lo, hi);

    const lineCoachingByTaskType: Record<string, ReturnType<typeof buildLineCoachingRowsForTaskType>> = {};
    for (const tt of taskTypes) {
      lineCoachingByTaskType[tt] = buildLineCoachingRowsForTaskType(
        currentReviews,
        previousReviews,
        tt
      );
    }

    return NextResponse.json({
      success: true,
      data: serializeForClientJson({
        agentId,
        current: { startYmd: lo, endYmd: hi },
        previous: { startYmd: prevStartYmd, endYmd: prevEndYmd },
        overall: {
          currentAvg: currentAvg != null ? Math.round(currentAvg * 10) / 10 : null,
          previousAvg: previousAvg != null ? Math.round(previousAvg * 10) / 10 : null,
          deltaPercent: delta,
          trend,
          trendLabel: formatScoreTrendArrow(trend, delta),
          currentReviewCount: currentReviews.length,
          previousReviewCount: previousReviews.length,
        },
        byTaskType,
        scoreChart,
        lineCoachingByTaskType,
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("INVALID_AGENT_DATE")) {
      return NextResponse.json(
        { success: false, error: "Invalid startDate or endDate. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }
    console.error("[quality-review/dashboard/agents/trends]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
