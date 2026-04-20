/**
 * Quality Review (QA*) — idempotent template seed from prisma/data/quality-review-seed.json
 * Run: npx prisma db seed  (requires prisma.seed in package.json)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));

const prisma = new PrismaClient();

const TASK_DISPLAY = {
  TEXT_CLUB: 'Text Club',
  EMAIL_REQUESTS: 'Email Requests',
  YOTPO: 'Yotpo',
  WOD_IVCS: 'WOD / IVCS',
};

function newId() {
  return randomUUID().replace(/-/g, '').slice(0, 25);
}

function expandedTemplateSlug(baseSlug, taskType) {
  return `${baseSlug}__${taskType}`;
}

function displayNameForExpanded(taskType, baseDisplayName, taskTypesLength) {
  if (taskTypesLength === 1) {
    return baseDisplayName;
  }
  const label = TASK_DISPLAY[taskType] || taskType;
  return `Quality Review – ${label}`;
}

/**
 * @param {import('@prisma/client').PrismaClient} db
 */
async function ensureTemplateVersionLines(
  db,
  { slug, displayName, taskType, wodIvcsSource, versionNumber, lines }
) {
  const template = await db.qATemplate.upsert({
    where: { slug },
    create: {
      id: newId(),
      slug,
      displayName,
      taskType,
      wodIvcsSource: wodIvcsSource ?? null,
      isActive: true,
    },
    update: {
      displayName,
      taskType,
      wodIvcsSource: wodIvcsSource ?? null,
      isActive: true,
    },
  });

  const existingV1 = await db.qATemplateVersion.findUnique({
    where: {
      templateId_version: {
        templateId: template.id,
        version: versionNumber,
      },
    },
    include: {
      _count: { select: { lines: true } },
    },
  });

  if (existingV1 && existingV1._count.lines > 0) {
    console.log(`[qa-seed] skip (already seeded): ${slug}`);
    return;
  }

  let templateVersionId = existingV1?.id;

  if (!existingV1) {
    const tv = await db.qATemplateVersion.create({
      data: {
        id: newId(),
        templateId: template.id,
        version: versionNumber,
      },
    });
    templateVersionId = tv.id;
  }

  await db.qALine.createMany({
    data: lines.map((line) => ({
      id: newId(),
      templateVersionId,
      slug: line.slug,
      sectionOrder: line.sectionOrder,
      sectionTitle: line.sectionTitle,
      lineOrder: line.lineOrder,
      label: line.label,
      helpText: line.helpText ?? null,
      weight: line.weight,
      isCritical: Boolean(line.isCritical),
      allowNa: Boolean(line.allowNa),
    })),
  });

  console.log(`[qa-seed] ensured "${slug}" (${lines.length} lines on v${versionNumber})`);
}

/**
 * @param {import('@prisma/client').PrismaClient} db
 * @param {object} seedFile
 */
async function seedTemplates(db, seedFile) {
  for (const logical of seedFile.templates) {
    const { slug: baseSlug, displayName: baseDisplayName, taskTypes, wodIvcsSource, versions } =
      logical;

    if (!versions?.length) continue;

    const versionSpec = versions.find((v) => v.version === 1) || versions[0];
    if (!versionSpec?.lines?.length) {
      console.warn(`[qa-seed] skip "${baseSlug}": no version 1 lines`);
      continue;
    }

    for (const taskType of taskTypes) {
      const slug = expandedTemplateSlug(baseSlug, taskType);
      const displayName = displayNameForExpanded(
        taskType,
        baseDisplayName,
        taskTypes.length
      );

      await ensureTemplateVersionLines(db, {
        slug,
        displayName,
        taskType,
        wodIvcsSource,
        versionNumber: versionSpec.version,
        lines: versionSpec.lines,
      });
    }
  }
}

async function main() {
  const path = join(__dirname, 'data', 'quality-review-seed.json');
  const raw = readFileSync(path, 'utf8');
  const seedFile = JSON.parse(raw);

  if (!seedFile.templates?.length) {
    console.warn('[qa-seed] no templates in JSON');
    return;
  }

  await seedTemplates(prisma, seedFile);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
