import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";
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

    const templates = await prisma.qATemplate.findMany({
      where: { isActive: true, taskType },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { _count: { select: { lines: true } } },
        },
      },
      orderBy: { slug: "asc" },
    });

    const data = templates
      .map((t) => {
        const v = t.versions[0];
        if (!v || v._count.lines === 0) return null;
        return {
          templateId: t.id,
          templateVersionId: v.id,
          version: v.version,
          slug: t.slug,
          displayName: t.displayName,
          taskType: t.taskType,
          wodIvcsSource: t.wodIvcsSource,
          lineCount: v._count.lines,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/templates]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
