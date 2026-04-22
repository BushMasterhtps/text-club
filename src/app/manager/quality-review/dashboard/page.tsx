"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import { getDefaultSprintYmdBounds, addDaysToYmd } from "@/lib/quality-review-sprint";
import { QA_COVERAGE_TARGET_REVIEWS_PER_AGENT } from "@/lib/quality-review-constants";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";

type CoverageRow = {
  agentId: string;
  name: string | null;
  email: string;
  reviewsCompleted: number;
  coverageTarget: number;
  coverageStatus: "complete" | "below" | "none";
  avgScore: number | null;
  lastReviewedAt: string | null;
  lastReviewedBy: { name: string | null; email: string } | null;
};

type ReviewHistoryRow = {
  id: string;
  taskId: string;
  taskType: string;
  batchId: string | null;
  parentReviewId: string | null;
  isCurrentVersion: boolean;
  regradeReason: string | null;
  status: string;
  submittedAt: string | null;
  finalScore: number | null;
  reviewerNotes: string | null;
  reviewer: { id: string; name: string | null; email: string };
  templateVersion: {
    id: string;
    version: number;
    template: { displayName: string; taskType: string; slug: string };
  };
  lineResultCount: number;
  lineResults: Array<{
    lineId: string;
    response: string;
    comment: string | null;
    labelSnapshot: string;
  }>;
};

function statusDot(status: CoverageRow["coverageStatus"]) {
  if (status === "complete") return "bg-emerald-400";
  if (status === "below") return "bg-amber-400";
  return "bg-red-400";
}

