/**
 * Pure helpers for Holds Daily Activity (TaskWorkSession aggregates).
 * Used by GET /api/holds/daily-breakdown — no DB access here.
 */

export type HoldsActivitySession = {
  id: string;
  taskId: string;
  startedAt: Date | null;
  endedAt: Date;
  durationSec: number | null;
  fromQueue: string | null;
  toQueue: string | null;
  disposition: string | null;
  outcomeType: string;
  isFinalResolution: boolean;
  agentId: string;
  agentName: string | null;
  agentEmail: string | null;
  orderNumber: string | null;
  customerEmail: string | null;
};

export type SessionSummary = {
  totalSessions: number;
  finalResolutionCount: number;
  handoffCount: number;
  duplicateRoutingCount: number;
  escalationStayCount: number;
  otherCount: number;
  averageHandleTimeSec: number;
};

export type SessionByAgentRow = {
  agentId: string;
  agentName: string;
  agentEmail: string;
  totalSessions: number;
  finalResolutions: number;
  handoffs: number;
  duplicateRouting: number;
  escalationStay: number;
  other: number;
  averageHandleTimeSec: number;
  byFromQueue: Record<string, number>;
  byOutcomeType: Record<string, number>;
  topFromQueue: string | null;
};

export type SessionByQueueMovementRow = {
  fromQueue: string;
  toQueue: string;
  count: number;
  averageHandleTimeSec: number;
};

export type SessionByDispositionRow = {
  disposition: string;
  count: number;
  finalResolutionCount: number;
  handoffCount: number;
  duplicateRoutingCount: number;
  escalationStayCount: number;
  averageHandleTimeSec: number;
};

export type SessionDetailRow = {
  workSessionId: string;
  taskId: string;
  orderNumber: string | null;
  customerEmail: string | null;
  agentId: string;
  agentName: string;
  agentEmail: string;
  startedAt: string | null;
  endedAt: string;
  durationSec: number | null;
  fromQueue: string | null;
  toQueue: string | null;
  disposition: string | null;
  outcomeType: string;
  isFinalResolution: boolean;
};

const KNOWN_OUTCOMES = new Set([
  "QUEUE_HANDOFF",
  "DUPLICATE_ROUTING",
  "ESCALATION_STAY",
  "FINAL_RESOLUTION",
  "OTHER",
]);

function avgDuration(sessions: HoldsActivitySession[]): number {
  const withDur = sessions.filter((s) => typeof s.durationSec === "number" && s.durationSec >= 0);
  if (withDur.length === 0) return 0;
  const sum = withDur.reduce((a, s) => a + (s.durationSec as number), 0);
  return Math.round(sum / withDur.length);
}

export function aggregateSessionSummary(sessions: HoldsActivitySession[]): SessionSummary {
  const totalSessions = sessions.length;
  let finalResolutionCount = 0;
  let handoffCount = 0;
  let duplicateRoutingCount = 0;
  let escalationStayCount = 0;
  let otherCount = 0;

  for (const s of sessions) {
    if (s.isFinalResolution) finalResolutionCount += 1;
    if (s.outcomeType === "QUEUE_HANDOFF") handoffCount += 1;
    else if (s.outcomeType === "DUPLICATE_ROUTING") duplicateRoutingCount += 1;
    else if (s.outcomeType === "ESCALATION_STAY") escalationStayCount += 1;
    else if (s.outcomeType === "FINAL_RESOLUTION") {
      /* final KPI uses isFinalResolution; not counted as handoff/other */
    } else if (s.outcomeType === "OTHER" || !KNOWN_OUTCOMES.has(s.outcomeType)) {
      otherCount += 1;
    }
  }

  return {
    totalSessions,
    finalResolutionCount,
    handoffCount,
    duplicateRoutingCount,
    escalationStayCount,
    otherCount,
    averageHandleTimeSec: avgDuration(sessions),
  };
}

