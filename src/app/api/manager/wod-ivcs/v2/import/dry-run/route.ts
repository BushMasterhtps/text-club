export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { runDryRun } from "@/lib/wod-ivcs/dry-run";
import { readCsvUpload, parseSourceReportType } from "../../_lib/parse-upload";

export async function POST(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const formData = await request.formData();
    const sourceReportType = parseSourceReportType(formData.get("sourceReportType"));
    if (!sourceReportType) {
      return NextResponse.json(
        { success: false, error: "Invalid sourceReportType" },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    const upload = { ok: true as const, fileName: file.name, csvText: await file.text() };

    const result = await runDryRun(prisma, sourceReportType, upload.fileName, upload.csvText);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[wod-ivcs/v2/import/dry-run]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Dry-run failed" },
      { status: 500 }
    );
  }
}