function DashboardInner() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const searchParams = useSearchParams();
  const defaultSprint = useMemo(() => getDefaultSprintYmdBounds(), []);

  const [startDate, setStartDate] = useState(
    () => searchParams.get("startDate") || defaultSprint.startYmd
  );
  const [endDate, setEndDate] = useState(
    () => searchParams.get("endDate") || defaultSprint.endYmd
  );
  const [agentQ, setAgentQ] = useState("");
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [coverageTarget, setCoverageTarget] = useState(QA_COVERAGE_TARGET_REVIEWS_PER_AGENT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [regradeFor, setRegradeFor] = useState<ReviewHistoryRow | null>(null);
  const [regradeMode, setRegradeMode] = useState<"same" | "latest">("same");
  const [regradeReason, setRegradeReason] = useState("");
  const [regradeBusy, setRegradeBusy] = useState(false);

  const loadCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = agentQ.trim() ? `&q=${encodeURIComponent(agentQ.trim())}` : "";
      const res = await fetch(
        `/api/manager/quality-review/dashboard/coverage?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}${q}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load coverage");
      setRows(json.data.rows as CoverageRow[]);
      setCoverageTarget(json.data.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, agentQ]);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  useEffect(() => {
    if (!selectedAgentId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `/api/manager/quality-review/dashboard/agents/${selectedAgentId}/reviews?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Failed to load history");
        if (!cancelled) setHistory(json.data.reviews as ReviewHistoryRow[]);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, startDate, endDate]);

  const groupedHistory = useMemo(() => {
    const m = new Map<string, ReviewHistoryRow[]>();
    for (const r of history) {
      if (!m.has(r.taskId)) m.set(r.taskId, []);
      m.get(r.taskId)!.push(r);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return ta - tb;
      });
    }
    return Array.from(m.entries()).sort((a, b) => {
      const ma = Math.max(...a[1].map((x) => (x.submittedAt ? new Date(x.submittedAt).getTime() : 0)));
      const mb = Math.max(...b[1].map((x) => (x.submittedAt ? new Date(x.submittedAt).getTime() : 0)));
      return mb - ma;
    });
  }, [history]);

  const applySprintShortcut = () => {
    const b = getDefaultSprintYmdBounds();
    setStartDate(b.startYmd);
    setEndDate(b.endYmd);
  };

  const startRegrade = async () => {
    if (!regradeFor || regradeReason.trim().length < 3) return;
    setRegradeBusy(true);
    try {
      const res = await fetch(
        `/api/manager/quality-review/task-reviews/${regradeFor.id}/regrade`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateMode: regradeMode,
            reason: regradeReason.trim(),
          }),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Regrade failed");
      window.location.href = `/manager/quality-review/regrade/${json.data.newReviewId}`;
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Regrade failed");
    } finally {
      setRegradeBusy(false);
    }
  };

  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <Link
        href="/manager/quality-review"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        ← Quality Review
      </Link>
      <Link
        href="/manager"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        Manager
      </Link>
    </>
  );

  return (
    <DashboardLayout headerActions={headerActions}>
      <AutoLogoutWarning show={showWarning} timeLeft={timeLeft} onExtend={extendSession} />
      <div className="max-w-6xl mx-auto space-y-8 text-white pb-16 px-4">
        <header className="border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300/90 mb-2">
            Manager tools
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">QA dashboard</h1>
          <p className="text-sm text-white/55 mt-2 max-w-2xl">
            Coverage uses the latest submitted review per task in the selected window. Regrades keep
            full history; only the current version counts toward averages and coverage.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-white/50 block">
              Start
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-white/50 block">
              End
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={applySprintShortcut}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-violet-500/25 text-violet-100 border border-violet-400/30"
            >
              Current 14-day sprint
            </button>
            <label className="text-xs text-white/50 block flex-1 min-w-[12rem]">
              Agent filter
              <input
                value={agentQ}
                onChange={(e) => setAgentQ(e.target.value)}
                placeholder="Name or email contains…"
                className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadCoverage()}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15"
            >
              Refresh
            </button>
          </div>
          <p className="text-[11px] text-white/40">
            Quick shift:{" "}
            <button
              type="button"
              className="underline text-violet-300/90"
              onClick={() => {
                setStartDate((sd) => addDaysToYmd(sd, -7));
                setEndDate((ed) => addDaysToYmd(ed, -7));
              }}
            >
              −1 week
            </button>{" "}
            (edit dates manually for precise ranges)
          </p>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/40 text-left text-[11px] uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2 tabular-nums">Reviews</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 tabular-nums">Avg score</th>
                  <th className="px-3 py-2">Last QA</th>
                  <th className="px-3 py-2">Last by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-white/45">
                      Loading…
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.agentId}
                      className={`hover:bg-white/[0.04] cursor-pointer ${
                        selectedAgentId === r.agentId ? "bg-violet-500/10" : ""
                      }`}
                      onClick={() =>
                        setSelectedAgentId((prev) => (prev === r.agentId ? null : r.agentId))
                      }
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full shrink-0 ${statusDot(r.coverageStatus)}`}
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.name || r.email}</div>
                            <div className="text-[11px] text-white/40 truncate">{r.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-white/85">{r.reviewsCompleted}</td>
                      <td className="px-3 py-2 tabular-nums text-white/55">{coverageTarget}</td>
                      <td className="px-3 py-2 text-white/70 capitalize">{r.coverageStatus}</td>
                      <td className="px-3 py-2 tabular-nums text-white/80">
                        {r.avgScore != null ? `${r.avgScore.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-white/55 whitespace-nowrap">
                        {r.lastReviewedAt
                          ? new Date(r.lastReviewedAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-white/55">
                        {r.lastReviewedBy?.name || r.lastReviewedBy?.email || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedAgentId && (
          <section className="rounded-2xl border border-violet-500/25 bg-neutral-950/60 p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">Review history</h2>
              <button
                type="button"
                className="text-xs text-white/50 hover:text-white underline"
                onClick={() => setSelectedAgentId(null)}
              >
                Close
              </button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-white/45">Loading history…</p>
            ) : groupedHistory.length === 0 ? (
              <p className="text-sm text-white/45">No submitted reviews in this window for tasks.</p>
            ) : (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                {groupedHistory.map(([taskId, chain]) => (
                  <div
                    key={taskId}
                    className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <div>
                        <span className="text-white/40">Task </span>
                        <span className="font-mono text-violet-200/90 break-all">{taskId}</span>
                      </div>
                      <div className="text-white/55">{chain[0]?.taskType}</div>
                    </div>
                    <ul className="space-y-2">
                      {chain.map((rev) => (
                        <li
                          key={rev.id}
                          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs space-y-1"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="text-white/45">
                              {rev.submittedAt
                                ? new Date(rev.submittedAt).toLocaleString()
                                : rev.status}
                            </span>
                            <span className="text-white/70">
                              v{rev.templateVersion.version} · {rev.templateVersion.template.displayName}
                            </span>
                          </div>
                          <div className="text-white/80">
                            Reviewer: {rev.reviewer.name || rev.reviewer.email} · Score:{" "}
                            {rev.finalScore != null ? `${rev.finalScore.toFixed(1)}%` : "—"}{" "}
                            {rev.isCurrentVersion ? (
                              <span className="text-emerald-300/90">· current</span>
                            ) : (
                              <span className="text-white/35">· superseded</span>
                            )}
                          </div>
                          {rev.regradeReason ? (
                            <div className="text-amber-200/80">Regrade reason: {rev.regradeReason}</div>
                          ) : null}
                          {rev.reviewerNotes ? (
                            <div className="text-white/50">Notes: {rev.reviewerNotes}</div>
                          ) : null}
                          {rev.status === "SUBMITTED" && rev.isCurrentVersion && (
                            <button
                              type="button"
                              onClick={() => {
                                setRegradeFor(rev);
                                setRegradeReason("");
                                setRegradeMode("same");
                              }}
                              className="mt-1 text-[11px] font-semibold text-violet-300 hover:text-violet-200"
                            >
                              Regrade review
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {regradeFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md w-full rounded-2xl border border-white/15 bg-neutral-950 p-5 space-y-4 shadow-2xl">
              <h3 className="text-lg font-semibold">Regrade review</h3>
              <p className="text-xs text-white/55">
                Original stays in history. You will complete a new checklist for the same task.
              </p>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tm"
                    checked={regradeMode === "same"}
                    onChange={() => setRegradeMode("same")}
                  />
                  Same template version (v{regradeFor.templateVersion.version})
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tm"
                    checked={regradeMode === "latest"}
                    onChange={() => setRegradeMode("latest")}
                  />
                  Latest active template for {regradeFor.templateVersion.template.taskType}
                </label>
              </div>
              <label className="block text-xs text-white/50">
                Reason (required)
                <textarea
                  value={regradeReason}
                  onChange={(e) => setRegradeReason(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm text-white"
                  placeholder="Coaching discussion, template change, scoring correction…"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-sm bg-white/10"
                  onClick={() => setRegradeFor(null)}
                  disabled={regradeBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white disabled:opacity-40"
                  disabled={regradeBusy || regradeReason.trim().length < 3}
                  onClick={() => void startRegrade()}
                >
                  {regradeBusy ? "…" : "Start regrade"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function QaDashboardPage() {
  return (
    <DashboardNavigationProvider>
      <Suspense
        fallback={
          <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
            Loading…
          </div>
        }
      >
        <DashboardInner />
      </Suspense>
    </DashboardNavigationProvider>
  );
}
