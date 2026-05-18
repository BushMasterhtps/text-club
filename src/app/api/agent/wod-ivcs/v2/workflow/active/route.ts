export const runtime = "nodejs";

import { getFollowUpQuestionsForRule } from "@/lib/wod-ivcs/follow-up-questions";
import { getRoutingRules } from "@/lib/wod-ivcs/routing-matrix-service";
import { getActiveWorkflowGraph } from "@/lib/wod-ivcs/workflow-config-service";
import { handleAgentWodApi, prisma } from "../../_lib/handle-agent-wod-api";

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

export async function GET(request: Request) {
  return handleAgentWodApi(request as import("next/server").NextRequest, async () => {
    const active = await getActiveWorkflowGraph(prisma);
    const versionId = active.version.id;

    const { rules } = await getRoutingRules(prisma, versionId);
    const routingRules = rules
      .filter((r) => r.isActive)
      .map((r) => ({
        id: r.id,
        label: r.label,
        displayOrder: r.displayOrder,
        targetQueue: r.targetQueue,
        operationalCompletionMode: r.operationalCompletionMode,
        dropOffBehavior: r.dropOffBehavior,
        requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
        requiresItEscalation: r.requiresItEscalation,
        requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
        requiresProcessedReship: r.requiresProcessedReship,
        itEscalationPrompt: r.itEscalationPrompt,
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
        followUpQuestions: getFollowUpQuestionsForRule({
          metadataJson: r.metadataJson,
          subDispositionRequired: r.subDispositionRequired,
          subDispositionQuestion: r.subDispositionQuestion,
          subDispositionOptions: r.subDispositionOptions,
        }),
      }));

    return {
      active: {
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
          groupKey: c.groupKey,
          displayOrder: c.displayOrder,
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
        outcomeRules: active.version.outcomeRules
          .filter((r) => r.isActive)
          .map((r) => ({
            priority: r.priority,
            name: r.name,
            targetQueue: r.targetQueue,
            operationalCompletionMode: r.operationalCompletionMode,
            requiresReplacementOrderNumber: r.requiresReplacementOrderNumber,
            requiresProcessedReship: r.requiresProcessedReship,
            requiresItEscalation: r.requiresItEscalation,
            requiresRetriggerConfirmation: r.requiresRetriggerConfirmation,
          })),
        routingRules,
      },
    };
  });
}
