export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWodIvcsV2Enabled } from "@/lib/wod-ivcs/api-guard";
import { executeImport } from "@/lib/wod-ivcs/import-service";
import { readCsvUpload } from "../../_lib/parse-upload";

export async function POST(request: NextRequest) {
  const disabled = assertWodIvcsV2Enabled();
  if (disabled) return disabled;

  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const upload = await readCsvUpload(request);
    if (!upload.ok) {
      return NextResponse.json({ success: false, error: upload.error }, { status: upload.status });
    }

    const { importRunId, summary } = await executeImport(prisma, {
      sourceReportType: "NETSUITE_REPORT",
      fileName: upload.fileName,
      csvText: upload.csvText,
      importedById: auth.userId,
    });

    return NextResponse.json({ success: true, importRunId, summary });
  } catch (error) {
    console.error("[wod-ivcs/v2/import/netsuite]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
