"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/app/_components/Card";
import ResolvedOrdersReportWithComments from "./ResolvedOrdersReportWithComments";
import DailyBreakdown from "./DailyBreakdown";
import {
  HOLDS_ACTIVE_WORKFLOW_QUEUES,
  HOLDS_PRIORITY_IMPORT_NOTE,
} from "@/lib/holds-analytics-definitions";

interface AnalyticsData {
  overview: {
    activeHoldsTasks: number;
    agingTasks: number;
    approachingTasks: number;
    unassignedTasks: number;
  };
  queueStats: Record<string, number>;
  priorityStats: Record<number, number>;
  agingBreakdown: {
    '0-2 days': number;
    '3-4 days': number;
    '5+ days': number;
  };
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
  priority: number | null;
  holdsStatus: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
};

type AgingReportData = {
  agingTasks: AgingTaskRow[];
  approachingTasks: AgingTaskRow[];
  allTasks: AgingTaskRow[];
  summary: {
    totalActive: number;
    aging: number;
    approaching: number;
    unassigned: number;
  };
};

export default function HoldsAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [agingReport, setAgingReport] = useState<AgingReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImportedPriority, setShowImportedPriority] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "aging" | "resolved-comments" | "daily-breakdown"
  >("overview");

  const fetchAnalytics = useCallback(async () => {
    try {
      // Fetch overview analytics
      const overviewResponse = await fetch('/api/holds/analytics?type=overview');
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        if (overviewData.success) {
          setAnalytics(overviewData.data);
        }
      }

      const agingResponse = await fetch('/api/holds/analytics?type=aging');
      if (agingResponse.ok) {
        const agingData = await agingResponse.json();
        if (agingData.success) {
          setAgingReport(agingData.data);
        }
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
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
        
        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
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
            onClick={() => setActiveTab("aging")}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === "aging"
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            Active order age
          </button>
          <button
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
                <span className="font-medium text-white/90">Queue Health</span> reflects{" "}
                <span className="text-white/85">active Holds inventory only</span>: PENDING tasks in Agent Research,
                Customer Contact, Escalated Call 4+ Day, and Duplicates. Completed / resolved / warehouse rows are
                excluded. Counts are from task rows, not TaskWorkSession productivity.
              </p>
              <p className="text-white/55 text-xs">
                Order-age buckets use days since <span className="text-white/70">holdsOrderDate</span> (import/order
                date). This is a simple order-age signal, not a contractual SLA.
              </p>
            </div>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-200 mb-1">Active Holds tasks</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.activeHoldsTasks}</p>
              </div>
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-200 mb-1">Order age 5+ days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.agingTasks}</p>
              </div>
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Order age 3–4 days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.approachingTasks}</p>
              </div>
              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-green-200 mb-1">Unassigned active</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.unassignedTasks}</p>
              </div>
            </div>

            {/* Queue Distribution */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Active queues</h3>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                {HOLDS_ACTIVE_WORKFLOW_QUEUES.map((queue) => (
                  <div key={queue} className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="font-medium text-white">{queue}</p>
                    <p className="text-2xl font-bold text-blue-300">{analytics.queueStats[queue] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Imported priority (collapsed) */}
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowImportedPriority((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.06] text-left text-sm font-medium text-white/90 hover:bg-white/[0.08]"
              >
                <span>Imported priority distribution</span>
                <span className="text-white/50">{showImportedPriority ? "−" : "+"}</span>
              </button>
              {showImportedPriority && (
                <div className="p-3 space-y-3 border-t border-white/10">
                  <p className="text-xs text-white/55">{HOLDS_PRIORITY_IMPORT_NOTE}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(analytics.priorityStats)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([priority, count]) => (
                        <div key={priority} className="p-3 bg-white/5 rounded-lg border border-white/10">
                          <p className="font-medium text-white">Priority {priority}</p>
                          <p className="text-2xl font-bold text-purple-300">{count}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Aging Breakdown */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Active tasks by order age</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <p className="font-medium text-green-200">0–2 days (or no order date)</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown['0-2 days']}</p>
                </div>
                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                  <p className="font-medium text-yellow-200">3–4 days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown['3-4 days']}</p>
                </div>
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="font-medium text-red-200">5+ days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown['5+ days']}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "aging" && agingReport && (
          <div className="space-y-6">
            <div className="p-3 rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white/70 space-y-2">
              <p>
                <span className="font-medium text-white/90">Active order age</span> lists the same{" "}
                <span className="text-white/85">open Holds inventory</span> as Queue Health (four active queues only).
                Buckets use days since <span className="text-white/85">holdsOrderDate</span> — not time-in-queue SLA.
              </p>
            </div>
            {/* Aging Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-200 mb-1">Order age 5+ days</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.aging}</p>
              </div>
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Order age 3–4 days</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.approaching}</p>
              </div>
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-200 mb-1">Total active / pending</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.totalActive}</p>
              </div>
              <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-orange-200 mb-1">Unassigned active</h3>
                <p className="text-2xl font-bold text-white">{agingReport.summary.unassigned}</p>
              </div>
            </div>

            {/* Aging Tasks List */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Active tasks: order age 5+ days</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {agingReport.agingTasks.slice(0, 20).map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-red-900/10 border border-red-500/30 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">
                          {task.customerName || 'Unknown Customer'}
                        </p>
                        <p className="text-sm text-white/60">
                          Order: {task.orderNumber || 'N/A'} | 
                          Email: {task.customerEmail || 'N/A'}
                        </p>
                        <p className="text-sm text-white/60">
                          Queue: {task.holdsStatus ?? 'N/A'} | Imported priority: {task.priority ?? '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="px-2 py-1 bg-red-900/50 text-red-200 rounded text-xs font-medium">
                          {task.daysSinceOrder == null ? '—' : `${task.daysSinceOrder} days`}
                        </div>
                        {task.assignedTo && (
                          <p className="text-xs text-blue-300 mt-1">
                            {task.assignedTo.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {agingReport.agingTasks.length > 20 && (
                  <p className="text-center text-white/60 text-sm">
                    ... and {agingReport.agingTasks.length - 20} more aging tasks
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Active tasks: order age 3–4 days</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {agingReport.approachingTasks.slice(0, 20).map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-yellow-900/10 border border-yellow-500/30 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">
                          {task.customerName || 'Unknown Customer'}
                        </p>
                        <p className="text-sm text-white/60">
                          Order: {task.orderNumber || 'N/A'} |
                          Email: {task.customerEmail || 'N/A'}
                        </p>
                        <p className="text-sm text-white/60">
                          Queue: {task.holdsStatus ?? 'N/A'} | Imported priority: {task.priority ?? '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="px-2 py-1 bg-yellow-900/50 text-yellow-200 rounded text-xs font-medium">
                          {task.daysSinceOrder == null ? '—' : `${task.daysSinceOrder} days`}
                        </div>
                        {task.assignedTo && (
                          <p className="text-xs text-blue-300 mt-1">
                            {task.assignedTo.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {agingReport.approachingTasks.length > 20 && (
                  <p className="text-center text-white/60 text-sm">
                    ... and {agingReport.approachingTasks.length - 20} more approaching tasks
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
      </Card>

      {/* Warehouse Export (separate card below) */}
      {activeTab === "resolved-comments" && (
        <div className="mt-6">
          <ResolvedOrdersReportWithComments />
        </div>
      )}

      {/* Daily Activity (separate card below) */}
      {activeTab === "daily-breakdown" && (
        <div className="mt-6">
          <DailyBreakdown />
        </div>
      )}
    </div>
  );
}
