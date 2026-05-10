"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/app/_components/Card";

const PAGE_SIZE = 50;
const PACIFIC_TZ = "America/Los_Angeles";

/** First date when per-action completed Holds tracking is fully available (Pacific). */
const HOLDS_DETAILED_ACTIONS_SINCE = "2026-05-09";

function formatYmdPacificFromDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((x) => x.type === "year")?.value;
  const m = parts.find((x) => x.type === "month")?.value;
  const day = parts.find((x) => x.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

function escapeCsvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: Record<string, string | number | boolean | null | undefined>[]) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

type SessionSummary = {
  totalSessions: number;
  finalResolutionCount: number;
  handoffCount: number;
  duplicateRoutingCount: number;
  escalationStayCount: number;
  otherCount: number;
  averageHandleTimeSec: number;
};

type SessionByAgentRow = {
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

type SessionByQueueMovementRow = {
  fromQueue: string;
  toQueue: string;
  count: number;
  averageHandleTimeSec: number;
};

type SessionByDispositionRow = {
  disposition: string;
  count: number;
  finalResolutionCount: number;
  handoffCount: number;
  duplicateRoutingCount: number;
  escalationStayCount: number;
  averageHandleTimeSec: number;
};

type SessionDetailRow = {
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

type LegacyActivitySummary = {
  legacyCompletedTaskCount: number;
  legacyNewTaskCount: number;
  legacyRolloverTaskCount: number;
  legacyPendingAtEodCount: number;
  hasLegacyActivity: boolean;
  hasWorkSessionActivity: boolean;
  dataCoverageNote: string;
};

type TaskRow = {
  id: string;
  orderNumber?: string | null;
  customerEmail?: string | null;
  agentName?: string;
  createdAt?: string;
  endTime?: string | null;
  status?: string;
  disposition?: string | null;
  holdsStatus?: string | null;
};

type RolloverTaskRow = TaskRow & { queueAtEndOfDay?: string; queueHistory?: unknown };

interface DailyBreakdownRow {
  date: string;
  dayStart: string;
  dayEnd: string;
  queueCountsAtEndOfDay: Record<string, number>;
  totalPendingAtEndOfDay: number;
  newTasksCount: number;
  completedTasksCount: number;
  rolloverTasksCount: number;
  sessionSummary: SessionSummary;
  sessionsByAgent: SessionByAgentRow[];
  sessionsByQueueMovement: SessionByQueueMovementRow[];
  sessionsByDisposition: SessionByDispositionRow[];
  legacyActivitySummary?: LegacyActivitySummary;
  sessionDetails?: SessionDetailRow[];
  newTasks?: TaskRow[];
  completedTasks?: TaskRow[];
  rolloverTasks?: RolloverTaskRow[];
  tasksInQueueAtEndOfDay?: Record<string, TaskRow[]>;
}

interface DailyBreakdownApiData {
  breakdowns: DailyBreakdownRow[];
  rangeSessionSummary: SessionSummary;
  rangeSessionsByAgent: SessionByAgentRow[];
  rangeSessionsByQueueMovement: SessionByQueueMovementRow[];
  rangeSessionsByDisposition: SessionByDispositionRow[];
  rangeLegacyActivitySummary?: LegacyActivitySummary;
  summary?: {
    legacyTaskRowMetricsNote?: string;
    pacificDateRange?: { start: string; end: string };
  };
}

function formatDurationSec(sec: number): string {
  if (sec <= 0 || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 120) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  if (m >= 1) return `${m}m ${s}s`;
  return `${s}s`;
}

function queueMixLabel(row: SessionByAgentRow): string {
  if (!row.topFromQueue || row.totalSessions === 0) return "—";
  const n = row.byFromQueue[row.topFromQueue] ?? 0;
  const pct = Math.round((n / row.totalSessions) * 100);
  return `${row.topFromQueue} (${pct}%)`;
}

type ModalTab =
  | "summary"
  | "sessions"
  | "newTasks"
  | "legacyCompleted"
  | "queueSnapshot"
  | "rollovers";

function PaginationFooter(props: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { page, totalPages, totalItems, onPrev, onNext } = props;
  const start = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalItems);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-white/60">
      <span>
        Showing {start}-{end} of {totalItems} · Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="px-3 py-1 rounded bg-white/10 disabled:opacity-40 text-white"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="px-3 py-1 rounded bg-white/10 disabled:opacity-40 text-white"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function DailyBreakdown() {
  const [payload, setPayload] = useState<DailyBreakdownApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDayDetails, setSelectedDayDetails] = useState<DailyBreakdownRow | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>("summary");
  const [modalPageByTab, setModalPageByTab] = useState<Record<ModalTab, number>>({
    summary: 1,
    sessions: 1,
    newTasks: 1,
    legacyCompleted: 1,
    queueSnapshot: 1,
    rollovers: 1,
  });

  const [startDate, setStartDate] = useState(() => formatYmdPacificFromDate(new Date()));
  const [endDate, setEndDate] = useState(() => formatYmdPacificFromDate(new Date()));

  const setModalTabResetPage = useCallback((t: ModalTab) => {
    setModalTab(t);
    setModalPageByTab((prev) => ({ ...prev, [t]: 1 }));
  }, []);

  const applyBreakdownResponse = useCallback((data: DailyBreakdownApiData) => {
    setPayload(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("startDate", startDate);
        params.append("endDate", endDate);
        params.append("includeTasks", "true");

        const response = await fetch(`/api/holds/daily-breakdown?${params.toString()}`);
        const json = await response.json();

        if (cancelled) return;
        if (json.success && json.data) {
          applyBreakdownResponse(json.data as DailyBreakdownApiData);
        } else {
          console.error("Failed to load daily breakdown:", json);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading daily breakdown:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, applyBreakdownResponse]);

  const loadSpecificDate = async (date: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("date", date);
      params.append("includeTasks", "true");

      const response = await fetch(`/api/holds/daily-breakdown?${params.toString()}`);
      const json = await response.json();

      if (json.success && json.data?.breakdowns?.length > 0) {
        const breakdown =
          (json.data.breakdowns as DailyBreakdownRow[]).find((b) => b.date === date) ?? json.data.breakdowns[0];
        setSelectedDayDetails(breakdown);
        setModalTabResetPage("summary");
        setShowTaskDetails(true);
      }
    } catch (error) {
      console.error("Error loading specific date:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateClick = (e: React.MouseEvent, date: string) => {
    e.preventDefault();
    e.stopPropagation();
    loadSpecificDate(date);
  };

  const formatDate = (dateString: string) => {
    const [y, m, d] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TZ,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d, 20, 0, 0)));
  };

  const breakdowns = payload?.breakdowns ?? [];
  const rangeSummary = payload?.rangeSessionSummary;
  const rangeByAgent = payload?.rangeSessionsByAgent ?? [];
  const rangeByMovement = payload?.rangeSessionsByQueueMovement ?? [];
  const rangeByDisposition = payload?.rangeSessionsByDisposition ?? [];
  const rangeLegacy = payload?.rangeLegacyActivitySummary;

  const allQueues = Array.from(
    new Set(breakdowns.flatMap((b) => Object.keys(b.queueCountsAtEndOfDay ?? {})))
  ).sort();

  const renderSessionSummaryCards = (s: SessionSummary | undefined) => {
    if (!s) return null;
    const showDup = s.duplicateRoutingCount > 0;
    const showEsc = s.escalationStayCount > 0;
    const colClass =
      showDup && showEsc
        ? "md:grid-cols-3 lg:grid-cols-6"
        : showDup || showEsc
          ? "md:grid-cols-3 lg:grid-cols-5"
          : "md:grid-cols-2 lg:grid-cols-4";
    return (
      <div className={`grid grid-cols-2 gap-3 md:gap-4 ${colClass}`}>
        <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-blue-200 mb-1">Completed Actions</h3>
          <p className="text-2xl font-bold text-white">{s.totalSessions}</p>
        </div>
        <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-emerald-200 mb-1">Final Resolutions</h3>
          <p className="text-2xl font-bold text-white">{s.finalResolutionCount}</p>
        </div>
        <div className="p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-amber-200 mb-1">Moved to Another Queue</h3>
          <p className="text-2xl font-bold text-white">{s.handoffCount}</p>
        </div>
        <div className="p-4 bg-violet-900/20 border border-violet-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-violet-200 mb-1">Avg Handle Time</h3>
          <p className="text-2xl font-bold text-white">{formatDurationSec(s.averageHandleTimeSec)}</p>
        </div>
        {showDup && (
          <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-orange-200 mb-1">Duplicate routing</h3>
            <p className="text-2xl font-bold text-white">{s.duplicateRoutingCount}</p>
          </div>
        )}
        {showEsc && (
          <div className="p-4 bg-rose-900/20 border border-rose-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-rose-200 mb-1">Escalation stay</h3>
            <p className="text-2xl font-bold text-white">{s.escalationStayCount}</p>
          </div>
        )}
      </div>
    );
  };

  const renderLegacySummaryCards = (l: LegacyActivitySummary | undefined) => {
    if (!l || !l.hasLegacyActivity) return null;
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div className="p-3 bg-white/5 border border-white/15 rounded-lg">
          <div className="text-xs text-white/55 mb-1">Completed Orders (older tracking)</div>
          <div className="text-xl font-bold text-white">{l.legacyCompletedTaskCount}</div>
        </div>
        <div className="p-3 bg-white/5 border border-white/15 rounded-lg">
          <div className="text-xs text-white/55 mb-1">New Holds Imported</div>
          <div className="text-xl font-bold text-white">{l.legacyNewTaskCount}</div>
        </div>
        <div className="p-3 bg-white/5 border border-white/15 rounded-lg">
          <div className="text-xs text-white/55 mb-1">Open at End of Day</div>
          <div className="text-xl font-bold text-white">{l.legacyPendingAtEodCount}</div>
        </div>
        <div className="p-3 bg-white/5 border border-white/15 rounded-lg">
          <div className="text-xs text-white/55 mb-1">Still in Agent Research at EOD</div>
          <div className="text-xl font-bold text-white">{l.legacyRolloverTaskCount}</div>
        </div>
        <p className="col-span-full text-xs text-white/65 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.03]">
          {l.dataCoverageNote}{" "}
          Detailed action tracking started on {HOLDS_DETAILED_ACTIONS_SINCE}. Older dates may show imported and
          completed-order totals but may not include the same action-level breakdown.
        </p>
      </div>
    );
  };

  const renderAgentTable = (rows: SessionByAgentRow[], key: string) => (
    <div className="overflow-x-auto mb-8">
      <h3 className="text-lg font-semibold text-white mb-3">Agent breakdown</h3>
      <table className="w-full text-sm">
        <thead className="bg-white/5">
          <tr className="text-left text-white/60">
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2 text-right">Completed actions</th>
            <th className="px-3 py-2 text-right">Final Resolutions</th>
            <th className="px-3 py-2 text-right">Moved to Another Queue</th>
            <th className="px-3 py-2 text-right">Duplicates</th>
            <th className="px-3 py-2 text-right">Escalation stay</th>
            <th className="px-3 py-2 text-right">Avg Handle Time</th>
            <th className="px-3 py-2">Top queue / mix</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-white/50">
                No completed actions in this range.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${key}-${row.agentId}`} className="hover:bg-white/5">
                <td className="px-3 py-2 text-white">
                  <div className="font-medium">{row.agentName}</div>
                  <div className="text-xs text-white/45">{row.agentEmail}</div>
                </td>
                <td className="px-3 py-2 text-right text-white font-semibold">{row.totalSessions}</td>
                <td className="px-3 py-2 text-right text-emerald-300">{row.finalResolutions}</td>
                <td className="px-3 py-2 text-right text-amber-300">{row.handoffs}</td>
                <td className="px-3 py-2 text-right text-orange-300">{row.duplicateRouting}</td>
                <td className="px-3 py-2 text-right text-rose-300">{row.escalationStay}</td>
                <td className="px-3 py-2 text-right text-white/90">{formatDurationSec(row.averageHandleTimeSec)}</td>
                <td className="px-3 py-2 text-white/70 text-xs">{queueMixLabel(row)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderQueueMovementTable = (rows: SessionByQueueMovementRow[], key: string) => (
    <div className="overflow-x-auto mb-8">
      <h3 className="text-lg font-semibold text-white mb-3">Queue movement</h3>
      <table className="w-full text-sm">
        <thead className="bg-white/5">
          <tr className="text-left text-white/60">
            <th className="px-3 py-2">From queue</th>
            <th className="px-3 py-2">To queue</th>
            <th className="px-3 py-2 text-right">Count</th>
            <th className="px-3 py-2 text-right">Avg Handle Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-white/50">
                No movements in this range.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${key}-${row.fromQueue}-${row.toQueue}`} className="hover:bg-white/5">
                <td className="px-3 py-2 text-white">{row.fromQueue}</td>
                <td className="px-3 py-2 text-white">{row.toQueue}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{row.count}</td>
                <td className="px-3 py-2 text-right text-white/80">{formatDurationSec(row.averageHandleTimeSec)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderDispositionTable = (rows: SessionByDispositionRow[], key: string) => (
    <div className="overflow-x-auto mb-8">
      <h3 className="text-lg font-semibold text-white mb-3">Disposition breakdown</h3>
      <table className="w-full text-sm">
        <thead className="bg-white/5">
          <tr className="text-left text-white/60">
            <th className="px-3 py-2">Disposition</th>
            <th className="px-3 py-2 text-right">Count</th>
            <th className="px-3 py-2 text-right">Final Resolutions</th>
            <th className="px-3 py-2 text-right">Moved to Another Queue</th>
            <th className="px-3 py-2 text-right">Dup routing</th>
            <th className="px-3 py-2 text-right">Esc. stay</th>
            <th className="px-3 py-2 text-right">Avg Handle Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-white/50">
                No dispositions in this range.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${key}-${row.disposition}`} className="hover:bg-white/5">
                <td className="px-3 py-2 text-white">{row.disposition}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{row.count}</td>
                <td className="px-3 py-2 text-right text-emerald-300">{row.finalResolutionCount}</td>
                <td className="px-3 py-2 text-right text-amber-300">{row.handoffCount}</td>
                <td className="px-3 py-2 text-right text-orange-300">{row.duplicateRoutingCount}</td>
                <td className="px-3 py-2 text-right text-rose-300">{row.escalationStayCount}</td>
                <td className="px-3 py-2 text-right text-white/80">{formatDurationSec(row.averageHandleTimeSec)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const modalTabsAvailable = useMemo(() => {
    if (!selectedDayDetails) return [] as { id: ModalTab; label: string }[];
    const d = selectedDayDetails;
    const tabs: { id: ModalTab; label: string }[] = [{ id: "summary", label: "Summary" }];
    if ((d.sessionDetails?.length ?? 0) > 0) tabs.push({ id: "sessions", label: "Completed Actions" });
    if ((d.newTasks?.length ?? 0) > 0) tabs.push({ id: "newTasks", label: "New Holds Imported" });
    if ((d.completedTasks?.length ?? 0) > 0) tabs.push({ id: "legacyCompleted", label: "Completed Orders (older tracking)" });
    if (
      Object.keys(d.queueCountsAtEndOfDay ?? {}).length > 0 ||
      (d.tasksInQueueAtEndOfDay && Object.keys(d.tasksInQueueAtEndOfDay).length > 0)
    ) {
      tabs.push({ id: "queueSnapshot", label: "Queue snapshot" });
    }
    if ((d.rolloverTasks?.length ?? 0) > 0)
      tabs.push({ id: "rollovers", label: "Still in Agent Research at EOD" });
    return tabs;
  }, [selectedDayDetails]);

  const resolvedModalTab = useMemo((): ModalTab => {
    const allowed = new Set(modalTabsAvailable.map((t) => t.id));
    return allowed.has(modalTab) ? modalTab : "summary";
  }, [modalTab, modalTabsAvailable]);

  const dayModalPage = modalPageByTab[resolvedModalTab] ?? 1;
  const setDayModalPage = (p: number) =>
    setModalPageByTab((prev) => ({ ...prev, [resolvedModalTab]: p }));

  function renderModalContent() {
    if (!selectedDayDetails) return null;
    const d = selectedDayDetails;
    const leg = d.legacyActivitySummary;
    const mt = resolvedModalTab;

    if (mt === "summary") {
      return (
        <div className="space-y-6">
          {renderSessionSummaryCards(d.sessionSummary)}
          {renderLegacySummaryCards(leg)}
          <div>
            <h4 className="text-sm font-semibold text-white/90 mb-2">End-of-Day Queue Snapshot</h4>
            <p className="text-xs text-white/50 mb-2">
              What was still sitting in each queue at 5 PM ({PACIFIC_TZ.replace("_", " ")}), or current time if today is
              still before that cutoff.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(d.queueCountsAtEndOfDay ?? {}).map(([queue, count]) => (
                <div key={queue} className="p-2 bg-white/5 rounded border border-white/10 text-sm">
                  <div className="text-white/55 text-xs">{queue}</div>
                  <div className="text-white font-bold">{count as number}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (mt === "sessions") {
      const rows = d.sessionDetails ?? [];
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      const page = Math.min(dayModalPage, totalPages);
      const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return (
        <div>
          <div className="flex flex-wrap justify-between gap-2 mb-3">
            <p className="text-xs text-white/55">
              Each row is one completed action. The same order may appear more than once if it was worked multiple times.
            </p>
            <button
              type="button"
              className="text-xs px-3 py-1 rounded bg-emerald-600/80 text-white"
              onClick={() =>
                downloadCsv(
                  `holds-completed-actions-${d.date}.csv`,
                  [
                    "Action ID",
                    "Order ID",
                    "Order Number",
                    "Customer Email",
                    "Agent Name",
                    "Agent Email",
                    "Started At",
                    "Ended At",
                    "Duration Sec",
                    "From Queue",
                    "To Queue",
                    "Disposition",
                    "Action type",
                    "Final resolution",
                  ],
                  rows.map((sess) => ({
                    "Action ID": sess.workSessionId,
                    "Order ID": sess.taskId,
                    "Order Number": sess.orderNumber ?? "",
                    "Customer Email": sess.customerEmail ?? "",
                    "Agent Name": sess.agentName,
                    "Agent Email": sess.agentEmail,
                    "Started At": sess.startedAt ?? "",
                    "Ended At": sess.endedAt,
                    "Duration Sec": sess.durationSec ?? "",
                    "From Queue": sess.fromQueue ?? "",
                    "To Queue": sess.toQueue ?? "",
                    Disposition: sess.disposition ?? "",
                    "Action type": sess.outcomeType,
                    "Final resolution": sess.isFinalResolution ? "true" : "false",
                  }))
                )
              }
            >
              Export CSV
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="text-white/50 text-sm">No completed actions for this day.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-2 py-2 text-left text-white/60">Order #</th>
                      <th className="px-2 py-2 text-left text-white/60">Email</th>
                      <th className="px-2 py-2 text-left text-white/60">Agent</th>
                      <th className="px-2 py-2 text-left text-white/60">Queues</th>
                      <th className="px-2 py-2 text-left text-white/60">Disposition</th>
                      <th className="px-2 py-2 text-left text-white/60">Action type</th>
                      <th className="px-2 py-2 text-left text-white/60">Final</th>
                      <th className="px-2 py-2 text-left text-white/60">Started</th>
                      <th className="px-2 py-2 text-left text-white/60">Ended</th>
                      <th className="px-2 py-2 text-right text-white/60">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {slice.map((sess) => (
                      <tr key={sess.workSessionId}>
                        <td className="px-2 py-1.5 text-white font-mono whitespace-nowrap">{sess.orderNumber ?? "—"}</td>
                        <td className="px-2 py-1.5 text-white/80 max-w-[120px] truncate" title={sess.customerEmail ?? ""}>
                          {sess.customerEmail ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-white/80 whitespace-nowrap text-[11px]">
                          <div>{sess.agentName}</div>
                          <div className="text-white/40">{sess.agentEmail}</div>
                        </td>
                        <td className="px-2 py-1.5 text-cyan-200/90 whitespace-nowrap text-[11px]">
                          {(sess.fromQueue ?? "—")} → {sess.toQueue ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-white/80">{sess.disposition ?? "—"}</td>
                        <td className="px-2 py-1.5 text-amber-200/90">{sess.outcomeType}</td>
                        <td className="px-2 py-1.5">{sess.isFinalResolution ? "Yes" : "—"}</td>
                        <td className="px-2 py-1.5 text-white/60 whitespace-nowrap">
                          {sess.startedAt ? new Date(sess.startedAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-white/60 whitespace-nowrap">{new Date(sess.endedAt).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right">{formatDurationSec(sess.durationSec ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                totalItems={rows.length}
                onPrev={() => setDayModalPage(page - 1)}
                onNext={() => setDayModalPage(page + 1)}
              />
            </>
          )}
        </div>
      );
    }

    if (mt === "newTasks") {
      const rows = d.newTasks ?? [];
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      const page = Math.min(dayModalPage, totalPages);
      const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return (
        <div>
          <div className="flex justify-end mb-2">
            <button
              type="button"
              className="text-xs px-3 py-1 rounded bg-emerald-600/80 text-white"
              onClick={() =>
                downloadCsv(
                  `holds-new-tasks-${d.date}.csv`,
                  ["Order Number", "Customer Email", "Agent", "Created At", "Status", "Holds queue"],
                  rows.map((t) => ({
                    "Order Number": t.orderNumber ?? "",
                    "Customer Email": t.customerEmail ?? "",
                    Agent: t.agentName ?? "",
                    "Created At": t.createdAt ?? "",
                    Status: t.status ?? "",
                    "Holds queue": t.holdsStatus ?? "",
                  }))
                )
              }
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-2 py-1 text-left text-white/60">Order #</th>
                  <th className="px-2 py-1 text-left text-white/60">Email</th>
                  <th className="px-2 py-1 text-left text-white/60">Agent</th>
                  <th className="px-2 py-1 text-left text-white/60">Queue</th>
                  <th className="px-2 py-1 text-left text-white/60">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {slice.map((task) => (
                  <tr key={task.id}>
                    <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "—"}</td>
                    <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "—"}</td>
                    <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                    <td className="px-2 py-1 text-white/70">{task.holdsStatus ?? "—"}</td>
                    <td className="px-2 py-1 text-white/60">
                      {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            page={page}
            totalPages={totalPages}
            totalItems={rows.length}
            onPrev={() => setDayModalPage(page - 1)}
            onNext={() => setDayModalPage(page + 1)}
          />
        </div>
      );
    }

    if (mt === "legacyCompleted") {
      const rows = d.completedTasks ?? [];
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      const page = Math.min(dayModalPage, totalPages);
      const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return (
        <div>
          <div className="flex justify-end mb-2">
            <button
              type="button"
              className="text-xs px-3 py-1 rounded bg-emerald-600/80 text-white"
              onClick={() =>
                downloadCsv(
                  `holds-legacy-completed-${d.date}.csv`,
                  ["Order Number", "Customer Email", "Disposition", "Agent", "Completed At", "Status", "Holds queue"],
                  rows.map((t) => ({
                    "Order Number": t.orderNumber ?? "",
                    "Customer Email": t.customerEmail ?? "",
                    Disposition: t.disposition ?? "",
                    Agent: t.agentName ?? "",
                    "Completed At": t.endTime ?? "",
                    Status: t.status ?? "",
                    "Holds queue": t.holdsStatus ?? "",
                  }))
                )
              }
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-2 py-1 text-left text-white/60">Order #</th>
                  <th className="px-2 py-1 text-left text-white/60">Email</th>
                  <th className="px-2 py-1 text-left text-white/60">Disposition</th>
                  <th className="px-2 py-1 text-left text-white/60">Agent</th>
                  <th className="px-2 py-1 text-left text-white/60">Queue</th>
                  <th className="px-2 py-1 text-left text-white/60">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {slice.map((task) => (
                  <tr key={task.id}>
                    <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "—"}</td>
                    <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "—"}</td>
                    <td className="px-2 py-1 text-green-300">{task.disposition ?? "—"}</td>
                    <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                    <td className="px-2 py-1 text-white/70">{task.holdsStatus ?? "—"}</td>
                    <td className="px-2 py-1 text-white/60">
                      {task.endTime ? new Date(task.endTime).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            page={page}
            totalPages={totalPages}
            totalItems={rows.length}
            onPrev={() => setDayModalPage(page - 1)}
            onNext={() => setDayModalPage(page + 1)}
          />
        </div>
      );
    }

    if (mt === "queueSnapshot") {
      const counts = d.queueCountsAtEndOfDay ?? {};
      const byQueue = d.tasksInQueueAtEndOfDay ?? {};
      const flatRows: Record<string, string | number | null | undefined>[] = [];
      for (const [queue, count] of Object.entries(counts)) {
        flatRows.push({ Queue: queue, Count: count as number, "Order Number": "", "Customer Email": "", Agent: "", Status: "" });
      }
      for (const [queue, tasks] of Object.entries(byQueue)) {
        for (const t of tasks) {
          flatRows.push({
            Queue: queue,
            Count: "",
            "Order Number": t.orderNumber ?? "",
            "Customer Email": t.customerEmail ?? "",
            Agent: t.agentName ?? "",
            Status: t.status ?? "",
          });
        }
      }
      const queueKeys = Object.keys(byQueue);
      const flatList = queueKeys.flatMap((q) => byQueue[q].map((t) => ({ queue: q, task: t })));
      const totalPages = Math.max(1, Math.ceil(flatList.length / PAGE_SIZE));
      const page = Math.min(dayModalPage, totalPages);
      const slice = flatList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

      return (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs px-3 py-1 rounded bg-emerald-600/80 text-white"
              onClick={() =>
                downloadCsv(`holds-queue-snapshot-${d.date}.csv`, ["Queue", "Count", "Order Number", "Customer Email", "Agent", "Status"], flatRows)
              }
            >
              Export CSV
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(counts).map(([queue, count]) => (
              <div key={queue} className="p-2 bg-white/5 rounded border border-white/10">
                <div className="text-xs text-white/55">{queue}</div>
                <div className="text-lg font-bold text-white">{count as number}</div>
              </div>
            ))}
          </div>
          <h5 className="text-sm font-medium text-white/80">Orders by queue at end of day</h5>
          {flatList.length === 0 ? (
            <p className="text-white/50 text-sm">No detail available for this snapshot.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-2 py-1 text-left text-white/60">Queue</th>
                      <th className="px-2 py-1 text-left text-white/60">Order #</th>
                      <th className="px-2 py-1 text-left text-white/60">Email</th>
                      <th className="px-2 py-1 text-left text-white/60">Agent</th>
                      <th className="px-2 py-1 text-left text-white/60">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {slice.map(({ queue, task }) => (
                      <tr key={`${queue}-${task.id}`}>
                        <td className="px-2 py-1 text-cyan-200/90">{queue}</td>
                        <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "—"}</td>
                        <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "—"}</td>
                        <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                        <td className="px-2 py-1 text-white/80">{task.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                totalItems={flatList.length}
                onPrev={() => setDayModalPage(page - 1)}
                onNext={() => setDayModalPage(page + 1)}
              />
            </>
          )}
        </div>
      );
    }

    if (mt === "rollovers") {
      const rows = d.rolloverTasks ?? [];
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      const page = Math.min(dayModalPage, totalPages);
      const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return (
        <div>
          <div className="flex justify-end mb-2">
            <button
              type="button"
              className="text-xs px-3 py-1 rounded bg-emerald-600/80 text-white"
              onClick={() =>
                downloadCsv(
                  `holds-rollovers-${d.date}.csv`,
                  ["Order Number", "Customer Email", "Agent", "Status", "Queue", "Created At", "End Time"],
                  rows.map((t) => ({
                    "Order Number": t.orderNumber ?? "",
                    "Customer Email": t.customerEmail ?? "",
                    Agent: t.agentName ?? "",
                    Status: t.status ?? "",
                    Queue: t.queueAtEndOfDay ?? t.holdsStatus ?? "",
                    "Created At": t.createdAt ?? "",
                    "End Time": t.endTime ?? "",
                  }))
                )
              }
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-2 py-1 text-left text-white/60">Order #</th>
                  <th className="px-2 py-1 text-left text-white/60">Email</th>
                  <th className="px-2 py-1 text-left text-white/60">Agent</th>
                  <th className="px-2 py-1 text-left text-white/60">Status</th>
                  <th className="px-2 py-1 text-left text-white/60">Queue (end of day)</th>
                  <th className="px-2 py-1 text-left text-white/60">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {slice.map((task) => (
                  <tr key={task.id}>
                    <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "—"}</td>
                    <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "—"}</td>
                    <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                    <td className="px-2 py-1 text-white/80">{task.status}</td>
                    <td className="px-2 py-1 text-amber-200/90">{task.queueAtEndOfDay ?? task.holdsStatus ?? "—"}</td>
                    <td className="px-2 py-1 text-white/60">
                      {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            page={page}
            totalPages={totalPages}
            totalItems={rows.length}
            onPrev={() => setDayModalPage(page - 1)}
            onNext={() => setDayModalPage(page + 1)}
          />
        </div>
      );
    }

    return null;
  }

  return (
    <Card>
      <div className="mb-6 space-y-3">
        <h2 className="text-xl font-semibold text-white mb-1">Daily Activity</h2>
        <p className="text-white/60 text-sm border border-white/10 rounded-lg px-3 py-2 bg-white/[0.03]">
          Dates use <span className="text-white/80">Pacific Time</span>. Daily Activity shows each completed Holds action
          performed by an agent. This includes both final resolutions and queue handoffs.{" "}
          <span className="text-white/70">End-of-Day Queue Snapshot</span> shows what was still sitting in each queue at 5
          PM.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm text-white/60 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 rounded-md text-white text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-white/60">Loading daily activity…</div>
      ) : breakdowns.length === 0 ? (
        <div className="text-center py-8 text-white/60">No data found for the selected date range</div>
      ) : (
        <>
          {breakdowns.length > 1 && (
            <>
              {rangeSummary && (
                <div className="space-y-8 mb-8">
                  <div>
                    <h3 className="text-md font-semibold text-white/90 mb-3">Range summary (all days)</h3>
                    {renderSessionSummaryCards(rangeSummary)}
                    {renderLegacySummaryCards(rangeLegacy)}
                  </div>
                  {renderAgentTable(rangeByAgent, "range-agent")}
                  {renderQueueMovementTable(rangeByMovement, "range-mv")}
                  {renderDispositionTable(rangeByDisposition, "range-disp")}
                </div>
              )}
            </>
          )}

          {breakdowns.length === 1 && breakdowns[0].sessionSummary && (
            <div className="space-y-8 mb-8">
              <div>
                <h3 className="text-md font-semibold text-white/90 mb-3">Completed Actions</h3>
                {renderSessionSummaryCards(breakdowns[0].sessionSummary)}
                {renderLegacySummaryCards(breakdowns[0].legacyActivitySummary)}
              </div>
              {renderAgentTable(breakdowns[0].sessionsByAgent ?? [], "day-agent")}
              {renderQueueMovementTable(breakdowns[0].sessionsByQueueMovement ?? [], "day-mv")}
              {renderDispositionTable(breakdowns[0].sessionsByDisposition ?? [], "day-disp")}
            </div>
          )}

          {breakdowns.length === 1 ? (
            <div className="space-y-6 border-t border-white/10 pt-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">End-of-Day Queue Snapshot</h3>
                <p className="text-xs text-white/50 mb-4">
                  What was still sitting in each queue at 5 PM (or current time if today is still before that cutoff).
                </p>
                {Object.keys(breakdowns[0].queueCountsAtEndOfDay ?? {}).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(breakdowns[0].queueCountsAtEndOfDay).map(([queue, count]) => (
                      <div key={queue} className="p-3 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-xs text-white/60 mb-1">{queue}</div>
                        <div className="text-xl font-bold text-white">{count as number}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/45 text-sm">No EOD queue counts for this day.</p>
                )}
              </div>
              {(breakdowns[0].sessionSummary?.totalSessions ?? 0) > 0 ||
              (breakdowns[0].newTasksCount ?? 0) > 0 ||
              (breakdowns[0].completedTasksCount ?? 0) > 0 ||
              (breakdowns[0].rolloverTasksCount ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayDetails(breakdowns[0]);
                    setModalTabResetPage("summary");
                    setShowTaskDetails(true);
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  View details (tabs)
                </button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-white/10 pt-6">
              <h3 className="text-lg font-semibold text-white mb-3">By day</h3>
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr className="text-left text-white/60">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Completed Actions</th>
                    <th className="px-3 py-2 text-right">Final</th>
                    <th className="px-3 py-2 text-right">Moved</th>
                    <th className="px-3 py-2 text-right">Completed Orders (older)</th>
                    <th className="px-3 py-2 text-right">New Imported</th>
                    <th className="px-3 py-2 text-right">Open at EOD</th>
                    {allQueues.slice(0, 3).map((queue) => (
                      <th key={queue} className="px-3 py-2 text-xs max-w-[100px] truncate" title={queue}>
                        {queue.substring(0, 14)}
                      </th>
                    ))}
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {breakdowns.map((breakdown) => {
                    const ss = breakdown.sessionSummary;
                    const actions = ss?.totalSessions ?? 0;
                    const legComp = breakdown.completedTasksCount ?? 0;
                    const highlightLegacy = actions === 0 && legComp > 0;
                    return (
                      <tr key={breakdown.date} className="hover:bg-white/5">
                        <td className="px-3 py-2 text-white font-medium text-xs whitespace-nowrap">
                          {formatDate(breakdown.date)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${highlightLegacy ? "text-amber-300/90" : "text-blue-300"}`}
                          title={highlightLegacy ? "No completed actions that day; older completed-order count exists" : undefined}
                        >
                          {actions}
                          {highlightLegacy ? " *" : ""}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-300 font-semibold">
                          {ss?.finalResolutionCount ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-300 font-semibold">{ss?.handoffCount ?? 0}</td>
                        <td className="px-3 py-2 text-right text-white/85 font-semibold">{legComp}</td>
                        <td className="px-3 py-2 text-right text-white/80 font-semibold">{breakdown.newTasksCount ?? 0}</td>
                        <td className="px-3 py-2 text-right text-white/80 font-semibold">
                          {breakdown.totalPendingAtEndOfDay ?? "—"}
                        </td>
                        {allQueues.slice(0, 3).map((queue) => (
                          <td key={queue} className="px-3 py-2 text-white/70 text-center text-xs">
                            {breakdown.queueCountsAtEndOfDay?.[queue] ?? "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={(e) => handleDateClick(e, breakdown.date)}
                            className="text-blue-400 hover:text-blue-300 text-xs underline"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-white/40 mt-2">
                * No completed actions that day, but completed orders (older tracking) are greater than zero.
              </p>
            </div>
          )}
        </>
      )}

      {showTaskDetails && selectedDayDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-start mb-4 gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">Daily Activity — {formatDate(selectedDayDetails.date)}</h3>
                <p className="text-sm text-white/60 mt-1">
                  Changing tabs resets pagination. Dates follow Pacific Time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTaskDetails(false);
                  setSelectedDayDetails(null);
                }}
                className="text-white/60 hover:text-white text-2xl leading-none shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4 border-b border-white/10 pb-3">
              {modalTabsAvailable.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setModalTabResetPage(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    resolvedModalTab === t.id ? "bg-blue-600 text-white" : "bg-white/10 text-white/70 hover:bg-white/15"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {renderModalContent()}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowTaskDetails(false);
                  setSelectedDayDetails(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
