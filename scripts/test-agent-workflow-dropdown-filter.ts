/**
 * Local validation for agent guided workflow dropdown filtering.
 * Usage: npx tsx scripts/test-agent-workflow-dropdown-filter.ts
 */
import { PrismaClient } from "@prisma/client";
import { getRoutingRules } from "../src/lib/wod-ivcs/routing-matrix-service";
import { getActiveWorkflowGraph } from "../src/lib/wod-ivcs/workflow-config-service";
import {
  getCoreSteps,
  getFilteredCoreStepOptions,
  type AgentActiveWorkflow,
  type AgentRoutingRuleRef,
} from "../src/lib/wod-ivcs/agent-workflow-form-utils";

const prisma = new PrismaClient();

function serializeCatalogOption(opt: {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  metadataJson: unknown;
}) {
  return {
    id: opt.id,
    value: opt.value,
    label: opt.label,
    sortOrder: opt.sortOrder,
    metadataJson: opt.metadataJson,
  };
}

async function buildActiveWorkflowPayload(): Promise<AgentActiveWorkflow> {
  const active = await getActiveWorkflowGraph(prisma);
  const { rules } = await getRoutingRules(prisma, active.version.id);
  const routingRules: AgentRoutingRuleRef[] = rules
    .filter((r) => r.isActive)
    .map((r) => ({
      id: r.id,
      label: r.label,
      displayOrder: r.displayOrder,
      targetQueue: r.targetQueue,
      rootCauseOption: r.rootCauseOption
        ? { id: r.rootCauseOption.id, value: r.rootCauseOption.value, label: r.rootCauseOption.label }
        : null,
      cashSaleExistsOption: r.cashSaleExistsOption
        ? {
            id: r.cashSaleExistsOption.id,
            value: r.cashSaleExistsOption.value,
            label: r.cashSaleExistsOption.label,
          }
        : null,
      merchantOption: r.merchantOption
        ? { id: r.merchantOption.id, value: r.merchantOption.value, label: r.merchantOption.label }
        : null,
      fixTypeOption: r.fixTypeOption
        ? { id: r.fixTypeOption.id, value: r.fixTypeOption.value, label: r.fixTypeOption.label }
        : null,
      followUpQuestions: [],
      requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
      requiresItEscalation: r.requiresItEscalation,
      requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
      requiresProcessedReship: r.requiresProcessedReship,
      itEscalationPrompt: r.itEscalationPrompt,
    }));

  return {
    definition: {
      id: active.definition.id,
      slug: active.definition.slug,
      displayName: active.definition.displayName,
    },
    version: {
      id: active.version.id,
      version: active.version.version,
      status: active.version.status,
      routingMatrixHash: active.version.routingMatrixHash,
      publishedAt: active.version.publishedAt?.toISOString() ?? null,
    },
    catalogs: active.catalogs.map((c) => ({
      id: c.id,
      catalogType: c.catalogType,
      slug: c.slug,
      displayName: c.displayName,
      options: c.options.filter((o) => o.isActive).map(serializeCatalogOption),
    })),
    steps: active.version.steps.map((s) => ({
      id: s.id,
      slug: s.slug,
      label: s.label,
      helpText: s.helpText,
      fieldType: s.fieldType,
      sortOrder: s.sortOrder,
      isRequired: s.isRequired,
      catalogId: s.catalogId,
      conditions: s.conditions.map((c) => ({
        dependsOnStepSlug: c.dependsOnStepSlug,
        operator: c.operator,
        valueJson: c.valueJson,
      })),
      catalog: s.catalog
        ? {
            slug: s.catalog.slug,
            catalogType: s.catalog.catalogType,
            options: s.catalog.options.map(serializeCatalogOption),
          }
        : null,
    })),
    routingRules,
  };
}

function findTaxMismatchRootOption(active: AgentActiveWorkflow) {
  const rootStep = getCoreSteps(active).find((s) => s.slug === "root_cause");
  if (!rootStep) throw new Error("root_cause step missing");

  const taxRule = active.routingRules.find(
    (r) =>
      r.rootCauseOption?.label?.toLowerCase().includes("tax") ||
      r.rootCauseOption?.value?.includes("tax")
  );
  if (!taxRule?.rootCauseOption) {
    throw new Error("No tax-related routing rule in active matrix");
  }

  const catalogOpt =
    rootStep.catalog?.options.find((o) => o.value === taxRule.rootCauseOption!.value) ??
    rootStep.catalog?.options.find((o) => o.id === taxRule.rootCauseOption!.id);

  if (!catalogOpt) {
    throw new Error(
      `Tax root option not on step catalog (rule value=${taxRule.rootCauseOption.value})`
    );
  }

  return { rootStep, taxRule, catalogOpt };
}

async function main() {
  const active = await buildActiveWorkflowPayload();
  const coreSteps = getCoreSteps(active);
  const { catalogOpt, taxRule } = findTaxMismatchRootOption(active);

  console.log("Active workflow shape sample (routing rule):");
  console.log(
    JSON.stringify(
      {
        rootCauseOption: taxRule.rootCauseOption,
        cashSaleExistsOption: taxRule.cashSaleExistsOption,
        merchantOption: taxRule.merchantOption,
        fixTypeOption: taxRule.fixTypeOption,
      },
      null,
      2
    )
  );

  const answers1 = { root_cause: catalogOpt.value };
  const cashStep = coreSteps.find((s) => s.slug === "cash_sale_exists")!;
  const cashOpts = getFilteredCoreStepOptions(cashStep, active.routingRules, answers1);
  if (cashOpts.length < 1) {
    throw new Error(`Expected cash_sale_exists options after tax root, got ${cashOpts.length}`);
  }
  console.log("cash_sale_exists options:", cashOpts.map((o) => o.value).join(", "));

  const cashValue = cashOpts[0]!.value;
  const answers2 = { ...answers1, cash_sale_exists: cashValue };
  const merchantStep = coreSteps.find((s) => s.slug === "merchant")!;
  const merchantOpts = getFilteredCoreStepOptions(merchantStep, active.routingRules, answers2);
  if (merchantOpts.length < 1) {
    throw new Error(`Expected merchant options, got ${merchantOpts.length}`);
  }
  console.log("merchant options:", merchantOpts.map((o) => o.value).join(", "));

  const merchantValue = merchantOpts[0]!.value;
  const answers3 = { ...answers2, merchant: merchantValue };
  const fixStep = coreSteps.find((s) => s.slug === "fix_type")!;
  const fixOpts = getFilteredCoreStepOptions(fixStep, active.routingRules, answers3);
  if (fixOpts.length < 1) {
    throw new Error(`Expected fix_type options, got ${fixOpts.length}`);
  }
  console.log("fix_type options:", fixOpts.map((o) => o.value).join(", "));

  const rootOpts = getFilteredCoreStepOptions(
    coreSteps.find((s) => s.slug === "root_cause")!,
    active.routingRules,
    {}
  );
  const allRoot = coreSteps.find((s) => s.slug === "root_cause")!.catalog?.options.length ?? 0;
  if (rootOpts.length >= allRoot) {
    throw new Error("Root cause filter should hide stale catalog options");
  }
  console.log(`root_cause filtered ${rootOpts.length} of ${allRoot} catalog options`);

  console.log("OK — agent workflow dropdown filter validation passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
