import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import {
  QUALITY_REVIEW_TASK_TYPES,
  resolveActiveTemplateForTaskType,
} from "@/lib/quality-review-template";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const rows = await Promise.all(
      QUALITY_REVIEW_TASK_TYPES.map(async (taskType) => {
        const active = await resolveActiveTemplateForTaskType(taskType);
        const duplicates = await prisma.qATemplate.count({
          where: {
            taskType,
            isActive: true,
          },
        });
        return {
          taskType,
          active,
          activeTemplateCount: duplicates,
          misconfiguredMultipleActives: duplicates > 1,
        };
      })
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/templates/overview]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
