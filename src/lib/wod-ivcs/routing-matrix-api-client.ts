/**
 * Client for WOD/IVCS routing matrix & workflow manager APIs.
 */

import type { RoutingRuleInput } from "./routing-matrix-service";

export class RoutingMatrixApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "RoutingMatrixApiError";
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    code?: string;
  };
  if (!res.ok || data.success === false) {
    throw new RoutingMatrixApiError(
      data.error || `Request failed (${res.status})`,
      data.code,
      res.status
    );
  }
  return data as T;
}

const BASE = "/api/manager/wod-ivcs/v2/workflow";

// —— Types ——

export type WorkflowDefinitionSummary = {
  id: string;
  slug: string;
  displayName: string;
  isActive: boolean;
};

export type WorkflowVersionSummary = {
  id: string;
  version: number;
  status: string;
  notes: string | null;
  publishedAt: string | null;
  compiledAt: string | null;
  routingMatrixHash: string | null;
  createdAt: string;
};

export type CatalogOptionRef = {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
};

export type RoutingSubDispositionOption = {
  id: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
};

export type RoutingRule = {
  id: string;
  displayOrder: number;
  isActive: boolean;
  label: string | null;
  rootCauseOptionId: string | null;
  cashSaleExistsOptionId: string | null;
  merchantOptionId: string | null;
  fixTypeOptionId: string | null;
  subDispositionRequired: boolean;
  subDispositionQuestion: string | null;
  requiresRetriggerConfirmation: boolean;
  requiresItEscalation: boolean;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  itEscalationPrompt: string | null;
  targetQueue: string;
  operationalCompletionMode: string;
  productivityCreditMode: string;
  dropOffBehavior: string;
  metadataJson?: unknown;
  rootCauseOption: CatalogOptionRef | null;
  cashSaleExistsOption: CatalogOptionRef | null;
  merchantOption: CatalogOptionRef | null;
  fixTypeOption: CatalogOptionRef | null;
  subDispositionOptions: RoutingSubDispositionOption[];
};

export type DispositionGroupSummary = {
  id: string;
  groupKey: string;
  displayName: string;
  catalogType: string;
  displayOrder: number;
  isActive: boolean;
  optionCount: number;
};

export type DispositionGroupDetail = DispositionGroupSummary & {
  options: CatalogOptionRef[];
};

export type RoutingMatrixValidation = {
  versionId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type PreviewAgentFlowResult = {
  preview: {
    routingRule: RoutingRule;
    answers: Record<string, unknown>;
    validation: RoutingMatrixValidation;
    dryCompile: { stepCount: number; outcomeRuleCount: number };
    simulation: {
      validation?: { valid: boolean; errors: string[] };
      visibleSteps?: string[];
      matchedRule?: {
        name: string;
        targetQueue: string;
        effectsJson: Record<string, unknown> | null;
        requiresRetriggerConfirmation?: boolean;
        requiresItEscalation?: boolean;
        requiresReplacementOrderNumber?: boolean;
        requiresProcessedReship?: boolean;
      };
    };
    dropOffBehavior: string;
    versionStatus?: string;
  };
};

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
};

// —— Workflow definition & versions ——

export async function fetchWorkflowDefinition() {
  const data = await parseResponse<{
    definition: WorkflowDefinitionSummary;
    publishedVersion: WorkflowVersionSummary | null;
  }>(await fetch(`${BASE}/definition`));
  return data;
}

export async function fetchWorkflowVersions() {
  const data = await parseResponse<{ versions: WorkflowVersionSummary[] }>(
    await fetch(`${BASE}/versions`)
  );
  return data.versions;
}

export type DraftCloneSummary = {
  sourceVersionId: string | null;
  sourceRoutingRuleCount: number;
  clonedRoutingRuleCount: number;
};

