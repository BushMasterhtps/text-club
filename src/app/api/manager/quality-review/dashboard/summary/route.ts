import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { loadQaDashboardSummary } from "@/lib/quality-review-dashboard";
import { QA_COVERAGE_TARGET_REVIEWS_PER_AGENT } from "@/lib/quality-review-constants";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const targetRaw = searchParams.get("coverageTarget");

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
    const data = await loadQaDashboardSummary(prisma, {
      startYmd: startDate,
      endYmd: endDate,
      coverageTarget,
    });
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("INVALID_AGENT_DATE")) {
      return NextResponse.json(
        { success: false, error: "Invalid startDate or endDate. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }
    console.error("[quality-review/dashboard/summary]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
