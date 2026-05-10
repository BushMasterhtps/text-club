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
    orderAge3Days: number;
    orderAge4Days: number;
    unassignedTasks: number;
  };
  queueStats: Record<string, number>;
  agingBreakdown: {
    "0-2 days": number;
    "3 days": number;
    "4 days": number;
    "5+ days": number;
  };
  agingTasks: AgingTaskRow[];
  tasksOrderAge3Days: AgingTaskRow[];
  tasksOrderAge4Days: AgingTaskRow[];
}

type AgingTaskRow = {
  id: string;
  orderNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  orderDate: string | null;
  daysSinceOrder: number | null;
  isAging5Plus: boolean;
  holdsStatus: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
};

function renderTaskList(
  title: string,
  tasks: AgingTaskRow[],
  accent: "red" | "amber" | "yellow"
) {
  const border =
    accent === "red"
      ? "border-red-500/30 bg-red-900/10"
      : accent === "amber"
        ? "border-amber-500/30 bg-amber-900/10"
        : "border-yellow-500/30 bg-yellow-900/10";
  const badge =
    accent === "red"
      ? "bg-red-900/50 text-red-200"
      : accent === "amber"
        ? "bg-amber-900/50 text-amber-200"
        : "bg-yellow-900/50 text-yellow-200";

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="max-h-96 overflow-y-auto space-y-2">
        {tasks.slice(0, 20).map((task) => (
          <div key={task.id} className={`p-3 rounded-lg border ${border}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-white">{task.customerName || "Unknown Customer"}</p>
                <p className="text-sm text-white/60">
                  Order: {task.orderNumber || "N/A"} | Email: {task.customerEmail || "N/A"}
                </p>
                <p className="text-sm text-white/60">Queue: {task.holdsStatus ?? "N/A"}</p>
              </div>
              <div className="text-right">
                <div className={`px-2 py-1 rounded text-xs font-medium ${badge}`}>
                  {task.daysSinceOrder == null ? "—" : `${task.daysSinceOrder} days`}
                </div>
                {task.assignedTo && <p className="text-xs text-blue-300 mt-1">{task.assignedTo.name}</p>}
              </div>
            </div>
          </div>
        ))}
        {tasks.length > 20 && (
          <p className="text-center text-white/60 text-sm">... and {tasks.length - 20} more</p>
        )}
        {tasks.length === 0 && <p className="text-white/50 text-sm">No open work in this bucket.</p>}
      </div>
    </div>
  );
}

export default function HoldsAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "resolved-comments" | "daily-breakdown">("overview");

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
    queueMicrotask(() => {
      void fetchAnalytics();
    });
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <Card>
        <h2 className="text-xl font-semibold mb-4">Holds Analytics</h2>
        <div className="text-white/60">Loading…</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-xl font-semibold mb-4">Holds Analytics</h2>

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
            <p className="text-sm text-white/70 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.04]">
              Queue Health shows current open Holds workload by queue. Completed orders and duplicate exceptions are
              separated so this view reflects work that still needs action. Order age is based on the order/import date
              — use it to spot work that may need attention soon.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-blue-200 mb-1">Open Holds Work</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.actionableOpenHoldsTasks}</p>
                <p className="text-xs text-white/45 mt-1">Agent Research, Customer Contact, Escalated</p>
              </div>
              <div className="p-4 bg-slate-900/40 border border-white/20 rounded-lg">
                <h3 className="text-sm font-medium text-slate-200 mb-1">Duplicate Exceptions</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.duplicateExceptions}</p>
                <p className="text-xs text-white/45 mt-1">Not included in Open Holds Work</p>
              </div>
              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-green-200 mb-1">Unassigned Open Work</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.unassignedTasks}</p>
              </div>
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-red-200 mb-1">Order Age 5+ Days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.agingTasks}</p>
              </div>
              <div className="p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-amber-200 mb-1">Order Age 4 Days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.orderAge4Days}</p>
              </div>
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Order Age 3 Days</h3>
                <p className="text-2xl font-bold text-white">{analytics.overview.orderAge3Days}</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Main queues</h3>
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
              <h3 className="text-lg font-semibold mb-3">Open work by order age</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <p className="font-medium text-green-200">Order Age 0–2 Days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["0-2 days"]}</p>
                  <p className="text-[10px] text-white/40 mt-1">Includes orders with no import date</p>
                </div>
                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                  <p className="font-medium text-yellow-200">Order Age 3 Days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["3 days"]}</p>
                </div>
                <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                  <p className="font-medium text-amber-200">Order Age 4 Days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["4 days"]}</p>
                </div>
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="font-medium text-red-200">Order Age 5+ Days</p>
                  <p className="text-2xl font-bold text-white">{analytics.agingBreakdown["5+ days"]}</p>
                </div>
              </div>
            </div>

            {renderTaskList("Open work: Order Age 5+ Days", analytics.agingTasks, "red")}
            {renderTaskList("Open work: Order Age 4 Days", analytics.tasksOrderAge4Days, "amber")}
            {renderTaskList("Open work: Order Age 3 Days", analytics.tasksOrderAge3Days, "yellow")}
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
