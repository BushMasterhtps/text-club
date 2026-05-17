/**
 * Seed default WOD/IVCS v2 workflow configuration (idempotent).
 * Usage: npx tsx scripts/seed-wod-ivcs-workflow-config.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WORKFLOW_SLUG = "invalid-cash-sale-v1";

const CATALOGS = [
  {
    catalogType: "ROOT_CAUSE",
    slug: "root-cause",
    displayName: "Root cause",
    options: [
      { value: "amount_mismatch", label: "Amount mismatch", sortOrder: 10 },
      { value: "missing_payment_info", label: "Missing payment info", sortOrder: 20 },
      { value: "cs_not_editable", label: "Cash sale not editable", sortOrder: 30 },
      { value: "it_system_issue", label: "IT / system issue", sortOrder: 40 },
    ],
  },
  {
    catalogType: "CASH_SALE_EXISTS",
    slug: "cash-sale-exists",
    displayName: "Cash sale exists",
    options: [
      { value: "yes", label: "Yes", sortOrder: 10 },
      { value: "no", label: "No", sortOrder: 20 },
      { value: "unknown", label: "Unknown", sortOrder: 30 },
    ],
  },
  {
    catalogType: "MERCHANT",
    slug: "merchant",
    displayName: "Merchant",
    options: [
      { value: "city_beauty", label: "City Beauty", sortOrder: 10 },
      { value: "gundry_md", label: "Gundry MD", sortOrder: 20 },
      { value: "other", label: "Other", sortOrder: 30 },
    ],
  },
  {
    catalogType: "FIX_TYPE",
    slug: "fix-type",
    displayName: "Fix type",
    options: [
      {
        value: "fixed_amounts",
        label: "Fixed amounts",
        sortOrder: 10,
        metadataJson: { legacyDispositionLabel: "Completed - Fixed Amounts", financialImpact: "saved" },
      },
      {
        value: "added_paypal",
        label: "Added PayPal payment info",
        sortOrder: 20,
        metadataJson: {
          legacyDispositionLabel: "Completed - Added PayPal Payment info",
          financialImpact: "saved",
        },
      },
      {
        value: "cannot_edit_cs",
        label: "Cannot edit cash sale",
        sortOrder: 30,
        metadataJson: { legacyDispositionLabel: "Completed - Cannot edit CS", financialImpact: "lost" },
      },
      {
        value: "reship",
        label: "Reship required",
        sortOrder: 40,
        metadataJson: { legacyDispositionLabel: "Unable to Complete - Not Completed - Reship" },
      },
    ],
  },
];

const STEPS = [
  { slug: "root_cause", label: "Root cause", catalogSlug: "root-cause", sortOrder: 10, isRequired: true },
  {
    slug: "cash_sale_exists",
    label: "Cash sale exists?",
    catalogSlug: "cash-sale-exists",
    sortOrder: 20,
    isRequired: true,
  },
  { slug: "merchant", label: "Merchant", catalogSlug: "merchant", sortOrder: 30, isRequired: true },
  { slug: "fix_type", label: "Fix type", catalogSlug: "fix-type", sortOrder: 40, isRequired: true },
  {
    slug: "replacement_order_number",
    label: "Replacement order number",
    catalogSlug: null,
    sortOrder: 50,
    isRequired: true,
    fieldType: "TEXT",
    conditions: [{ dependsOnStepSlug: "fix_type", operator: "EQ", valueJson: "reship" }],
  },
];

const OUTCOME_RULES = [
  {
    priority: 10,
    name: "Reship — awaiting follow-up",
    matchJson: { clauses: [{ stepSlug: "fix_type", operator: "EQ", values: ["reship"] }] },
    targetQueue: "AWAITING_DROP_OFF",
    productivityCreditMode: "NONE",
    operationalCompletionMode: "REMAIN_OPEN",
    requiresReplacementOrderNumber: true,
    requiresProcessedReship: false,
    requiresItEscalation: false,
    requiresRetriggerConfirmation: false,
  },
  {
    priority: 20,
    name: "IT escalation",
    matchJson: { clauses: [{ stepSlug: "root_cause", operator: "EQ", values: ["it_system_issue"] }] },
    targetQueue: "IT_REVIEW",
    productivityCreditMode: "NONE",
    operationalCompletionMode: "REMAIN_OPEN",
    requiresReplacementOrderNumber: false,
    requiresProcessedReship: false,
    requiresItEscalation: true,
    requiresRetriggerConfirmation: false,
  },
  {
    priority: 30,
    name: "Fixed — operationally complete",
    matchJson: {
      clauses: [{ stepSlug: "fix_type", operator: "IN", values: ["fixed_amounts", "added_paypal"] }],
    },
    targetQueue: "COMPLETED",
    productivityCreditMode: "AWARD_ON_OPERATIONAL_COMPLETE",
    operationalCompletionMode: "MARK_OPERATIONALLY_COMPLETE",
    requiresReplacementOrderNumber: false,
    requiresProcessedReship: false,
    requiresItEscalation: false,
    requiresRetriggerConfirmation: false,
    effectsJson: { financialImpact: "saved" },
  },
  {
    priority: 40,
    name: "Cannot edit CS — needs review",
    matchJson: { clauses: [{ stepSlug: "fix_type", operator: "EQ", values: ["cannot_edit_cs"] }] },
    targetQueue: "NEEDS_REVIEW",
    productivityCreditMode: "NONE",
    operationalCompletionMode: "REMAIN_OPEN",
    requiresReplacementOrderNumber: false,
    requiresProcessedReship: false,
    requiresItEscalation: false,
    requiresRetriggerConfirmation: false,
    effectsJson: { financialImpact: "lost" },
  },
  {
    priority: 100,
    name: "Default — needs action",
    matchJson: { clauses: [] },
    targetQueue: "NEEDS_ACTION",
    productivityCreditMode: "NONE",
    operationalCompletionMode: "REMAIN_OPEN",
    requiresReplacementOrderNumber: false,
    requiresProcessedReship: false,
    requiresItEscalation: false,
    requiresRetriggerConfirmation: false,
  },
];

async function upsertCatalog(def) {
  const catalog = await prisma.wodIvcsWorkflowCatalog.upsert({
    where: {
      catalogType_slug: { catalogType: def.catalogType, slug: def.slug },
    },
    create: {
      catalogType: def.catalogType,
      slug: def.slug,
      displayName: def.displayName,
      isActive: true,
    },
    update: { displayName: def.displayName, isActive: true },
  });

  for (const opt of def.options) {
    await prisma.wodIvcsWorkflowCatalogOption.upsert({
      where: { catalogId_value: { catalogId: catalog.id, value: opt.value } },
      create: {
        catalogId: catalog.id,
        value: opt.value,
        label: opt.label,
        sortOrder: opt.sortOrder,
        isActive: true,
        metadataJson: opt.metadataJson ?? undefined,
      },
      update: {
        label: opt.label,
        sortOrder: opt.sortOrder,
        isActive: true,
        metadataJson: opt.metadataJson ?? undefined,
      },
    });
  }

  return catalog;
}

async function main() {
  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });

  const catalogBySlug = {};
  for (const def of CATALOGS) {
    catalogBySlug[def.slug] = await upsertCatalog(def);
    console.log(`Catalog ready: ${def.catalogType} (${def.slug})`);
  }

  let definition = await prisma.wodIvcsWorkflowDefinition.findUnique({
    where: { slug: WORKFLOW_SLUG },
  });
  if (!definition) {
    definition = await prisma.wodIvcsWorkflowDefinition.create({
      data: {
        slug: WORKFLOW_SLUG,
        displayName: "Invalid Cash Sale (WOD/IVCS v2)",
        isActive: true,
        createdById: manager?.id,
      },
    });
    console.log(`Created workflow definition: ${WORKFLOW_SLUG}`);
  } else {
    console.log(`Workflow definition exists: ${WORKFLOW_SLUG}`);
  }

  let version = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definition.id, version: 1 },
  });

  if (!version) {
    await prisma.wodIvcsWorkflowVersion.updateMany({
      where: { workflowId: definition.id, status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    });

    version = await prisma.wodIvcsWorkflowVersion.create({
      data: {
        workflowId: definition.id,
        version: 1,
        status: "PUBLISHED",
        notes: "Starter workflow seeded for Phase 3A local testing",
        publishedAt: new Date(),
        publishedById: manager?.id,
        createdById: manager?.id,
      },
    });
    console.log("Created published workflow version 1");
  } else {
    console.log(`Workflow version 1 exists (${version.status})`);
  }

  const existingSteps = await prisma.wodIvcsWorkflowStep.count({
    where: { versionId: version.id },
  });

  if (existingSteps === 0) {
    for (const step of STEPS) {
      const catalog = step.catalogSlug ? catalogBySlug[step.catalogSlug] : null;
      const created = await prisma.wodIvcsWorkflowStep.create({
        data: {
          versionId: version.id,
          slug: step.slug,
          label: step.label,
          helpText: step.helpText ?? null,
          fieldType: step.fieldType ?? "SINGLE_SELECT",
          catalogId: catalog?.id ?? null,
          sortOrder: step.sortOrder,
          isRequired: step.isRequired,
        },
      });

      for (const cond of step.conditions ?? []) {
        await prisma.wodIvcsWorkflowStepCondition.create({
          data: {
            stepId: created.id,
            dependsOnStepSlug: cond.dependsOnStepSlug,
            operator: cond.operator,
            valueJson: cond.valueJson,
          },
        });
      }
    }
    console.log(`Created ${STEPS.length} workflow steps`);
  } else {
    console.log(`Steps already exist (${existingSteps})`);
  }

  const existingRules = await prisma.wodIvcsWorkflowOutcomeRule.count({
    where: { versionId: version.id },
  });

  if (existingRules === 0) {
    for (const rule of OUTCOME_RULES) {
      await prisma.wodIvcsWorkflowOutcomeRule.create({
        data: {
          versionId: version.id,
          ...rule,
        },
      });
    }
    console.log(`Created ${OUTCOME_RULES.length} outcome rules`);
  } else {
    console.log(`Outcome rules already exist (${existingRules})`);
  }

  const auditExists = await prisma.wodIvcsWorkflowConfigAuditLog.findFirst({
    where: { entityType: "WORKFLOW_VERSION", entityId: version.id, action: "PUBLISHED" },
  });
  if (!auditExists) {
    await prisma.wodIvcsWorkflowConfigAuditLog.create({
      data: {
        actorId: manager?.id,
        action: "PUBLISHED",
        entityType: "WORKFLOW_VERSION",
        entityId: version.id,
        afterJson: { workflowSlug: WORKFLOW_SLUG, version: 1, status: "PUBLISHED" },
        reason: "Phase 3A seed — starter published workflow",
      },
    });
    console.log("Created audit log entry for published version");
  }

  console.log("\n✅ WOD/IVCS workflow config seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
