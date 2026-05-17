export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { id } = await params;
    const run = await prisma.wodIvcsImportRun.findUnique({
      where: { id },
      include: {
        importedBy: { select: { id: true, name: true, email: true } },
        reversedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!run) {
      return NextResponse.json({ success: false, error: "Import run not found" }, { status: 404 });
    }

    const rowStats = await prisma.wodIvcsImportRow.groupBy({
      by: ["status"],
      where: { importRunId: id },
      _count: { status: true },
    });

    const errorSamples = await prisma.wodIvcsImportRow.findMany({
      where: { importRunId: id, status: "ERROR" },
      take: 20,
      orderBy: { rowNumber: "asc" },
      select: { rowNumber: true, errorMessage: true },
    });

    return NextResponse.json({
      success: true,
      run: {
        ...run,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        reversedAt: run.reversedAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      },
      rowStats,
      errorSamples,
    });
  } catch (error) {
    console.error("[wod-ivcs/v2/import/runs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load import run" },
      { status: 500 }
    );
  }
}
