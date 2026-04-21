import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
import { resolveActiveTemplateForTaskType } from "@/lib/quality-review-template";
import type { TaskType } from "@prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const taskType = searchParams.get("taskType") as TaskType | null;
    if (!taskType) {
      return NextResponse.json(
        { success: false, error: "taskType query parameter is required" },
        { status: 400 }
      );
    }

    const active = await resolveActiveTemplateForTaskType(taskType);
    if (!active) {
      return NextResponse.json({
        success: true,
        data: null,
        message: "No active checklist for this task type.",
      });
    }

    const dupes = await prisma.qATemplate.findMany({
      where: { taskType, wodIvcsSource: null, isActive: true },
      select: { id: true, slug: true },
      orderBy: { slug: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: active,
      warnings: dupes.length > 1 ? ["Multiple active canonical templates; resolve in template admin."] : [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/templates/active]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