function topKeyFromCounts(counts: Record<string, number>): string | null {
  const keys = Object.keys(counts);
  if (keys.length === 0) return null;
  let best = keys[0];
  let bestN = counts[best] ?? 0;
  for (const k of keys) {
    const n = counts[k] ?? 0;
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

export function aggregateSessionsByAgent(sessions: HoldsActivitySession[]): SessionByAgentRow[] {
  const byAgent = new Map<string, HoldsActivitySession[]>();
  for (const s of sessions) {
    const list = byAgent.get(s.agentId) ?? [];
    list.push(s);
    byAgent.set(s.agentId, list);
  }

  const rows: SessionByAgentRow[] = [];
  for (const [agentId, list] of byAgent) {
    const byFromQueue: Record<string, number> = {};
    const byOutcomeType: Record<string, number> = {};
    for (const s of list) {
      const fq = s.fromQueue?.trim() || "(unknown)";
      byFromQueue[fq] = (byFromQueue[fq] ?? 0) + 1;
      const ot = s.outcomeType || "OTHER";
      byOutcomeType[ot] = (byOutcomeType[ot] ?? 0) + 1;
    }
    const top = topKeyFromCounts(byFromQueue);
    const sum = aggregateSessionSummary(list);
    const first = list[0];
    rows.push({
      agentId,
      agentName: first?.agentName ?? "Unknown",
      agentEmail: first?.agentEmail ?? "",
      totalSessions: list.length,
      finalResolutions: sum.finalResolutionCount,
      handoffs: sum.handoffCount,
      duplicateRouting: sum.duplicateRoutingCount,
      escalationStay: sum.escalationStayCount,
      other: sum.otherCount,
      averageHandleTimeSec: sum.averageHandleTimeSec,
      byFromQueue,
      byOutcomeType,
      topFromQueue: top,
    });
  }
  rows.sort((a, b) => b.totalSessions - a.totalSessions);
  return rows;
}

export function aggregateSessionsByQueueMovement(
  sessions: HoldsActivitySession[]
): SessionByQueueMovementRow[] {
  const key = (s: HoldsActivitySession) =>
    `${s.fromQueue?.trim() || "(unknown)"}|||${s.toQueue?.trim() || "(unknown)"}`;
  const groups = new Map<string, HoldsActivitySession[]>();
  for (const s of sessions) {
    const k = key(s);
    const g = groups.get(k) ?? [];
    g.push(s);
    groups.set(k, g);
  }
  const rows: SessionByQueueMovementRow[] = [];
  for (const [, list] of groups) {
    const [fromQueue, toQueue] = (() => {
      const s0 = list[0];
      return [s0.fromQueue?.trim() || "(unknown)", s0.toQueue?.trim() || "(unknown)"];
    })();
    rows.push({
      fromQueue,
      toQueue,
      count: list.length,
      averageHandleTimeSec: avgDuration(list),
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

export function aggregateSessionsByDisposition(
  sessions: HoldsActivitySession[]
): SessionByDispositionRow[] {
  const groups = new Map<string, HoldsActivitySession[]>();
  for (const s of sessions) {
    const d = (s.disposition?.trim() || "(none)") as string;
    const g = groups.get(d) ?? [];
    g.push(s);
    groups.set(d, g);
  }
  const rows: SessionByDispositionRow[] = [];
  for (const [disposition, list] of groups) {
    let finalResolutionCount = 0;
    let handoffCount = 0;
    let duplicateRoutingCount = 0;
    let escalationStayCount = 0;
    for (const s of list) {
      if (s.isFinalResolution) finalResolutionCount += 1;
      if (s.outcomeType === "QUEUE_HANDOFF") handoffCount += 1;
      if (s.outcomeType === "DUPLICATE_ROUTING") duplicateRoutingCount += 1;
      if (s.outcomeType === "ESCALATION_STAY") escalationStayCount += 1;
    }
    rows.push({
      disposition,
      count: list.length,
      finalResolutionCount,
      handoffCount,
      duplicateRoutingCount,
      escalationStayCount,
      averageHandleTimeSec: avgDuration(list),
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

export function mapSessionDetails(sessions: HoldsActivitySession[]): SessionDetailRow[] {
  return sessions
    .slice()
    .sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime())
    .map((s) => ({
      workSessionId: s.id,
      taskId: s.taskId,
      orderNumber: s.orderNumber,
      customerEmail: s.customerEmail,
      agentId: s.agentId,
      agentName: s.agentName ?? "Unknown",
      agentEmail: s.agentEmail ?? "",
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      endedAt: s.endedAt.toISOString(),
      durationSec: s.durationSec,
      fromQueue: s.fromQueue,
      toQueue: s.toQueue,
      disposition: s.disposition,
      outcomeType: s.outcomeType,
      isFinalResolution: s.isFinalResolution,
    }));
}

export function filterSessionsForDay(
  sessions: HoldsActivitySession[],
  dayStart: Date,
  dayEnd: Date
): HoldsActivitySession[] {
  return sessions.filter((s) => {
    const t = s.endedAt.getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });
}
