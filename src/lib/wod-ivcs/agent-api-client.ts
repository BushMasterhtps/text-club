/**
 * Client for WOD/IVCS v2 agent APIs (/api/agent/wod-ivcs/v2/*).
 */

import { parseFetchJsonSafely } from "@/lib/safe-fetch-json";
import type { AgentActiveWorkflow } from "./agent-workflow-form-utils";
import type { FollowUpQuestion } from "./follow-up-questions";

export class AgentWodIvcsApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "AgentWodIvcsApiError";
  }
}

async function parseAgentResponse<T extends Record<string, unknown>>(
  res: Response
): Promise<T> {
  const parsed = await parseFetchJsonSafely(res);
  const data = (parsed.data ?? {}) as T & { success?: boolean; error?: string; code?: string };
  if (!res.ok || data.success === false) {
    throw new AgentWodIvcsApiError(
      data.error || `Request failed (${res.status})`,
      data.code,
      res.status
    );
  }
  return data;
}

export type AgentWodIvcsOrderListItem = {
  id: string;
  documentNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  operationalQueue: "ASSIGNED" | "IN_PROGRESS" | string;
  operationalStatus: string;
  presenceNetSuite: string;
  presenceAging: string;
  netSuiteDaysOld: number | null;
  agingIsFivePlus: boolean;
  isCityBeauty: boolean;
  workStartedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AgentWodIvcsOrderDetail = AgentWodIvcsOrderListItem & {
  assignedToId: string | null;
  activeWorkflowVersionId: string | null;
  workStartedById: string | null;
  itemSummaryJson: unknown;
  latestNetSuiteSnapshotJson: unknown;
  latestAgingSnapshotJson: unknown;
  awaitingDropOffStartedAt: string | null;
  awaitingDropOffDeadlineAt: string | null;
  replacementOrderNumber: string | null;
  processedReship: boolean | null;
};

export type AgentWodIvcsLatestSubmission = {
  id: string;
  submittedAt: string;
  targetQueue: string;
  matchedOutcomeRuleName: string | null;
  matchedOutcomeRulePriority: number | null;
  matchedRoutingRuleId: string | null;
  workflowVersionId: string;
};

const BASE = "/api/agent/wod-ivcs/v2";

export async function fetchAgentWodIvcsOrders(params?: {
  queue?: "ASSIGNED" | "IN_PROGRESS";
  q?: string;
  take?: number;
  skip?: number;
}): Promise<{ total: number; orders: AgentWodIvcsOrderListItem[] }> {
  const search = new URLSearchParams();
  if (params?.queue) search.set("queue", params.queue);
  if (params?.q) search.set("q", params.q);
  if (params?.take != null) search.set("take", String(params.take));
  if (params?.skip != null) search.set("skip", String(params.skip));
  const qs = search.toString();
  const res = await fetch(`${BASE}/orders${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  const data = await parseAgentResponse<{
    total: number;
    orders: AgentWodIvcsOrderListItem[];
  }>(res);
  return { total: data.total, orders: data.orders };
}

export async function fetchAgentWodIvcsOrder(
  orderId: string
): Promise<{ order: AgentWodIvcsOrderDetail; latestSubmission: AgentWodIvcsLatestSubmission | null }> {
  const res = await fetch(`${BASE}/orders/${orderId}`, { cache: "no-store" });
  return parseAgentResponse(res);
}

export async function startAgentWodIvcsOrder(orderId: string): Promise<{
  order: AgentWodIvcsOrderDetail;
  workflowVersionId: string | null;
  idempotent: boolean;
}> {
  const res = await fetch(`${BASE}/orders/${orderId}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  return parseAgentResponse(res);
}

export type AgentWorkflowPreviewResult = {
  workflowVersionId: string;
  validation: { valid: boolean; errors: string[] };
  visibleSteps: string[];
  matchedRoutingRule: {
    id: string;
    label: string | null;
    targetQueue: string;
    requiresRetriggerConfirmation: boolean;
    requiresItEscalation: boolean;
    requiresReplacementOrderNumber: boolean;
    requiresProcessedReship: boolean;
    followUpQuestions: FollowUpQuestion[];
  } | null;
  matchedOutcome: {
    name: string;
    priority: number;
    matchedBy: string;
    targetQueue: string;
    operationalCompletionMode: string;
    requiresReplacementOrderNumber: boolean;
    requiresProcessedReship: boolean;
    requiresItEscalation: boolean;
    requiresRetriggerConfirmation: boolean;
  };
  predictedTargetQueue: string;
  requiredConfirmations: {
    requiresRetriggerConfirmation: boolean;
    requiresItEscalation: boolean;
    requiresReplacementOrderNumber: boolean;
    requiresProcessedReship: boolean;
  };
};

export async function fetchAgentWodIvcsActiveWorkflow(): Promise<{
  active: AgentActiveWorkflow;
}> {
  const res = await fetch(`${BASE}/workflow/active`, { cache: "no-store" });
  const data = await parseAgentResponse<{ active: AgentActiveWorkflow }>(res);
  return { active: data.active };
}

export async function previewAgentWodIvcsWorkflow(
  orderId: string,
  answers: Record<string, unknown>
): Promise<AgentWorkflowPreviewResult> {
  const res = await fetch(`${BASE}/orders/${orderId}/workflow/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  return parseAgentResponse<AgentWorkflowPreviewResult>(res);
}