export async function createDraftVersion(notes?: string) {
  const data = await parseResponse<{
    version: WorkflowVersionSummary;
    cloneSummary?: DraftCloneSummary;
  }>(
    await fetch(`${BASE}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cloneFromPublished: true,
        notes: notes ?? "Routing matrix draft",
      }),
    })
  );
  return { version: data.version, cloneSummary: data.cloneSummary };
}

export async function discardDraftVersion(versionId: string) {
  return parseResponse<{ discardedVersionId: string; discardedVersionNumber: number }>(
    await fetch(`${BASE}/versions/${versionId}/draft`, { method: "DELETE" })
  );
}

export async function publishWorkflowVersion(versionId: string) {
  const data = await parseResponse<{ version: WorkflowVersionSummary }>(
    await fetch(`${BASE}/versions/${versionId}/publish`, { method: "POST" })
  );
  return data;
}

// —— Disposition groups ——

export async function fetchDispositionGroups() {
  const data = await parseResponse<{ groups: DispositionGroupSummary[] }>(
    await fetch(`${BASE}/disposition-groups`)
  );
  return data.groups;
}

export async function fetchDispositionGroup(groupKey: string) {
  const data = await parseResponse<{ group: DispositionGroupDetail }>(
    await fetch(`${BASE}/disposition-groups/${encodeURIComponent(groupKey)}`)
  );
  return data.group;
}

export async function addDispositionOption(
  catalogType: string,
  input: { label: string; value: string; sortOrder?: number; isActive?: boolean }
) {
  const data = await parseResponse<{ option: CatalogOptionRef }>(
    await fetch(`${BASE}/catalogs/${catalogType}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.option;
}

export async function updateDispositionOption(
  optionId: string,
  input: { label?: string; isActive?: boolean; sortOrder?: number }
) {
  const data = await parseResponse<{ option: CatalogOptionRef }>(
    await fetch(`${BASE}/catalogs/options/${optionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.option;
}

// —— Routing rules ——

export async function fetchRoutingRules(versionId: string) {
  const data = await parseResponse<{
    version: WorkflowVersionSummary;
    rules: RoutingRule[];
  }>(await fetch(`${BASE}/versions/${versionId}/routing-rules`));
  return data;
}

export async function createRoutingRule(versionId: string, input: RoutingRuleInput) {
  const data = await parseResponse<{ rule: RoutingRule }>(
    await fetch(`${BASE}/versions/${versionId}/routing-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.rule;
}

export async function updateRoutingRule(ruleId: string, input: RoutingRuleInput) {
  const data = await parseResponse<{ rule: RoutingRule }>(
    await fetch(`${BASE}/routing-rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.rule;
}

export async function deactivateRoutingRule(ruleId: string) {
  const data = await parseResponse<{ rule: RoutingRule }>(
    await fetch(`${BASE}/routing-rules/${ruleId}`, { method: "DELETE" })
  );
  return data.rule;
}

export async function duplicateRoutingRule(ruleId: string) {
  const data = await parseResponse<{ rule: RoutingRule }>(
    await fetch(`${BASE}/routing-rules/${ruleId}/duplicate`, { method: "POST" })
  );
  return data.rule;
}

export async function moveRoutingRule(ruleId: string, direction: "up" | "down") {
  const data = await parseResponse<{
    version: WorkflowVersionSummary;
    rules: RoutingRule[];
  }>(
    await fetch(`${BASE}/routing-rules/${ruleId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    })
  );
  return data;
}

export async function validateRoutingMatrix(versionId: string) {
  const data = await parseResponse<{ validation: RoutingMatrixValidation }>(
    await fetch(`${BASE}/versions/${versionId}/routing-rules/validate`, {
      method: "POST",
    })
  );
  return data.validation;
}

export async function compileRoutingMatrix(versionId: string) {
  const data = await parseResponse<{
    validation: RoutingMatrixValidation;
    compiled: { stepCount: number; outcomeRuleCount: number };
    routingMatrixHash: string;
  }>(
    await fetch(`${BASE}/versions/${versionId}/routing-rules/compile`, {
      method: "POST",
    })
  );
  return data;
}

export async function previewAgentFlow(
  versionId: string,
  input: { routingRuleId?: string; answers?: Record<string, unknown> }
) {
  const data = await parseResponse<PreviewAgentFlowResult>(
    await fetch(`${BASE}/versions/${versionId}/preview-agent-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.preview;
}

export async function fetchAuditLog(take = 50) {
  const data = await parseResponse<{ total: number; entries: AuditLogEntry[] }>(
    await fetch(`${BASE}/audit-log?take=${take}`)
  );
  return data;
}
