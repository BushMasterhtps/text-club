"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/app/_components/Card";
import ResolvedOrdersReportWithComments from "./ResolvedOrdersReportWithComments";
import DailyBreakdown from "./DailyBreakdown";
import { HOLDS_ACTIONABLE_QUEUES } from "@/lib/holds-analytics-definitions";

interface AnalyticsData {
  overview: {
    actionableOpenHoldsTasks: number;
    duplicateExceptions: number;
    agingTasks: number;
    approachingTasks: number;
    unassignedTasks: number;
  };
  queueStats: Record<string, number>;
  agingBreakdown: {
    "0-2 days": number;
    "3-4 days": number;
    "5+ days": number;
  };
  agingTasks: AgingTaskRow[];
  approachingTasks: AgingTaskRow[];
}

type AgingTaskRow = {
  id: string;
  orderNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  orderDate: string | null;
  daysSinceOrder: number | null;
  isAging5Plus: boolean;
  isApproaching3To4: boolean;
  holdsStatus: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
};

export default function HoldsAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "resolved-comments" | "daily-breakdown"
  >("overview");

  const fetchAnalytics = useCallback(async () => {
    try {
      const overviewResponse = await fetch("/api/holds/analytics?type=overview");
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        if (overviewData.success) {
          setAnalytics(overviewData.data);
        }
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /** Defer so this effect does not synchronously chain into setState (react-hooks/set-state-in-effect). */
    queueMicrotask(() => {
      void fetchAnalytics();
    });
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">📈 Holds Analytics</h2>
        <div className="text-white/60">Loading analytics data...</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-xl font-semibold mb-4">📈 Holds Analytics</h2>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "overview"
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            Queue Health
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("resolved-comments")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "resolved-comments"
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            Warehouse Export
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("daily-breakdown")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "daily-breakdown"
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            Daily Activity
          </button>
        </div>

        {activeTab === "overview" && analytics && (
          <div className="space-y-6">
            <div className="p-3 rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white/70 space-y-2">
              <p>
                <span className="font-medium text-white/90">Queue Health</span> uses{" "}
                <span className="text-white/85">holdsStatus</span> as the source of truth (same as Workflow Queues).{" "}
                <span className="text-white/85">Open actionable</span> counts are Agent Research, Customer Contact, and
                Escalated Call 4+ Day only. <span className="text-white/85">Duplicate exceptions</span> are import/assignment
                duplicates and are not included in actionable totals. <span className="text-white/85">Completed</span> is
                excluded. Task rows are counted regardless of <span className="text-white/85">Task.status</span> (e.g.{" "}
                <span className="text-white/85">IN_PROGRESS</span> still counts when the queue is Customer Contact).
              </p>
              <p className="text-white/55 text-xs">
                Order age uses days since <span className="text-white/70">holdsOrderDate</span> (import/order date). This
                is not time-in-queue SLA. Workflow cards may label “approaching” differently (e.g. day 3 toward day 4);
                here we use <span className="text-white/70">3–4 days</span> and <span className="text-white/70">5+ days</span>{" "}
                for actionable tasks only.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-200 mb-1">Open actionable Holds</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.actionableOpenHoldsTasks}</p>
                <p className="text-xs text-white/45 mt-1">Agent Research + Customer Contact + Escalated</p>
              </div>
              <div className="p-4 bg-slate-900/40 border border-white/20 rounded-lg">
                <h3 className="text-sm font-medium text-slate-200 mb-1">Duplicate exceptions</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.duplicateExceptions}</p>
                <p className="text-xs text-white/45 mt-1">Not part of actionable total</p>
              </div>
              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-green-200 mb-1">Unassigned actionable</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.unassignedTasks}</p>
              </div>
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-200 mb-1">Order age 5+ days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.agingTasks}</p>
                <p className="text-xs text-white/45 mt-1">Actionable only</p>
              </div>
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Order age 3–4 days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.approachingTasks}</p>
                <p className="text-xs text-white/45 mt-1">Actionable only</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Actionable queues</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {HOLDS_ACTIONABLE_QUEUES.map((queue) => (
                  <div key={queue} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="font-medium text-white">{queue}</p>
                    <p className="text-2xl font-bold text-blue-300">{analytics.queueStats[queue] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Actionable tasks by order age</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <p className="font-medium text-green-200">0–2 days (or no order date)</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["0-2 days"]}</p>
                </div>
                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                  <p className="font-medium text-yellow-200">3–4 days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["3-4 days"]}</p>
                </div>
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="font-medium text-red-200">5+ days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["5+ days"]}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Actionable tasks: order age 5+ days</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {analytics.agingTasks.slice(0, 20).map((task) => (
                  <div key={task.id} className="p-3 bg-red-900/10 border border-red-500/30 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">{task.customerName || "Unknown Customer"}</p>
                        <p className="text-sm text-white/60">
                          Order: {task.orderNumber || "N/A"} | Email: {task.customerEmail || "N/A"}
                        </p>
                        <p className="text-sm text-white/60">Queue: {task.holdsStatus ?? "N/A"}</p>
                      </div>
                      <div className="text-right">
                        <div className="px-2 py-1 bg-red-900/50 text-red-200 rounded text-xs font-medium">
                          {task.daysSinceOrder == null ? "—" : `${task.daysSinceOrder} days`}
                        </div>
                        {task.assignedTo && (
                          <p className="text-xs text-blue-300 mt-1">{task.assignedTo.name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {analytics.agingTasks.length > 20 && (
                  <p className="text-center text-white/60 text-sm">
                    ... and {analytics.agingTasks.length - 20} more
                  </p>
                )}
                {analytics.agingTasks.length === 0 && (
                  <p className="text-white/50 text-sm">No actionable tasks in this bucket.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Actionable tasks: order age 3–4 days</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {analytics.approachingTasks.slice(0, 20).map((task) => (
                  <div key={task.id} className="p-3 bg-yellow-900/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">{task.customerName || "Unknown Customer"}</p>
                        <p className="text-sm text-white/60">
                          Order: {task.orderNumber || "N/A"} | Email: {task.customerEmail || "N/A"}
                        </p>
                        <p className="text-sm text-white/60">Queue: {task.holdsStatus ?? "N/A"}</p>
                      </div>
                      <div className="text-right">
                        <div className="px-2 py-1 bg-yellow-900/50 text-yellow-200 rounded text-xs font-medium">
                          {task.daysSinceOrder == null ? "—" : `${task.daysSinceOrder} days`}
                        </div>
                        {task.assignedTo && (
                          <p className="text-xs text-blue-300 mt-1">{task.assignedTo.name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {analytics.approachingTasks.length > 20 && (
                  <p className="text-center text-white/60 text-sm">
                    ... and {analytics.approachingTasks.length - 20} more
                  </p>
                )}
                {analytics.approachingTasks.length === 0 && (
                  <p className="text-white/50 text-sm">No actionable tasks in this bucket.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {activeTab === "resolved-comments" && (
        <div className="mt-6">
          <ResolvedOrdersReportWithComments />
        </div>
      )}

      {activeTab === "daily-breakdown" && (
        <div className="mt-6">
          <DailyBreakdown />
        </div>
      )}
    </div>
  );
}
