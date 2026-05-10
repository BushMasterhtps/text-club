"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card } from "@/app/_components/Card";

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
  sessionDetails?: SessionDetailRow[];
  newTasks?: Array<{
    id: string;
    orderNumber?: string | null;
    customerEmail?: string | null;
    agentName?: string;
    createdAt?: string;
  }>;
  completedTasks?: Array<{
    id: string;
    orderNumber?: string | null;
    customerEmail?: string | null;
    disposition?: string | null;
    agentName?: string;
    endTime?: string | null;
  }>;
  rolloverTasks?: Array<{
    id: string;
    orderNumber?: string | null;
    customerEmail?: string | null;
    agentName?: string;
    queueHistory?: unknown;
  }>;
  tasksInQueueAtEndOfDay?: Record<string, Array<{
    id: string;
    orderNumber?: string | null;
    customerEmail?: string | null;
    agentName?: string;
    status?: string;
  }>>;
}

interface DailyBreakdownApiData {
  breakdowns: DailyBreakdownRow[];
  rangeSessionSummary: SessionSummary;
  rangeSessionsByAgent: SessionByAgentRow[];
  rangeSessionsByQueueMovement: SessionByQueueMovementRow[];
  rangeSessionsByDisposition: SessionByDispositionRow[];
  summary?: { legacyTaskRowMetricsNote?: string };
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

export default function DailyBreakdown() {
  const [payload, setPayload] = useState<DailyBreakdownApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDayDetails, setSelectedDayDetails] = useState<DailyBreakdownRow | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

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
          (json.data.breakdowns as DailyBreakdownRow[]).find((b) => b.date === date) ??
          json.data.breakdowns[0];
        setSelectedDayDetails(breakdown);
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
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const breakdowns = payload?.breakdowns ?? [];
  const rangeSummary = payload?.rangeSessionSummary;
  const rangeByAgent = payload?.rangeSessionsByAgent ?? [];
  const rangeByMovement = payload?.rangeSessionsByQueueMovement ?? [];
  const rangeByDisposition = payload?.rangeSessionsByDisposition ?? [];

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
          <h3 className="text-sm font-medium text-blue-200 mb-1">Total actions</h3>
          <p className="text-2xl font-bold text-white">{s.totalSessions}</p>
          <p className="text-[10px] text-white/45 mt-1 leading-snug">TaskWorkSession rows (HOLDS, productivity)</p>
        </div>
        <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-emerald-200 mb-1">Final resolutions</h3>
          <p className="text-2xl font-bold text-white">{s.finalResolutionCount}</p>
          <p className="text-[10px] text-white/45 mt-1 leading-snug">Completed queue</p>
        </div>
        <div className="p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-amber-200 mb-1">Handoffs</h3>
          <p className="text-2xl font-bold text-white">{s.handoffCount}</p>
          <p className="text-[10px] text-white/45 mt-1 leading-snug">QUEUE_HANDOFF</p>
        </div>
        <div className="p-4 bg-violet-900/20 border border-violet-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-violet-200 mb-1">Avg handle time</h3>
          <p className="text-2xl font-bold text-white">{formatDurationSec(s.averageHandleTimeSec)}</p>
          <p className="text-[10px] text-white/45 mt-1 leading-snug">Mean durationSec</p>
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

