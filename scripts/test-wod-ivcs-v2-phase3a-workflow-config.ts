/**
 * Phase 3A workflow config tests (Angelic Harmony / local only).
 * Run: npx tsx scripts/test-wod-ivcs-v2-phase3a-workflow-config.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  evaluateStepConditions,
  resolveOutcomeRule,
  validateAnswers,
  loadMatchJson,
  type WorkflowStepInput,
  type WorkflowOutcomeRuleInput,
} from "../src/lib/wod-ivcs/workflow-engine";

const prisma = new PrismaClient();
const WORKFLOW_SLUG = "invalid-cash-sale-v1";

async function main() {
  console.log("=== WOD/IVCS v2 Phase 3A workflow config tests ===\n");

  const catalogCounts = await prisma.wodIvcsWorkflowCatalog.groupBy({
    by: ["catalogType"],
    _count: { id: true },
  });
  if (catalogCounts.length < 4) {
    throw new Error(`Expected 4 catalogs, found ${catalogCounts.length}. Run seed script first.`);
  }
  console.log("1. Catalogs present", catalogCounts.map((c) => `${c.catalogType}:${c._count.id}`));

  const optionCount = await prisma.wodIvcsWorkflowCatalogOption.count({ where: { isActive: true } });
  if (optionCount < 10) throw new Error(`Expected seeded options, found ${optionCount}`);
  console.log("2. Catalog options seeded", optionCount);

  const definition = await prisma.wodIvcsWorkflowDefinition.findUnique({
    where: { slug: WORKFLOW_SLUG },
  });
  if (!definition) throw new Error("Workflow definition missing — run seed script");
  console.log("3. Workflow definition exists", definition.slug);

  const published = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: { workflowId: definition.id, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!published) throw new Error("No published workflow version");
  console.log("4. Published version exists", `v${published.version}`);

  const publishedCount = await prisma.wodIvcsWorkflowVersion.count({
    where: { workflowId: definition.id, status: "PUBLISHED" },
  });
  if (publishedCount !== 1) {
    throw new Error(`Expected exactly 1 published version, found ${publishedCount}`);
  }

  const steps = await prisma.wodIvcsWorkflowStep.findMany({
    where: { versionId: published.id },
    include: { conditions: true },
    orderBy: { sortOrder: "asc" },
  });
  const expectedSlugs = ["root_cause", "cash_sale_exists", "merchant", "fix_type"];
  for (const slug of expectedSlugs) {
    if (!steps.find((s) => s.slug === slug)) {
      throw new Error(`Missing step: ${slug}`);
    }
  }
  console.log("5. Steps in order", steps.map((s) => s.slug).join(" → "));

  const rules = await prisma.wodIvcsWorkflowOutcomeRule.findMany({
    where: { versionId: published.id, isActive: true },
    orderBy: { priority: "asc" },
  });
  if (rules.length < 3) throw new Error("Expected outcome rules");
  console.log("6. Outcome rules exist", rules.length);

  const stepInputs: WorkflowStepInput[] = steps.map((s) => ({
    slug: s.slug,
    label: s.label,
    fieldType: s.fieldType,
    sortOrder: s.sortOrder,
    isRequired: s.isRequired,
    conditions: s.conditions.map((c) => ({
      dependsOnStepSlug: c.dependsOnStepSlug,
      operator: c.operator,
      valueJson: c.valueJson,
    })),
  }));

  const ruleInputs: WorkflowOutcomeRuleInput[] = rules.map((r) => ({
    priority: r.priority,
    name: r.name,
    matchJson: loadMatchJson(r.matchJson),
    targetQueue: r.targetQueue,
    productivityCreditMode: r.productivityCreditMode,
    operationalCompletionMode: r.operationalCompletionMode,
    requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
    requiresProcessedReship: r.requiresProcessedReship,
    requiresItEscalation: r.requiresItEscalation,
    requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
    effectsJson: r.effectsJson as Record<string, unknown> | null,
    isActive: r.isActive,
  }));

  const fixedAnswers = {
    root_cause: "amount_mismatch",
    cash_sale_exists: "yes",
    merchant: "city_beauty",
    fix_type: "fixed_amounts",
  };

  const validationOk = validateAnswers(stepInputs, fixedAnswers);
  if (!validationOk.valid) {
    throw new Error(`Validation should pass: ${validationOk.errors.join("; ")}`);
  }

  const resolved = resolveOutcomeRule(ruleInputs, fixedAnswers);
  if (resolved.targetQueue !== "COMPLETED") {
    throw new Error(`Expected COMPLETED queue, got ${resolved.targetQueue}`);
  }
  if (resolved.matchedBy !== "rule") {
    throw new Error("Expected rule match, got fallback");
  }
  console.log("7. Engine resolves fixed-amounts path →", resolved.targetQueue, `(${resolved.name})`);

  const missingValidation = validateAnswers(stepInputs, {
    root_cause: "amount_mismatch",
    cash_sale_exists: "yes",
  });
  if (missingValidation.valid) {
    throw new Error("Validation should fail when required answers missing");
  }
  console.log("8. Missing required answers fail validation");

  const reshipAnswers = {
    ...fixedAnswers,
    fix_type: "reship",
    replacement_order_number: "RPL123",
  };
  const reshipVisible = stepInputs.find((s) => s.slug === "replacement_order_number");
  if (!reshipVisible || !evaluateStepConditions(reshipVisible, reshipAnswers)) {
    throw new Error("Replacement step should be visible for reship");
  }
  const reshipResolved = resolveOutcomeRule(ruleInputs, reshipAnswers);
  if (reshipResolved.targetQueue !== "AWAITING_DROP_OFF") {
    throw new Error(`Expected AWAITING_DROP_OFF for reship, got ${reshipResolved.targetQueue}`);
  }
  console.log("9. Conditional reship path →", reshipResolved.targetQueue);

  const auditCount = await prisma.wodIvcsWorkflowConfigAuditLog.count();
  if (auditCount < 1) throw new Error("Expected audit log entries");
  console.log("10. Audit log entries exist", auditCount);

  console.log("\n✅ All Phase 3A workflow config tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
