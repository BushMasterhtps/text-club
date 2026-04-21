import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { templateId } = await context.params;

  try {
    const template = await prisma.qATemplate.findFirst({
      where: { id: templateId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            lines: { orderBy: [{ sectionOrder: "asc" }, { lineOrder: "asc" }] },
          },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    const latest = template.versions[0];
    if (!latest) {
      return NextResponse.json(
        { success: false, error: "Template has no versions" },
        { status: 400 }
      );
    }

    const lines = latest.lines.map((l) => ({
      id: l.id,
      slug: l.slug,
      sectionOrder: l.sectionOrder,
      sectionTitle: l.sectionTitle,
      lineOrder: l.lineOrder,
      label: l.label,
      helpText: l.helpText,
      weight: l.weight.toString(),
      isCritical: l.isCritical,
      allowNa: l.allowNa,
    }));

    return NextResponse.json({
      success: true,
      data: {
        template: {
          id: template.id,
          slug: template.slug,
          displayName: template.displayName,
          taskType: template.taskType,
          wodIvcsSource: template.wodIvcsSource,
          isActive: template.isActive,
        },
        latestVersion: {
          id: latest.id,
          version: latest.version,
          lineCount: lines.length,
        },
        lines,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/templates/[templateId] GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { templateId } = await context.params;

  try {
    const body = (await request.json()) as { displayName?: string };
    const displayName = body.displayName?.trim();
    if (!displayName || displayName.length > 200) {
      return NextResponse.json(
        { success: false, error: "displayName is required (max 200 chars)" },
        { status: 400 }
      );
    }

    const updated = await prisma.qATemplate.updateMany({
      where: { id: templateId },
      data: { displayName },
    });

    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { displayName } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/templates/[templateId] PATCH]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
