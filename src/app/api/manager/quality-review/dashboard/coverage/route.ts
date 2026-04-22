import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import {
  loadQaAgentCoverageRows,
  QA_ROSTER_SCOPE_ALL,
  QA_ROSTER_SCOPE_TRACKED,
  QA_TEAM_FILTER_ANY,
  QA_TEAM_FILTER_UNASSIGNED,
} from "@/lib/quality-review-dashboard";
import { QA_COVERAGE_TARGET_REVIEWS_PER_AGENT } from "@/lib/quality-review-constants";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const q = searchParams.get("q")?.trim() || null;
  const targetRaw = searchParams.get("coverageTarget");
  const rosterScopeRaw = searchParams.get("rosterScope")?.trim();
  const rosterScope =
    rosterScopeRaw === QA_ROSTER_SCOPE_TRACKED ? QA_ROSTER_SCOPE_TRACKED : QA_ROSTER_SCOPE_ALL;
  const qaTeamRaw = searchParams.get("qaTeam")?.trim();
  const qaTeamFilter =
    qaTeamRaw === QA_TEAM_FILTER_UNASSIGNED
      ? QA_TEAM_FILTER_UNASSIGNED
      : qaTeamRaw && qaTeamRaw !== QA_TEAM_FILTER_ANY
        ? qaTeamRaw
        : QA_TEAM_FILTER_ANY;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { success: false, error: "startDate and endDate are required (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  const coverageTarget = targetRaw
    ? Math.min(50, Math.max(1, parseInt(targetRaw, 10) || QA_COVERAGE_TARGET_REVIEWS_PER_AGENT))
    : QA_COVERAGE_TARGET_REVIEWS_PER_AGENT;

  try {
    const { rows, teamOptions } = await loadQaAgentCoverageRows(prisma, {
      startYmd: startDate,
      endYmd: endDate,
      agentSearch: q,
      coverageTarget,
      rosterScope,
      qaTeamFilter,
    });
    return NextResponse.json({
      success: true,
      data: {
        startYmd: startDate,
        endYmd: endDate,
        coverageTarget,
        rosterScope,
        qaTeamFilter,
        teamOptions,
        rows,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("INVALID_AGENT_DATE")) {
      return NextResponse.json(
        { success: false, error: "Invalid startDate or endDate. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }
    console.error("[quality-review/dashboard/coverage]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
