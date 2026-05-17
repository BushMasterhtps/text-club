/** Manager-facing labels — no internal technical terms in UI copy. */

export const operationalQueueLabel: Record<string, string> = {
  NEEDS_ACTION: "Needs action",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  AWAITING_DROP_OFF: "Awaiting drop-off",
  NEEDS_REVIEW: "Needs review",
  IT_REVIEW: "IT review",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const dropOffBehaviorLabel: Record<string, string> = {
  NO_AUTOMATIC_CHANGE: "No automatic change",
  MARK_COMPLETED: "Mark completed",
  NEEDS_REVIEW: "Send to needs review",
  ARCHIVE_ORDER: "Archive order",
  REMAIN_AWAITING_DROP_OFF: "Remain awaiting drop-off",
};

export const operationalCompletionModeLabel: Record<string, string> = {
  REMAIN_OPEN: "Remain open",
  MARK_OPERATIONALLY_COMPLETE: "Mark operationally complete",
  ARCHIVE_ORDER: "Archive order",
};

export const productivityCreditModeLabel: Record<string, string> = {
  NONE: "None",
  AWARD_ON_OPERATIONAL_COMPLETE: "Award when operationally complete",
  AWARD_ON_DROP_OFF: "Award when dropped from reports",
};

export const versionStatusLabel: Record<string, string> = {
  DRAFT: "Draft (editing)",
  PUBLISHED: "Live",
  ARCHIVED: "Archived",
};

export const auditActionLabel: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  RESTORED_DRAFT: "Restored draft",
};

/** Maps audit entity types to plain language (never show raw entityType in primary UI). */
export const auditEntityTypeLabel: Record<string, string> = {
  ROUTING_RULE: "Routing rule",
  ROUTING_MATRIX: "Routing matrix",
  WORKFLOW_VERSION: "Workflow version",
  CATALOG_OPTION: "Disposition option",
  WORKFLOW_STEPS: "Workflow steps",
  WORKFLOW_OUTCOME_RULES: "Outcome rules",
};

export const dispositionGroupTitle: Record<string, string> = {
  root_cause: "Root Cause",
  cash_sale_exists: "Cash Sale Exists?",
  merchant: "Merchant",
  fix_type: "Fix Type",
};

export function labelFor(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

/** Auto-generate internal option key from display name (not shown to managers). */
/** Agent flow step labels (never show raw step keys to managers). */
export const agentFlowStepLabel: Record<string, string> = {
  root_cause: "Root Cause",
  cash_sale_exists: "Cash Sale Exists?",
  merchant: "Merchant",
  fix_type: "Fix Type",
  sub_disposition: "Follow-up answer",
  retrigger_confirmation: "Re-trigger cash sale confirmation",
  replacement_order_number: "Replacement order number",
  processed_reship_confirmation: "Processed reship confirmation",
  it_escalation_note: "IT escalation note",
};

export function nameToOptionKey(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || `option_${Date.now()}`;
}
