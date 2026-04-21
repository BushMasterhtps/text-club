import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
      where: { isActive: true, taskType, wodIvcsSource: null },
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

type CreateLineInput = {
  slug: string;
  sectionOrder: number;
  sectionTitle: string;
  lineOrder: number;
  label: string;
  helpText?: string | null;
  weight: string | number;
  isCritical: boolean;
  allowNa: boolean;
};

export async function POST(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = (await request.json()) as {
      taskType?: TaskType;
      slug?: string;
      displayName?: string;
      lines?: CreateLineInput[];
    };

    if (!body.taskType || !body.slug?.trim() || !body.displayName?.trim()) {
      return NextResponse.json(
        { success: false, error: "taskType, slug, and displayName are required" },
        { status: 400 }
      );
    }
    const lines = body.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "lines must be a non-empty array" },
        { status: 400 }
      );
    }

    const slug = body.slug.trim().slice(0, 200);
    const displayName = body.displayName.trim().slice(0, 200);

    const existingType = await prisma.qATemplate.findFirst({
      where: { taskType: body.taskType },
    });
    if (existingType) {
      return NextResponse.json(
        {
          success: false,
          error: `A template row already exists for task type ${body.taskType}. Edit that template instead.`,
        },
        { status: 409 }
      );
    }

    const slugTaken = await prisma.qATemplate.findUnique({ where: { slug } });
    if (slugTaken) {
      return NextResponse.json({ success: false, error: "Slug is already in use" }, { status: 409 });
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.label?.trim() || !l.sectionTitle?.trim()) {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: label and sectionTitle are required` },
          { status: 400 }
        );
      }
      try {
        const dec = new Prisma.Decimal(String(l.weight));
        if (dec.lessThan(0) || dec.greaterThan(1000)) throw new Error("range");
      } catch {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: invalid weight` },
          { status: 400 }
        );
      }
    }

    const used = new Set<string>();
    const normalizedSlugs = lines.map((l, i) => {
      let s = (l.slug || `line-${i + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
      if (!s) s = `line-${i + 1}`;
      let cur = s;
      let n = 2;
      while (used.has(cur)) {
        const suffix = `-${n}`;
        n += 1;
        cur = `${s.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
      }
      used.add(cur);
      return cur;
    });

    const created = await prisma.$transaction(async (tx) => {
      const template = await tx.qATemplate.create({
        data: {
          slug,
          displayName,
          taskType: body.taskType,
          wodIvcsSource: null,
          isActive: true,
          createdById: auth.userId,
        },
      });

      await tx.qATemplate.updateMany({
        where: { taskType: body.taskType, id: { not: template.id } },
        data: { isActive: false },
      });

      const version = await tx.qATemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          createdById: auth.userId,
        },
      });

      await tx.qALine.createMany({
        data: lines.map((l, i) => ({
          templateVersionId: version.id,
          slug: normalizedSlugs[i]!,
          sectionOrder: l.sectionOrder,
          sectionTitle: l.sectionTitle.trim(),
          lineOrder: l.lineOrder,
          label: l.label.trim(),
          helpText: l.helpText?.trim() || null,
          weight: new Prisma.Decimal(String(l.weight)),
          isCritical: Boolean(l.isCritical),
          allowNa: Boolean(l.allowNa),
        })),
      });

      return { templateId: template.id, templateVersionId: version.id };
    });

    return NextResponse.json({ success: true, data: created });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/templates POST]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
