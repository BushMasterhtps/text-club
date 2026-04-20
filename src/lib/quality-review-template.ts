import { prisma } from "@/lib/prisma";
import type { TaskType, WodIvcsSource } from "@prisma/client";

/**
 * Pick the active template version for sampling/review for a task type.
 * Prefer an exact wodIvcsSource match when provided; otherwise templates with null source (all WOD).
 */
export async function resolveActiveTemplateVersionId(
  taskType: TaskType,
  wodIvcsSource?: WodIvcsSource | null
): Promise<{ templateVersionId: string; templateId: string; displayName: string } | null> {
  const templates = await prisma.qATemplate.findMany({
    where: { isActive: true, taskType },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { _count: { select: { lines: true } } },
      },
    },
  });

  const withVersion = templates
    .map((t) => ({
      template: t,
      version: t.versions[0],
    }))
    .filter((x) => x.version && x.version._count.lines > 0);

  if (withVersion.length === 0) return null;

  if (taskType === "WOD_IVCS" && wodIvcsSource != null) {
    const exact = withVersion.find((x) => x.template.wodIvcsSource === wodIvcsSource);
    if (exact) {
      return {
        templateVersionId: exact.version!.id,
        templateId: exact.template.id,
        displayName: exact.template.displayName,
      };
    }
  }

  const catchAll = withVersion.find((x) => x.template.wodIvcsSource === null);
  if (catchAll) {
    return {
      templateVersionId: catchAll.version!.id,
      templateId: catchAll.template.id,
      displayName: catchAll.template.displayName,
    };
  }

  const first = withVersion[0];
  return {
    templateVersionId: first.version!.id,
    templateId: first.template.id,
    displayName: first.template.displayName,
  };
}
