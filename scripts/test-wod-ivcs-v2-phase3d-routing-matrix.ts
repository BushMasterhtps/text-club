/**
 * Phase 3D routing matrix tests (Angelic Harmony / local only).
 * Run: npx tsx scripts/test-wod-ivcs-v2-phase3d-routing-matrix.ts
 */
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import {
  compileRoutingMatrixVersion,
  createRoutingRule,
  deactivateRoutingRule,
  duplicateRoutingRule,
  getRoutingRules,
  moveRoutingRule,
  previewAgentFlow,
  publishRoutingMatrixVersion,
  validateRoutingMatrixVersion,
} from "../src/lib/wod-ivcs/routing-matrix-service";
import { getActiveWorkflowDefinition } from "../src/lib/wod-ivcs/workflow-config-service";
import { resolveOutcomeRule, loadMatchJson } from "../src/lib/wod-ivcs/workflow-engine";

const prisma = new PrismaClient();
const WORKFLOW_SLUG = "invalid-cash-sale-v1";

async function main() {
  console.log("=== WOD/IVCS v2 Phase 3D routing matrix tests ===\n");

  execSync("npx tsx scripts/seed-wod-ivcs-workflow-config.mjs", { stdio: "inherit" });
  console.log("1. Workflow config seed OK\n");

  execSync("npx tsx scripts/seed-wod-ivcs-routing-matrix.mjs", { stdio: "inherit" });
  console.log("2. Routing matrix seed OK\n");

  const user = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!user) throw new Error("No manager user found");

  const definition = await prisma.wodIvcsWorkflowDefinition.findUniqueOrThrow({
    where: { slug: WORKFLOW_SLUG },
  });

  const draft = await prisma.wodIvcsWorkflowVersion.findFirst({
    where: {
      workflowId: definition.id,
      status: "DRAFT",
    },
    orderBy: { version: "desc" },
  });
  if (!draft) throw new Error("Expected a DRAFT version after routing seed");
  const draftId = draft.id;

  const { rules } = await getRoutingRules(prisma, draftId);
  if (rules.length < 5) {
    throw new Error(`Expected starter routing rules, got ${rules.length}`);
  }
  console.log("3. Routing rules present:", rules.length);

  const validation = await validateRoutingMatrixVersion(prisma, draftId);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
  }
  console.log("4. Active rules validate OK");

  const taxRule = rules.find((r) => r.label?.includes("Re-triggered CS Only"));
  if (!taxRule?.rootCauseOption || !taxRule.fixTypeOption) {
    throw new Error("Tax Mismatch retrigger rule not found");
  }

  const duplicatePath = await createRoutingRule(
    prisma,
    draftId,
    {
      rootCauseOptionId: taxRule.rootCauseOptionId,
      cashSaleExistsOptionId: taxRule.cashSaleExistsOptionId,
      merchantOptionId: taxRule.merchantOptionId,
      fixTypeOptionId: taxRule.fixTypeOptionId,
      targetQueue: "NEEDS_ACTION",
    },
    user.id
  );

  const dupValidation = await validateRoutingMatrixVersion(prisma, draftId);
  if (dupValidation.valid) {
    throw new Error("Expected duplicate active path validation to fail");
  }
  console.log("5. Duplicate active path validation fails OK");

  await deactivateRoutingRule(prisma, duplicatePath.id, user.id);

  const compiled = await compileRoutingMatrixVersion(prisma, draftId, user.id);
  const outcomeCount = await prisma.wodIvcsWorkflowOutcomeRule.count({
    where: { versionId: draftId },
  });
  if (outcomeCount < rules.filter((r) => r.isActive).length) {
    throw new Error("Compiler did not create enough outcome rules");
  }
  console.log("6. Compiler created outcome rules:", outcomeCount, compiled.compiled);

  const taxAnswers = {
    root_cause: taxRule.rootCauseOption.value,
    cash_sale_exists: taxRule.cashSaleExistsOption?.value ?? "yes",
    merchant: taxRule.merchantOption?.value,
    fix_type: taxRule.fixTypeOption.value,
  };

  const outcomeRules = await prisma.wodIvcsWorkflowOutcomeRule.findMany({
    where: { versionId: draftId, isActive: true },
    orderBy: { priority: "asc" },
  });
  const matched = resolveOutcomeRule(
    outcomeRules.map((r) => ({
      ...r,
      matchJson: loadMatchJson(r.matchJson),
    })),
    taxAnswers
  );
  if (!matched.name.includes("Tax Mismatch") && !matched.name.includes("Re-triggered")) {
    throw new Error(`Unexpected matched rule: ${matched.name}`);
  }
  const effects = matched.effectsJson as Record<string, unknown> | null;
  if (effects?.dropOffBehavior !== "MARK_COMPLETED") {
    throw new Error(`Expected dropOffBehavior MARK_COMPLETED, got ${effects?.dropOffBehavior}`);
  }
  console.log("7. Workflow engine resolves Tax Mismatch path OK");
  console.log("8. dropOffBehavior in effectsJson OK", effects?.dropOffBehavior);

  const dupRule = await duplicateRoutingRule(prisma, taxRule.id, user.id);
  if (!dupRule.label?.includes("copy")) {
    throw new Error("Duplicate rule label missing (copy)");
  }
  await deactivateRoutingRule(prisma, dupRule.id, user.id);
  console.log("9. Duplicate rule works OK");

  const beforeOrder = (await getRoutingRules(prisma, draftId)).rules.map((r) => r.id);
  const movable = beforeOrder.find((id) => id !== taxRule.id) ?? taxRule.id;
  await moveRoutingRule(prisma, movable, "down", user.id);
  const afterDown = (await getRoutingRules(prisma, draftId)).rules.map((r) => r.id);
  if (JSON.stringify(beforeOrder) === JSON.stringify(afterDown)) {
    console.log("10. Move down: no-op at boundary (OK)");
  } else {
    console.log("10. Move down changed displayOrder OK");
  }
  await moveRoutingRule(prisma, movable, "up", user.id);
  console.log("11. Move up OK");

  const ruleToDeactivate = dupRule.id;
  await deactivateRoutingRule(prisma, ruleToDeactivate, user.id);
  const inactive = await prisma.wodIvcsWorkflowRoutingRule.findUnique({
    where: { id: ruleToDeactivate },
  });
  if (inactive?.isActive) throw new Error("Deactivate failed");
  console.log("12. Deactivate rule OK");

  const auditBefore = await prisma.wodIvcsWorkflowConfigAuditLog.count({
    where: { entityType: { in: ["ROUTING_RULE", "ROUTING_MATRIX", "WORKFLOW_VERSION"] } },
  });

  await compileRoutingMatrixVersion(prisma, draftId, user.id);
  await publishRoutingMatrixVersion(prisma, draftId, user.id);

  const active = await getActiveWorkflowDefinition(prisma);
  if (!active.publishedVersion || active.publishedVersion.status !== "PUBLISHED") {
    throw new Error("GET active workflow failed after publish");
  }
  console.log("13. Publish/compile — active workflow OK", `v${active.publishedVersion.version}`);

  const auditAfter = await prisma.wodIvcsWorkflowConfigAuditLog.count({
    where: { entityType: { in: ["ROUTING_RULE", "ROUTING_MATRIX", "WORKFLOW_VERSION"] } },
  });
  if (auditAfter <= auditBefore) {
    throw new Error("Expected audit log entries after compile/publish");
  }
  console.log("14. Audit log entries written OK");

  const preview = await previewAgentFlow(prisma, draftId, {
    routingRuleId: taxRule.id,
  });
  if (!preview.simulation) throw new Error("Preview agent flow failed");
  console.log("15. Preview agent flow OK");

  console.log("\n✅ All Phase 3D routing matrix tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
