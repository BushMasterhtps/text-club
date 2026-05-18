/** Manager-facing operational queue UI config (no raw enum labels in the UI). */

/**
 * Analytics / Reporting (future — not Task Management):
 * - Completed: date range, disposition/fix type, time from agent completion to report drop-off
 * - Archived: date range
 * - City Beauty IT Export: date/import filter, CB vs all-order counts, CSV export for IT bulk action
 * Completed/Archived counts remain on Overview summary; history tables belong in Analytics.
 */

/** Active operational queues shown on the Task Management assignment board. */
export type WodIvcsOperationalQueueKey =
  | "NEEDS_ACTION"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_DROP_OFF"
  | "NEEDS_REVIEW"
  | "IT_REVIEW";

export const OPERATIONAL_QUEUE_KEYS: WodIvcsOperationalQueueKey[] = [
  "NEEDS_ACTION",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_DROP_OFF",
  "NEEDS_REVIEW",
  "IT_REVIEW",
];

export type WodIvcsQueueKey =
  | "NEEDS_ACTION"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_DROP_OFF"
  | "NEEDS_REVIEW"
  | "IT_REVIEW"
  | "COMPLETED"
  | "ARCHIVED";

export type WodIvcsOrderListItem = {
  id: string;
  documentNumber: string;
  operationalQueue: string;
  operationalStatus: string;
  assignedToId: string | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  customerName: string | null;
  customerEmail: string | null;
  presenceNetSuite: string;
  presenceAging: string;
  isCityBeauty: boolean;
  agingIsFivePlus: boolean;
  netSuiteDaysOld: number | null;
  updatedAt: string;
  createdAt: string;
};

export type OrderMutationSkip = {
  orderId: string;
  code: string;
  reason: string;
};

export type AssignableAgent = {
  id: string;
  name: string | null;
  email: string;
  isLive?: boolean;
};

export const QUEUE_CARD_CONFIG: Array<{
  key: WodIvcsQueueKey;
  label: string;
  description: string;
  cardClass: string;
  ringClass: string;
  assignable: boolean;
  readOnly: boolean;
}> = [
  {
    key: "NEEDS_ACTION",
    label: "Needs Action",
    description: "Ready to assign",
    cardClass: "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50",
    ringClass: "ring-amber-400",
    assignable: true,
    readOnly: false,
  },
  {
    key: "ASSIGNED",
    label: "Assigned",
    description: "Waiting for agent to start",
    cardClass: "bg-sky-500/10 border-sky-500/30 hover:border-sky-500/50",
    ringClass: "ring-sky-400",
    assignable: true,
    readOnly: false,
  },
  {
    key: "IN_PROGRESS",
    label: "In Progress",
    description: "Agent is working",
    cardClass: "bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50",
    ringClass: "ring-blue-400",
    assignable: false,
    readOnly: false,
  },
  {
    key: "AWAITING_DROP_OFF",
    label: "Awaiting Drop-Off",
    description: "Waiting to leave reports",
    cardClass: "bg-violet-500/10 border-violet-500/30 hover:border-violet-500/50",
    ringClass: "ring-violet-400",
    assignable: false,
    readOnly: false,
  },
  {
    key: "NEEDS_REVIEW",
    label: "Needs Review",
    description: "Manager or escalation review",
    cardClass: "bg-orange-500/10 border-orange-500/30 hover:border-orange-500/50",
    ringClass: "ring-orange-400",
    assignable: false,
    readOnly: false,
  },
  {
    key: "IT_REVIEW",
    label: "IT Review",
    description: "IT escalation queue",
    cardClass: "bg-fuchsia-500/10 border-fuchsia-500/30 hover:border-fuchsia-500/50",
    ringClass: "ring-fuchsia-400",
    assignable: false,
    readOnly: false,
  },
  {
    key: "COMPLETED",
    label: "Completed",
    description: "Finished orders",
    cardClass: "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50",
    ringClass: "ring-emerald-400",
    assignable: false,
    readOnly: true,
  },
  {
    key: "ARCHIVED",
    label: "Archived",
    description: "Non-actionable / archived",
    cardClass: "bg-white/5 border-white/15 hover:border-white/25",
    ringClass: "ring-white/40",
    assignable: false,
    readOnly: true,
  },
];

/** Task Management queue board — active work only (excludes Completed/Archived). */
export const OPERATIONAL_QUEUE_CARD_CONFIG = QUEUE_CARD_CONFIG.filter((c) =>
  (OPERATIONAL_QUEUE_KEYS as string[]).includes(c.key)
);

export const MOVE_QUEUE_OPTIONS: Array<{ value: WodIvcsQueueKey; label: string }> = [
  { value: "NEEDS_ACTION", label: "Needs Action" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "IT_REVIEW", label: "IT Review" },
  { value: "AWAITING_DROP_OFF", label: "Awaiting Drop-Off" },
  { value: "ASSIGNED", label: "Assigned (requires agent)" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

export function queueConfig(key: WodIvcsQueueKey) {
  return QUEUE_CARD_CONFIG.find((c) => c.key === key)!;
}

export function queueLabelForKey(key: string): string {
  return QUEUE_CARD_CONFIG.find((c) => c.key === key)?.label ?? key.replace(/_/g, " ");
}

export function isOperationalQueueKey(key: string): key is WodIvcsOperationalQueueKey {
  return (OPERATIONAL_QUEUE_KEYS as string[]).includes(key);
}

export function formatRelativeTime(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}

export function ageLabel(order: WodIvcsOrderListItem) {
  if (order.agingIsFivePlus) return "5+ days";
  if (order.netSuiteDaysOld != null) {
    if (order.netSuiteDaysOld >= 5) return `${order.netSuiteDaysOld}d`;
    if (order.netSuiteDaysOld >= 3) return `${order.netSuiteDaysOld}d`;
    if (order.netSuiteDaysOld >= 1) return `${order.netSuiteDaysOld}d`;
  }
  return "—";
}

export function ageTone(order: WodIvcsOrderListItem) {
  if (order.agingIsFivePlus || (order.netSuiteDaysOld ?? 0) >= 5) {
    return "text-red-400 bg-red-500/15 border-red-500/25";
  }
  if ((order.netSuiteDaysOld ?? 0) >= 3) {
    return "text-orange-300 bg-orange-500/15 border-orange-500/25";
  }
  if ((order.netSuiteDaysOld ?? 0) >= 1) {
    return "text-amber-300 bg-amber-500/15 border-amber-500/25";
  }
  return "text-white/50 bg-white/5 border-white/10";
}
