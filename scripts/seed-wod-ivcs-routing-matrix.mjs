/**
 * Seed WOD/IVCS v2 routing matrix starter rules (idempotent).
 * Prerequisite: scripts/seed-wod-ivcs-workflow-config.mjs
 * Usage: npx tsx scripts/seed-wod-ivcs-routing-matrix.mjs
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const prisma = new PrismaClient();
const WORKFLOW_SLUG = "invalid-cash-sale-v1";
const DRAFT_NOTES = "Phase 3D routing matrix seed draft";

const EXTRA_CATALOG_OPTIONS = {
  "root-cause": [
    { value: "tax_mismatch", label: "Tax Mismatch", sortOrder: 50 },
    { value: "non_actionable", label: "Non-Actionable", sortOrder: 60 },
    { value: "line_2_cs_error", label: "Line 2 Level Error in Cash Sale", sortOrder: 70 },
  ],
  merchant: [{ value: "cybersource", label: "CyberSource", sortOrder: 40 }],
  "fix-type": [
    {
      value: "retrigger_cs_only_no_changes",
      label: "Re-triggered CS Only - No Changes",
      sortOrder: 50,
    },
    {
      value: "edit_so_generate_cs",
      label: "Edit Sales Order and Generate Cash Sale",
      sortOrder: 60,
    },
    { value: "accounting_period_closed", label: "Accounting Period Closed", sortOrder: 70 },
  ],
};

const TYPE_TO_GROUP = {
  ROOT_CAUSE: { groupKey: "root_cause", displayOrder: 10 },
  CASH_SALE_EXISTS: { groupKey: "cash_sale_exists", displayOrder: 20 },
  MERCHANT: { groupKey: "merchant", displayOrder: 30 },
  FIX_TYPE: { groupKey: "fix_type", displayOrder: 40 },
};

async function ensureWorkflowSeed() {
  try {
    execSync("npx tsx scripts/seed-wod-ivcs-workflow-config.mjs", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch {
    console.warn("Workflow config seed reported an error; continuing if definition exists.");
  }
}

async function backfillCatalogs(definitionId) {
  const catalogs = await prisma.wodIvcsWorkflowCatalog.findMany();
  for (const catalog of catalogs) {
    const meta = TYPE_TO_GROUP[catalog.catalogType];
    await prisma.wodIvcsWorkflowCatalog.update({
      where: { id: catalog.id },
      data: {
        workflowDefinitionId: definitionId,
        groupKey: catalog.groupKey ?? meta?.groupKey ?? catalog.slug.replace(/-/g, "_"),
        displayOrder: catalog.displayOrder || meta?.displayOrder || 0,
      },
    });
  }
}

async function upsertExtraOptions() {
  for (const [slug, options] of Object.entries(EXTRA_CATALOG_OPTIONS)) {
    const catalog = await prisma.wodIvcsWorkflowCatalog.findFirst({ where: { slug } });
    if (!catalog) {
      console.warn(`Catalog missing: ${slug}`);
      continue;
    }
    for (const opt of options) {
      await prisma.wodIvcsWorkflowCatalogOption.upsert({
        where: { catalogId_value: { catalogId: catalog.id, value: opt.value } },
        create: {
          catalogId: catalog.id,
          value: opt.value,
          label: opt.label,
          sortOrder: opt.sortOrder,
          isActive: true,
        },
        update: { label: opt.label, sortOrder: opt.sortOrder, isActive: true },
      });
    }
  }
}

async function optionId(catalogSlug, value) {
  const catalog = await prisma.wodIvcsWorkflowCatalog.findFirst({ where: { slug: catalogSlug } });
  if (!catalog) return null;
  const opt = await prisma.wodIvcsWorkflowCatalogOption.findUnique({
    where: { catalogId_value: { catalogId: catalog.id, value } },
  });
  return opt?.id ?? null;
}

async function ensureRoutingDraft(definitionId, managerId) {
  let draft = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definitionId, status: "DRAFT", notes: DRAFT_NOTES },
  });
  if (draft) return draft;

  const anyDraft = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definitionId, status: "DRAFT" },
  });
  if (anyDraft) {
    const ruleCount = await prisma.wodIvcsWorkflowRoutingRule.count({
      where: { versionId: anyDraft.id },
    });
    if (ruleCount === 0) return anyDraft;
    console.log(`Using existing draft v${anyDraft.version} (${anyDraft.id})`);
    return anyDraft;
  }

  const maxVersion = await prisma.wodIvcsWorkflowVersion.aggregate({
    where: { workflowId: definitionId },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  draft = await prisma.wodIvcsWorkflowVersion.create({
    data: {
      workflowId: definitionId,
      version: nextVersion,
      status: "DRAFT",
      notes: DRAFT_NOTES,
      createdById: managerId,
    },
  });
  console.log(`Created routing draft version ${nextVersion}`);
  return draft;
}

async function upsertRoutingRule(versionId, seedKey, data, displayOrder) {
  const existing = await prisma.wodIvcsWorkflowRoutingRule.findFirst({
    where: {
      versionId,
      metadataJson: { path: ["seedKey"], equals: seedKey },
    },
  });

  const payload = {
    versionId,
    displayOrder,
    isActive: true,
    label: data.label,
    rootCauseOptionId: data.rootCauseOptionId ?? null,
    cashSaleExistsOptionId: data.cashSaleExistsOptionId ?? null,
    merchantOptionId: data.merchantOptionId ?? null,
    fixTypeOptionId: data.fixTypeOptionId ?? null,
    subDispositionRequired: data.subDispositionRequired ?? false,
    subDispositionQuestion: data.subDispositionQuestion ?? null,
    requiresRetriggerConfirmation: data.requiresRetriggerConfirmation ?? false,
    requiresItEscalation: data.requiresItEscalation ?? false,
    requiresReplacementOrderNumber: data.requiresReplacementOrderNumber ?? false,
    requiresProcessedReship: data.requiresProcessedReship ?? false,
    itEscalationPrompt: data.itEscalationPrompt ?? null,
    targetQueue: data.targetQueue,
    operationalCompletionMode: data.operationalCompletionMode ?? "REMAIN_OPEN",
    productivityCreditMode: data.productivityCreditMode ?? "NONE",
    dropOffBehavior: data.dropOffBehavior ?? "NO_AUTOMATIC_CHANGE",
    metadataJson: { seedKey, ...(data.metadataJson ?? {}) },
  };

  if (existing) {
    await prisma.wodIvcsWorkflowRoutingRule.update({
      where: { id: existing.id },
      data: payload,
    });
    if (data.subDispositionOptions?.length) {
      await prisma.wodIvcsWorkflowRoutingSubDispositionOption.deleteMany({
        where: { routingRuleId: existing.id },
      });
      for (let i = 0; i < data.subDispositionOptions.length; i++) {
        const o = data.subDispositionOptions[i];
        await prisma.wodIvcsWorkflowRoutingSubDispositionOption.create({
          data: {
            routingRuleId: existing.id,
            label: o.label,
            displayOrder: (i + 1) * 10,
            isActive: true,
          },
        });
      }
    }
    return existing.id;
  }

  const created = await prisma.wodIvcsWorkflowRoutingRule.create({
    data: {
      ...payload,
      subDispositionOptions: data.subDispositionOptions?.length
        ? {
            create: data.subDispositionOptions.map((o, i) => ({
              label: o.label,
              displayOrder: (i + 1) * 10,
              isActive: true,
            })),
          }
        : undefined,
    },
  });
  return created.id;
}

async function main() {
  console.log("=== WOD/IVCS routing matrix seed ===\n");

  await ensureWorkflowSeed();

  const manager = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });

  const definition = await prisma.wodIvcsWorkflowDefinition.findUnique({
    where: { slug: WORKFLOW_SLUG },
  });
  if (!definition) {
    throw new Error(`Workflow definition not found: ${WORKFLOW_SLUG}`);
  }

  await backfillCatalogs(definition.id);
  console.log("Catalog disposition groups backfilled");

  await upsertExtraOptions();
  console.log("Extra catalog options ready");

  const draft = await ensureRoutingDraft(definition.id, manager?.id);
  const existingCount = await prisma.wodIvcsWorkflowRoutingRule.count({
    where: { versionId: draft.id },
  });

  const ids = {
    tax_mismatch: await optionId("root-cause", "tax_mismatch"),
    non_actionable: await optionId("root-cause", "non_actionable"),
    line_2_cs_error: await optionId("root-cause", "line_2_cs_error"),
    it_system_issue: await optionId("root-cause", "it_system_issue"),
    cash_yes: await optionId("cash-sale-exists", "yes"),
    cybersource: await optionId("merchant", "cybersource"),
    retrigger_cs: await optionId("fix-type", "retrigger_cs_only_no_changes"),
    edit_so_cs: await optionId("fix-type", "edit_so_generate_cs"),
    accounting_closed: await optionId("fix-type", "accounting_period_closed"),
    reship: await optionId("fix-type", "reship"),
    fixed_amounts: await optionId("fix-type", "fixed_amounts"),
  };

  const missing = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing catalog options: ${missing.join(", ")}`);
  }

  const rules = [
    {
      seedKey: "tax_retrigger",
      displayOrder: 10,
      label: "Tax Mismatch · Yes · CyberSource · Re-triggered CS Only",
      rootCauseOptionId: ids.tax_mismatch,
      cashSaleExistsOptionId: ids.cash_yes,
      merchantOptionId: ids.cybersource,
      fixTypeOptionId: ids.retrigger_cs,
      requiresRetriggerConfirmation: true,
      targetQueue: "AWAITING_DROP_OFF",
      dropOffBehavior: "MARK_COMPLETED",
    },
    {
      seedKey: "tax_edit_so",
      displayOrder: 20,
      label: "Tax Mismatch · Yes · CyberSource · Edit SO + Generate CS",
      rootCauseOptionId: ids.tax_mismatch,
      cashSaleExistsOptionId: ids.cash_yes,
      merchantOptionId: ids.cybersource,
      fixTypeOptionId: ids.edit_so_cs,
      targetQueue: "AWAITING_DROP_OFF",
      dropOffBehavior: "MARK_COMPLETED",
    },
    {
      seedKey: "non_actionable_period",
      displayOrder: 30,
      label: "Non-Actionable · Accounting Period Closed",
      rootCauseOptionId: ids.non_actionable,
      fixTypeOptionId: ids.accounting_closed,
      targetQueue: "ARCHIVED",
      operationalCompletionMode: "ARCHIVE_ORDER",
      dropOffBehavior: "ARCHIVE_ORDER",
    },
    {
      seedKey: "line_2_it",
      displayOrder: 40,
      label: "Line 2 Level Error in Cash Sale",
      rootCauseOptionId: ids.line_2_cs_error,
      fixTypeOptionId: ids.fixed_amounts,
      requiresItEscalation: true,
      itEscalationPrompt: "Describe the line 2 level error for IT review.",
      targetQueue: "IT_REVIEW",
      dropOffBehavior: "NEEDS_REVIEW",
    },
    {
      seedKey: "reship_path",
      displayOrder: 50,
      label: "Reship — replacement + processed reship",
      rootCauseOptionId: ids.tax_mismatch,
      fixTypeOptionId: ids.reship,
      requiresReplacementOrderNumber: true,
      requiresProcessedReship: true,
      targetQueue: "AWAITING_DROP_OFF",
      dropOffBehavior: "REMAIN_AWAITING_DROP_OFF",
    },
    {
      seedKey: "catch_all",
      displayOrder: 1000,
      label: "Default — needs action",
      targetQueue: "NEEDS_ACTION",
      dropOffBehavior: "NO_AUTOMATIC_CHANGE",
      metadataJson: { isCatchAll: true },
    },
  ];

  const cannotEditCs = await optionId("fix-type", "cannot_edit_cs");
  if (cannotEditCs) {
    rules[3].fixTypeOptionId = cannotEditCs;
  }

  for (const rule of rules) {
    await upsertRoutingRule(draft.id, rule.seedKey, rule, rule.displayOrder);
  }

  const finalCount = await prisma.wodIvcsWorkflowRoutingRule.count({
    where: { versionId: draft.id },
  });

  console.log(
    `\n✅ Routing matrix seed complete (draft v${draft.version}, ${finalCount} rules, was ${existingCount})`
  );
  console.log(`   Draft version id: ${draft.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
