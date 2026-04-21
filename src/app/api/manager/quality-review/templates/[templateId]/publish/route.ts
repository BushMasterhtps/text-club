import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

function normalizeLineSlug(slug: string, index: number): string {
  let s = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!s) s = `line-${index + 1}`;
  return s.slice(0, 80);
}

function uniqueSlugs(slugs: string[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const s of slugs) {
    let cur = s;
    let n = 2;
    while (used.has(cur)) {
      const suffix = `-${n}`;
      n += 1;
      cur = `${s.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
    }
    used.add(cur);
    out.push(cur);
  }
  return out;
}

type LineInput = {
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { templateId } = await context.params;

  try {
    const body = (await request.json()) as { lines?: LineInput[] };
    const lines = body.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "lines array is required and must not be empty" },
        { status: 400 }
      );
    }
    if (lines.length > 500) {
      return NextResponse.json(
        { success: false, error: "At most 500 lines per version" },
        { status: 400 }
      );
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.label?.trim()) {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: label is required` },
          { status: 400 }
        );
      }
      if (!Number.isFinite(l.sectionOrder) || !Number.isFinite(l.lineOrder)) {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: sectionOrder and lineOrder must be numbers` },
          { status: 400 }
        );
      }
      if (!l.sectionTitle?.trim()) {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: sectionTitle is required` },
          { status: 400 }
        );
      }
      let dec: Prisma.Decimal;
      try {
        dec = new Prisma.Decimal(String(l.weight));
      } catch {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: invalid weight` },
          { status: 400 }
        );
      }
      if (dec.lessThan(0) || dec.greaterThan(1000)) {
        return NextResponse.json(
          { success: false, error: `Line ${i + 1}: weight must be between 0 and 1000` },
          { status: 400 }
        );
      }
    }

    const rawSlugs = lines.map((l, i) => normalizeLineSlug(l.slug || "", i));
    const finalSlugs = uniqueSlugs(rawSlugs);

    const result = await prisma.$transaction(async (tx) => {
      const template = await tx.qATemplate.findFirst({ where: { id: templateId } });
      if (!template) {
        throw new Error("NOT_FOUND");
      }

      await tx.qATemplate.updateMany({
        where: {
          taskType: template.taskType,
          isActive: true,
          id: { not: template.id },
        },
        data: { isActive: false },
      });

      await tx.qATemplate.update({
        where: { id: template.id },
        data: { isActive: true },
      });

      const last = await tx.qATemplateVersion.findFirst({
        where: { templateId: template.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (last?.version ?? 0) + 1;

      const versionRow = await tx.qATemplateVersion.create({
        data: {
          templateId: template.id,
          version: nextVersion,
          createdById: auth.userId,
        },
      });

      await tx.qALine.createMany({
        data: lines.map((l, i) => ({
          templateVersionId: versionRow.id,
          slug: finalSlugs[i]!,
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

      return { versionId: versionRow.id, version: nextVersion, lineCount: lines.length };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }
    console.error("[quality-review/templates/publish]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
