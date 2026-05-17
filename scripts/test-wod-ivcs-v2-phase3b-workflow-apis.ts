/**
 * Phase 3B workflow config API/service tests (Angelic Harmony only).
 * Run: npx tsx scripts/test-wod-ivcs-v2-phase3b-workflow-apis.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  addCatalogOption,
  createDraftVersion,
  getActiveWorkflowDefinition,
  getWorkflowVersionGraph,
  listCatalogs,
  listWorkflowAuditLog,
  listWorkflowVersions,
  publishWorkflowVersion,
  replaceDraftOutcomeRules,
  replaceDraftSteps,
  simulateWorkflowVersion,
  updateCatalogOption,
  updateDraftVersionMetadata,
  validateWorkflowVersion,
  WorkflowConfigError,
} from "../src/lib/wod-ivcs/workflow-config-service";

const prisma = new PrismaClient();

async function expectError(fn: () => Promise<unknown>, code?: string) {
  try {
    await fn();
    throw new Error(`Expected error${code ? ` (${code})` : ""}`);
  } catch (e) {
    if (e instanceof WorkflowConfigError) {
      if (code && e.code !== code) {
        throw new Error(`Expected code ${code}, got ${e.code}: ${e.message}`);
      }
      return e;
    }
    throw e;
  }
}

async function main() {
  console.log("=== WOD/IVCS v2 Phase 3B workflow API tests ===\n");

  const user = await prisma.user.findFirst({
    where: { role: { in: ["MANAGER", "MANAGER_AGENT"] } },
  });
  if (!user) throw new Error("No manager user found");

  const catalogs = await listCatalogs(prisma);
  if (catalogs.length < 4) throw new Error("Expected seeded catalogs");
  console.log("1. GET catalogs OK", catalogs.length);

  const auditBefore = await prisma.wodIvcsWorkflowConfigAuditLog.count();

  const newOption = await addCatalogOption(prisma, {
    catalogType: "MERCHANT",
    value: "phase3b_test_merchant",
    label: "Phase 3B Test Merchant",
    sortOrder: 999,
    actorId: user.id,
  });
  console.log("2. Add catalog option OK", newOption.id);

  const updatedOption = await updateCatalogOption(prisma, {
    optionId: newOption.id,
    actorId: user.id,
    label: "Phase 3B Test Merchant (updated)",
  });
  if (!updatedOption.label.includes("updated")) throw new Error("Patch option failed");
  console.log("3. Patch catalog option OK");

  const auditAfterMutations = await prisma.wodIvcsWorkflowConfigAuditLog.count();
  if (auditAfterMutations < auditBefore + 2) {
    throw new Error("Expected audit log entries for add + patch");
  }
  console.log("4. Audit log mutations recorded");

  const { publishedVersion } = await getActiveWorkflowDefinition(prisma);
  if (!publishedVersion) throw new Error("No published version from seed");

  const draftGraph = await createDraftVersion(prisma, {
    actorId: user.id,
    cloneFromPublished: true,
    notes: "Phase 3B test draft",
  });
  const draftId = draftGraph.version.id;
  if (draftGraph.version.status !== "DRAFT") throw new Error("Expected DRAFT");
  console.log("5. Create draft from published OK", `v${draftGraph.version.version}`);

  const fullGraph = await getWorkflowVersionGraph(prisma, draftId);
  if (fullGraph.version.steps.length < 4) throw new Error("Draft graph missing steps");
  console.log("6. Fetch full draft graph OK", fullGraph.version.steps.length, "steps");

  const validation = await validateWorkflowVersion(prisma, draftId);
  if (!validation.valid) {
    throw new Error(`Draft validate failed: ${validation.errors.join("; ")}`);
  }
  console.log("7. Validate draft OK");

  const simOk = await simulateWorkflowVersion(prisma, draftId, {
    root_cause: "amount_mismatch",
    cash_sale_exists: "yes",
    merchant: "city_beauty",
    fix_type: "fixed_amounts",
  });
  if (simOk.matchedRule.targetQueue !== "COMPLETED") {
    throw new Error(`Expected COMPLETED, got ${simOk.matchedRule.targetQueue}`);
  }
  console.log("8. Simulate fixed_amounts → COMPLETED OK");

  const simBad = await simulateWorkflowVersion(prisma, draftId, {
    root_cause: "amount_mismatch",
  });
  if (simBad.validation.valid) {
    throw new Error("Expected validation errors for missing answers");
  }
  console.log("9. Simulate missing answers fails validation OK");

  await replaceDraftSteps(prisma, draftId, fullGraph.version.steps.map((s) => ({
    slug: s.slug,
    label: s.label,
    helpText: s.helpText,
    fieldType: s.fieldType,
    catalogId: s.catalogId,
    sortOrder: s.sortOrder,
    isRequired: s.isRequired,
    inlineOptionsJson: s.inlineOptionsJson,
    validationRulesJson: s.validationRulesJson,
    conditions: s.conditions.map((c) => ({
      dependsOnStepSlug: c.dependsOnStepSlug,
      operator: c.operator,
      valueJson: c.valueJson,
    })),
  })), user.id);
  console.log("10. Replace draft steps OK");

  await replaceDraftOutcomeRules(
    prisma,
    draftId,
    fullGraph.version.outcomeRules.map((r) => ({
      priority: r.priority,
      name: r.name,
      matchJson: r.matchJson,
      targetQueue: r.targetQueue,
      productivityCreditMode: r.productivityCreditMode,
      operationalCompletionMode: r.operationalCompletionMode,
      requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
      requiresProcessedReship: r.requiresProcessedReship,
      requiresItEscalation: r.requiresItEscalation,
      requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
      effectsJson: r.effectsJson,
      isActive: r.isActive,
    })),
    user.id
  );
  console.log("11. Replace draft outcome rules OK");

  await updateDraftVersionMetadata(prisma, draftId, {
    actorId: user.id,
    notes: "Ready to publish for Phase 3B test",
  });

  const publishedGraph = await publishWorkflowVersion(prisma, draftId, user.id);
  if (publishedGraph.version.status !== "PUBLISHED") {
    throw new Error("Publish did not set PUBLISHED");
  }

  const publishedCount = await prisma.wodIvcsWorkflowVersion.count({
    where: { workflowId: publishedGraph.version.workflowId, status: "PUBLISHED" },
  });
  if (publishedCount !== 1) {
    throw new Error(`Expected 1 published version, found ${publishedCount}`);
  }

  const archived = await prisma.wodIvcsWorkflowVersion.findUnique({
    where: { id: publishedVersion.id },
  });
  if (archived?.status !== "ARCHIVED") {
    throw new Error("Prior published version should be ARCHIVED");
  }
  console.log("12. Publish archives prior and leaves one published OK");

  const auditLog = await listWorkflowAuditLog(prisma, { take: 20 });
  if (auditLog.total < 5) throw new Error("Expected audit log entries");
  console.log("13. Audit log has entries", auditLog.total);

  await expectError(() => getWorkflowVersionGraph(prisma, "nonexistent-id"), "VERSION_NOT_FOUND");
  console.log("14. Nonexistent version returns 404 OK");

  await expectError(
    () => updateDraftVersionMetadata(prisma, draftId, { actorId: user.id, notes: "nope" }),
    "NOT_DRAFT"
  );
  console.log("15. Cannot edit PUBLISHED version OK");

  const versions = await listWorkflowVersions(prisma);
  console.log("\nVersions:", versions.map((v) => `v${v.version} ${v.status}`).join(", "));

  console.log("\n✅ All Phase 3B workflow API tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
