export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { parseImportRunImpactCompact } from "@/lib/wod-ivcs/import-impact-service";

export async function GET(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const url = new URL(request.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 20), 1), 100);
    const skip = Math.max(Number(url.searchParams.get("skip") ?? 0), 0);

    const [total, runs] = await Promise.all([
      prisma.wodIvcsImportRun.count({ where: { isDryRun: false } }),
      prisma.wodIvcsImportRun.findMany({
        where: { isDryRun: false },
        orderBy: { createdAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          sourceReportType: true,
          fileName: true,
          status: true,
          totalRows: true,
          parsedRows: true,
          createdOrders: true,
          updatedOrders: true,
          errorRows: true,
          skippedRows: true,
          summaryJson: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          importedBy: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      runs: runs.map((r) => ({
        id: r.id,
        sourceReportType: r.sourceReportType,
        fileName: r.fileName,
        status: r.status,
        totalRows: r.totalRows,
        parsedRows: r.parsedRows,
        createdOrders: r.createdOrders,
        updatedOrders: r.updatedOrders,
        errorRows: r.errorRows,
        skippedRows: r.skippedRows,
        startedAt: r.startedAt?.toISOString() ?? null,
        finishedAt: r.finishedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        importedBy: r.importedBy,
        impactCompact: parseImportRunImpactCompact(r.summaryJson),
      })),
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/import/runs]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load import runs" },
      { status: 500 }
    );
  }
}