  const renderAgentTable = (rows: SessionByAgentRow[], key: string) => (
    <div className="overflow-x-auto mb-8">
      <h3 className="text-lg font-semibold text-white mb-3">Agent breakdown</h3>
      <table className="w-full text-sm">
        <thead className="bg-white/5">
          <tr className="text-left text-white/60">
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2 text-right">Total actions</th>
            <th className="px-3 py-2 text-right">Final resolutions</th>
            <th className="px-3 py-2 text-right">Handoffs</th>
            <th className="px-3 py-2 text-right">Duplicates</th>
            <th className="px-3 py-2 text-right">Escalation stay</th>
            <th className="px-3 py-2 text-right">Avg handle</th>
            <th className="px-3 py-2">Top queue / mix</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-white/50">
                No work sessions in this range.
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
            <th className="px-3 py-2 text-right">Avg handle</th>
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
            <th className="px-3 py-2 text-right">Final resolutions</th>
            <th className="px-3 py-2 text-right">Handoffs</th>
            <th className="px-3 py-2 text-right">Dup routing</th>
            <th className="px-3 py-2 text-right">Esc. stay</th>
            <th className="px-3 py-2 text-right">Avg handle</th>
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

  return (
    <Card>
      <div className="mb-6 space-y-3">
        <h2 className="text-xl font-semibold text-white mb-1">Daily Activity</h2>
        <p className="text-white/60 text-sm">
          Primary metrics come from <span className="text-white/80">TaskWorkSession</span> (Holds actions where{" "}
          <span className="text-white/80">endedAt</span> falls in the selected day or range,{" "}
          <span className="text-white/80">countsTowardProductivity</span>). Each completion can produce one session;
          multiple sessions per order are listed separately.
        </p>
        <p className="text-xs text-white/50 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.03]">
          End-of-day inventory below is a <span className="text-white/70">queue snapshot at 5 PM PST</span> from task
          rows — not the same as action counts.
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
          {breakdowns.length > 1 && rangeSummary && (
            <div className="space-y-8 mb-8">
              <div>
                <h3 className="text-md font-semibold text-white/90 mb-3">Range summary (all days)</h3>
                {renderSessionSummaryCards(rangeSummary)}
              </div>
              {renderAgentTable(rangeByAgent, "range-agent")}
              {renderQueueMovementTable(rangeByMovement, "range-mv")}
              {renderDispositionTable(rangeByDisposition, "range-disp")}
            </div>
          )}

          {breakdowns.length === 1 && breakdowns[0].sessionSummary && (
            <div className="space-y-8 mb-8">
              <div>
                <h3 className="text-md font-semibold text-white/90 mb-3">Work sessions</h3>
                {renderSessionSummaryCards(breakdowns[0].sessionSummary)}
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
                  Inventory by queue at 5 PM PST (or current time if today before cutoff). Derived from task rows and
                  queue history — not productivity actions.
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
              <div className="flex flex-wrap gap-3 text-xs text-white/45">
                <span>
                  Legacy task-row counts (same API fields): new {breakdowns[0].newTasksCount}, task endTime in day{" "}
                  {breakdowns[0].completedTasksCount}, Agent Research at EOD {breakdowns[0].rolloverTasksCount}, pending
                  lanes {breakdowns[0].totalPendingAtEndOfDay}.
                </span>
              </div>
              {(breakdowns[0].sessionSummary?.totalSessions ?? 0) > 0 ||
              (breakdowns[0].newTasksCount ?? 0) > 0 ||
              (breakdowns[0].completedTasksCount ?? 0) > 0 ||
              (breakdowns[0].rolloverTasksCount ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayDetails(breakdowns[0]);
                    setShowTaskDetails(true);
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  View session rows &amp; legacy task lists
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
                    <th className="px-3 py-2 text-right">Actions</th>
                    <th className="px-3 py-2 text-right">Final</th>
                    <th className="px-3 py-2 text-right">Handoffs</th>
                    <th className="px-3 py-2 text-right">Pending (EOD)</th>
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
                    return (
                      <tr key={breakdown.date} className="hover:bg-white/5">
                        <td className="px-3 py-2 text-white font-medium text-xs whitespace-nowrap">
                          {formatDate(breakdown.date)}
                        </td>
                        <td className="px-3 py-2 text-right text-blue-300 font-semibold">
                          {ss?.totalSessions ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-300 font-semibold">
                          {ss?.finalResolutionCount ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-300 font-semibold">{ss?.handoffCount ?? 0}</td>
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
            </div>
          )}
        </>
      )}

      {showTaskDetails && selectedDayDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Daily Activity — {formatDate(selectedDayDetails.date)}
                </h3>
                <p className="text-sm text-white/60 mt-1">Sessions use endedAt in this local calendar day (5 PM PST window).</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTaskDetails(false);
                  setSelectedDayDetails(null);
                }}
                className="text-white/60 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {renderSessionSummaryCards(selectedDayDetails.sessionSummary)}

            <div className="mt-8 mb-6">
              <h4 className="text-lg font-semibold text-white mb-2">Session details</h4>
              <p className="text-xs text-white/50 mb-3">
                One row per TaskWorkSession. The same order can appear multiple times if the task had several actions.
              </p>
              {selectedDayDetails.sessionDetails && selectedDayDetails.sessionDetails.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-2 text-left text-white/60">Order #</th>
                        <th className="px-2 py-2 text-left text-white/60">Customer email</th>
                        <th className="px-2 py-2 text-left text-white/60">Agent</th>
                        <th className="px-2 py-2 text-left text-white/60">Queues</th>
                        <th className="px-2 py-2 text-left text-white/60">Disposition</th>
                        <th className="px-2 py-2 text-left text-white/60">Outcome</th>
                        <th className="px-2 py-2 text-left text-white/60">Final</th>
                        <th className="px-2 py-2 text-left text-white/60">Started</th>
                        <th className="px-2 py-2 text-left text-white/60">Ended</th>
                        <th className="px-2 py-2 text-right text-white/60">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.sessionDetails.map((sess) => (
                        <tr key={sess.workSessionId}>
                          <td className="px-2 py-1.5 text-white font-mono whitespace-nowrap">{sess.orderNumber ?? "—"}</td>
                          <td className="px-2 py-1.5 text-white/80 max-w-[140px] truncate" title={sess.customerEmail ?? ""}>
                            {sess.customerEmail ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-white/80 whitespace-nowrap">
                            <div>{sess.agentName}</div>
                            <div className="text-[10px] text-white/40">{sess.agentEmail}</div>
                          </td>
                          <td className="px-2 py-1.5 text-cyan-200/90 whitespace-nowrap">
                            {(sess.fromQueue ?? "—")} → {sess.toQueue ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-white/80">{sess.disposition ?? "—"}</td>
                          <td className="px-2 py-1.5 text-amber-200/90">{sess.outcomeType}</td>
                          <td className="px-2 py-1.5">{sess.isFinalResolution ? "Yes" : "—"}</td>
                          <td className="px-2 py-1.5 text-white/60 whitespace-nowrap">
                            {sess.startedAt ? new Date(sess.startedAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-white/60 whitespace-nowrap">
                            {new Date(sess.endedAt).toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right text-white/90">
                            {formatDurationSec(sess.durationSec ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-white/50 text-sm py-4">No work sessions ended on this day.</p>
              )}
            </div>

            <div className="border-t border-white/10 pt-6 mb-6">
              <h4 className="text-lg font-semibold text-white mb-2">End-of-Day Queue Snapshot</h4>
              <p className="text-xs text-white/50 mb-3">
                Inventory at 5 PM PST from task rows — not the same as action totals above.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {Object.entries(selectedDayDetails.queueCountsAtEndOfDay ?? {}).map(([queue, count]) => (
                  <div key={queue} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-xs text-white/60 mb-1">{queue}</div>
                    <div className="text-xl font-bold text-white">{count as number}</div>
                  </div>
                ))}
              </div>
            </div>

            {selectedDayDetails.newTasks && selectedDayDetails.newTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-white/80 mb-2">
                  Legacy — new tasks created ({selectedDayDetails.newTasks.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-1 text-left text-white/60">Order #</th>
                        <th className="px-2 py-1 text-left text-white/60">Email</th>
                        <th className="px-2 py-1 text-left text-white/60">Agent</th>
                        <th className="px-2 py-1 text-left text-white/60">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.newTasks.map((task) => (
                        <tr key={task.id}>
                          <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "N/A"}</td>
                          <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "N/A"}</td>
                          <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                          <td className="px-2 py-1 text-white/60">
                            {task.createdAt ? new Date(task.createdAt).toLocaleString() : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedDayDetails.completedTasks && selectedDayDetails.completedTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-white/80 mb-2">
                  Legacy — tasks with endTime in this day ({selectedDayDetails.completedTasks.length})
                </h4>
                <p className="text-xs text-white/45 mb-2">Task-level completion timestamp, not session-level only.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-1 text-left text-white/60">Order #</th>
                        <th className="px-2 py-1 text-left text-white/60">Email</th>
                        <th className="px-2 py-1 text-left text-white/60">Disposition</th>
                        <th className="px-2 py-1 text-left text-white/60">Agent</th>
                        <th className="px-2 py-1 text-left text-white/60">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.completedTasks.map((task) => (
                        <tr key={task.id}>
                          <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "N/A"}</td>
                          <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "N/A"}</td>
                          <td className="px-2 py-1 text-green-300">{task.disposition ?? "N/A"}</td>
                          <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                          <td className="px-2 py-1 text-white/60">
                            {task.endTime ? new Date(task.endTime).toLocaleString() : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedDayDetails.rolloverTasks && selectedDayDetails.rolloverTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-white/80 mb-2">
                  Legacy — Agent Research at EOD ({selectedDayDetails.rolloverTasks.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-2 py-1 text-left text-white/60">Order #</th>
                        <th className="px-2 py-1 text-left text-white/60">Email</th>
                        <th className="px-2 py-1 text-left text-white/60">Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedDayDetails.rolloverTasks.map((task) => (
                        <tr key={task.id}>
                          <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "N/A"}</td>
                          <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "N/A"}</td>
                          <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedDayDetails.tasksInQueueAtEndOfDay &&
              Object.keys(selectedDayDetails.tasksInQueueAtEndOfDay).length > 0 && (
                <div className="mb-4">
                  <h4 className="text-md font-semibold text-white/80 mb-2">Tasks in each queue at EOD</h4>
                  {Object.entries(selectedDayDetails.tasksInQueueAtEndOfDay).map(([queue, tasks]) => (
                    <div key={queue} className="mb-4">
                      <h5 className="text-sm font-semibold text-white mb-2">
                        {queue} ({tasks.length})
                      </h5>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white/5">
                            <tr>
                              <th className="px-2 py-1 text-left text-white/60">Order #</th>
                              <th className="px-2 py-1 text-left text-white/60">Email</th>
                              <th className="px-2 py-1 text-left text-white/60">Agent</th>
                              <th className="px-2 py-1 text-left text-white/60">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {tasks.map((task) => (
                              <tr key={task.id}>
                                <td className="px-2 py-1 text-white font-mono">{task.orderNumber ?? "N/A"}</td>
                                <td className="px-2 py-1 text-white/80">{task.customerEmail ?? "N/A"}</td>
                                <td className="px-2 py-1 text-white/80">{task.agentName}</td>
                                <td className="px-2 py-1 text-white/80">{task.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
