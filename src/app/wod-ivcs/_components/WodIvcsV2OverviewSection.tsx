"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type { WodIvcsQueuesSummary } from "@/lib/wod-ivcs/queues-summary-service";

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 to-sky-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const QUEUE_DISPLAY_ORDER = [
  { key: "NEEDS_ACTION" as const, label: "Needs Action", tone: "text-amber-300" },
  { key: "ASSIGNED" as const, label: "Assigned", tone: "text-sky-300" },
  { key: "IN_PROGRESS" as const, label: "In Progress", tone: "text-blue-300" },
  { key: "AWAITING_DROP_OFF" as const, label: "Awaiting Drop-Off", tone: "text-violet-300" },
  { key: "NEEDS_REVIEW" as const, label: "Needs Review", tone: "text-orange-300" },
  { key: "IT_REVIEW" as const, label: "IT Review", tone: "text-fuchsia-300" },
  { key: "COMPLETED" as const, label: "Completed", tone: "text-emerald-300" },
  { key: "ARCHIVED" as const, label: "Archived", tone: "text-white/40" },
];

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function ImportSummaryCard({
  title,
  item,
}: {
  title: string;
  item: WodIvcsQueuesSummary["recentImportSummary"]["lastNetSuite"];
}) {
  if (!item) {
    return (
      <div className="p-4 bg-white/5 rounded-lg border border-white/10">
        <div className="text-sm font-medium text-white/80">{title}</div>
        <p className="text-sm text-white/50 mt-2">No imports yet</p>
      </div>
    );
  }
  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
      <div className="flex justify-between items-start gap-2">
        <div className="text-sm font-medium text-white/80">{title}</div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            item.status === "COMPLETED"
              ? "bg-emerald-500/20 text-emerald-300"
              : item.status === "FAILED"
                ? "bg-red-500/20 text-red-300"
                : "bg-amber-500/20 text-amber-300"
          }`}
        >
          {item.status === "COMPLETED" ? "Completed" : item.status === "FAILED" ? "Failed" : item.status}
        </span>
      </div>
      <p className="text-xs text-white/50 mt-1 truncate" title={item.fileName}>
        {item.fileName}
      </p>
      <p className="text-xs text-white/40 mt-2">{fmtWhen(item.finishedAt ?? item.createdAt)}</p>
      <p className="text-sm text-white/70 mt-2">
        {item.parsedRows} rows parsed · {item.createdOrders} created · {item.updatedOrders} updated
        {item.errorRows > 0 && (
          <span className="text-red-400"> · {item.errorRows} errors</span>
        )}
      </p>
    </div>
  );
}

export function WodIvcsV2OverviewSection() {
  const [data, setData] = useState<WodIvcsQueuesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/manager/wod-ivcs/v2/queues/summary", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load overview");
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <p className="text-white/60">Loading WOD/IVCS overview…</p>;
  }

  if (error && !data) {
    return (
      <Card className="p-4 border border-red-500/30 bg-red-500/10">
        <p className="text-red-300">{error}</p>
        <SmallButton onClick={load} className="mt-3 bg-blue-600 hover:bg-blue-700">
          Retry
        </SmallButton>
      </Card>
    );
  }

  if (!data) return null;

  const liveCount = data.liveAgents.filter((a) => a.isLive).length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">WOD/IVCS Overview</h2>
          <p className="text-sm text-white/50 mt-1">
            Order-based metrics from imported NetSuite and Aging reports
          </p>
        </div>
        <SmallButton onClick={load} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading ? "Refreshing…" : "Refresh"}
        </SmallButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-4">
          <div className="text-sm text-white/60">Overall Progress</div>
          <div className="text-2xl font-bold mt-1">{data.progressPercentage}% done</div>
          <div className="mt-2">
            <ProgressBar value={data.progressPercentage} />
          </div>
          <p className="text-xs text-white/40 mt-2">
            {data.completedOrders} completed · {data.activeOrders} active orders
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Queue Health</div>
          <div className="text-2xl font-bold mt-1">{data.unassignedNeedsAction}</div>
          <p className="text-xs text-white/40 mt-1">Unassigned needs action</p>
          <p className="text-xs text-white/30 mt-2">
            {data.awaitingDropOff} awaiting drop-off · {data.needsReview + data.itReview} in review
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Completed Today</div>
          <div className="text-2xl font-bold mt-1">{data.completedToday}</div>
          <p className="text-xs text-white/40 mt-1" title={data.completedTodayNote}>
            Based on completed queue updates today
          </p>
        </Card>

        <Card className="p-4">
          <div className="text-sm text-white/60">Active Work</div>
          <div className="text-2xl font-bold mt-1">{data.activeWork}</div>
          <p className="text-xs text-white/40 mt-1">
            {data.assigned} assigned · {data.inProgress} in progress
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Queue breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {QUEUE_DISPLAY_ORDER.map(({ key, label, tone }) => (
            <div
              key={key}
              className="p-3 rounded-lg bg-white/5 border border-white/10 text-center"
            >
              <div className={`text-xl font-bold ${tone}`}>{data.queueCounts[key] ?? 0}</div>
              <div className="text-xs text-white/50 mt-1 leading-tight">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40 mt-4">
          Use Task Management for morning imports and queue assignment.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Live agent status</h3>
        <p className="text-sm text-white/50 mb-4">
          {liveCount} of {data.liveAgents.length} agents live · open WOD/IVCS orders assigned or in
          progress
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Open orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.liveAgents.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-white/50">
                    No agents found
                  </td>
                </tr>
              )}
              {data.liveAgents.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">
                    <div className="text-white">{a.name || a.email}</div>
                    {a.name && <div className="text-xs text-white/40">{a.email}</div>}
                  </td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        a.isLive ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50"
                      }`}
                    >
                      {a.isLive ? "Live" : "Paused"}
                    </span>
                  </td>
                  <td className="py-2 font-medium">{a.openOrderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Order age breakdown</h3>
        <p className="text-sm text-white/50 mb-4">Open operational orders (excludes completed/archived)</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="text-sm text-orange-300 mb-1">Medium (1–2 days)</div>
            <div className="text-2xl font-bold text-orange-400">{data.ageBuckets.medium}</div>
          </div>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="text-sm text-red-300 mb-1">High (3–4 days)</div>
            <div className="text-2xl font-bold text-red-400">{data.ageBuckets.high}</div>
          </div>
          <div className="p-4 bg-red-600/10 border border-red-600/20 rounded-lg">
            <div className="text-sm text-red-400 mb-1">Urgent (5+ days or 5+ aging flag)</div>
            <div className="text-2xl font-bold text-red-500">{data.ageBuckets.urgent}</div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent import summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImportSummaryCard title="Last NetSuite import" item={data.recentImportSummary.lastNetSuite} />
          <ImportSummaryCard title="Last Aging import" item={data.recentImportSummary.lastAging} />
        </div>
        <p className="text-xs text-white/40 mt-4">
          Full import history, reversal, and order inspection are in Import & Diagnostics.
        </p>
      </Card>
    </div>
  );
}
