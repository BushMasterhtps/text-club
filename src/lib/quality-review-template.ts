import { prisma } from "@/lib/prisma";
import type { TaskType } from "@prisma/client";

/** Task types we surface in Quality Review template admin + batch flow. */
export const QUALITY_REVIEW_TASK_TYPES: TaskType[] = [
  "TEXT_CLUB",
  "WOD_IVCS",
  "EMAIL_REQUESTS",
  "YOTPO",
  "HOLDS",
  "STANDALONE_REFUNDS",
];

export type ResolvedActiveTemplate = {
  templateId: string;
  templateVersionId: string;
  displayName: string;
  slug: string;
  version: number;
  lineCount: number;
};

/**
 * One active checklist per task type (this phase): canonical templates use
 * `wodIvcsSource === null` only. WOD_IVCS does not pick different templates by source.
 *
 * If multiple active canonical templates exist (misconfiguration), the earliest slug wins.
 */
export async function resolveActiveTemplateForTaskType(
  taskType: TaskType
): Promise<ResolvedActiveTemplate | null> {
  const templates = await prisma.qATemplate.findMany({
    where: {
      isActive: true,
      taskType,
      wodIvcsSource: null,
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { _count: { select: { lines: true } } },
      },
    },
    orderBy: { slug: "asc" },
  });

  const withVersion = templates
    .map((t) => ({
      template: t,
      version: t.versions[0],
    }))
    .filter((x) => x.version && x.version._count.lines > 0);

  if (withVersion.length === 0) return null;

  const { template, version } = withVersion[0]!;
  return {
    templateId: template.id,
    templateVersionId: version!.id,
    displayName: template.displayName,
    slug: template.slug,
    version: version!.version,
    lineCount: version!._count.lines,
  };
}
