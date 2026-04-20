"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/app/_components/DashboardLayout";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import type { QAReviewLineResponse, TaskType, WodIvcsSource } from "@prisma/client";

type AgentRow = { id: string; email: string; name: string | null };

const TASK_TYPES: TaskType[] = [
  "TEXT_CLUB",
  "EMAIL_REQUESTS",
  "YOTPO",
  "WOD_IVCS",
];

const WOD_SOURCES: WodIvcsSource[] = [
  "INVALID_CASH_SALE",
  "ORDERS_NOT_DOWNLOADING",
  "SO_VS_WEB_DIFFERENCE",
];

type TemplateRow = {
  templateVersionId: string;
  displayName: string;
  slug: string;
  wodIvcsSource: WodIvcsSource | null;
  lineCount: number;
};

type LineRow = {
  id: string;
  slug: string;
  sectionOrder: number;
  sectionTitle: string;
  lineOrder: number;
  label: string;
  helpText: string | null;
  weight: unknown;
  isCritical: boolean;
  allowNa: boolean;
};

function QualityReviewContent() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [subjectAgentId, setSubjectAgentId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("TEXT_CLUB");
  const [disposition, setDisposition] = useState("");
  const [wodSource, setWodSource] = useState<WodIvcsSource | "">("");
  const [sampleSize, setSampleSize] = useState(5);
  const [templateVersionId, setTemplateVersionId] = useState("");

  const [eligibility, setEligibility] = useState<{
    totalEligible: number;
    countsByTaskType: Record<string, number>;
  } | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [step, setStep] = useState<"setup" | "review" | "summary">("setup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [taskPayload, setTaskPayload] = useState<{
    lines: LineRow[];
    task: Record<string, unknown>;
  } | null>(null);
  const [responses, setResponses] = useState<Record<string, QAReviewLineResponse>>({});
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [lastScores, setLastScores] = useState<{
    weightedScore: number;
    failedCriticalCount: number;
    scoreCap: number;
    finalScore: number;
  } | null>(null);
  const [summaryRows, setSummaryRows] = useState<
    Array<{ taskId: string; finalScore: number | null; status: string }>
  >([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/manager/agents", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.agents ?? data.data ?? []) as AgentRow[];
      setAgents(Array.isArray(list) ? list : []);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTemplates(true);
      setError(null);
      try {
        const res = await fetch(`/api/manager/quality-review/templates?taskType=${taskType}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Failed to load templates");
        const rows = (json.data ?? []) as TemplateRow[];
        if (cancelled) return;
        setTemplates(rows);
        setTemplateVersionId((prev) =>
          rows.length === 0
            ? ""
            : rows.some((r) => r.templateVersionId === prev)
              ? prev
              : rows[0]!.templateVersionId
        );
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Template load failed");
          setTemplates([]);
          setTemplateVersionId("");
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskType]);

  const fetchEligibility = async () => {
    if (!subjectAgentId || !startDate || !endDate) {
      setError("Select agent and date range.");
      return;
    }
    setLoadingEligibility(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        agentId: subjectAgentId,
        startDate,
        endDate,
        taskType,
      });
      if (disposition.trim()) params.set("disposition", disposition.trim());
      if (taskType === "WOD_IVCS" && wodSource) params.set("wodIvcsSource", wodSource);

      const res = await fetch(`/api/manager/quality-review/eligibility?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Eligibility failed");
      setEligibility({
        totalEligible: json.data.totalEligible,
        countsByTaskType: json.data.countsByTaskType,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eligibility failed");
      setEligibility(null);
    } finally {
      setLoadingEligibility(false);
    }
  };

  const createBatch = async () => {
    if (!subjectAgentId || !startDate || !endDate) {
      setError("Select agent and date range.");
      return;
    }
    if (!templateVersionId) {
      setError("Select a checklist template.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/manager/quality-review/batches", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectAgentId,
          startDate,
          endDate,
          sampleCount: sampleSize,
          taskType,
          disposition: disposition.trim() || undefined,
          wodIvcsSource: taskType === "WOD_IVCS" && wodSource ? wodSource : undefined,
          templateVersionId,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not create batch");
      setBatchId(json.data.batchId);
      const first = json.data.taskIds?.[0] as string | undefined;
      setCurrentTaskId(first ?? null);
      setStep("review");
      if (first) await loadTask(json.data.batchId, first);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Batch creation failed");
    } finally {
      setBusy(false);
    }
  };

  const loadTask = async (bId: string, tId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/manager/quality-review/batches/${bId}/tasks/${tId}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load task");
      setTaskPayload({ lines: json.data.lines, task: json.data.task });
      const init: Record<string, QAReviewLineResponse> = {};
      for (const line of json.data.lines as LineRow[]) {
        init[line.id] = "PASS";
      }
      setResponses(init);
      setLineComments({});
      setReviewerNotes("");
      setLastScores(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Task load failed");
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (!batchId || !currentTaskId || !taskPayload) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        responses: taskPayload.lines.map((line) => ({
          lineId: line.id,
          response: responses[line.id]!,
          comment: lineComments[line.id]?.trim() || undefined,
        })),
        reviewerNotes: reviewerNotes.trim() || undefined,
      };
      const res = await fetch(
        `/api/manager/quality-review/batches/${batchId}/tasks/${currentTaskId}/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Submit failed");
      setLastScores(json.data.scores);
      const next = json.data.nextTaskId as string | null | undefined;
      if (next) {
        setCurrentTaskId(next);
        await loadTask(batchId, next);
      } else {
        const br = await fetch(`/api/manager/quality-review/batches/${batchId}`, {
          credentials: "include",
        });
        const bj = await br.json();
        if (bj.success) {
          setSummaryRows(
            (bj.data.tasks as Array<{ taskId: string; status: string; finalScore: number | null }>).map(
              (t) => ({
                taskId: t.taskId,
                status: t.status,
                finalScore: t.finalScore,
              })
            )
          );
        }
        setStep("summary");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  const cancelBatch = async () => {
    if (!batchId) return;
    if (!window.confirm("Cancel this Quality Review batch and release reserved tasks?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/manager/quality-review/batches/${batchId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Cancel failed");
      resetFlow();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const resetFlow = () => {
    setBatchId(null);
    setStep("setup");
    setCurrentTaskId(null);
    setTaskPayload(null);
    setEligibility(null);
    setLastScores(null);
    setSummaryRows([]);
  };

  const headerActions = useMemo(
    () => (
      <>
        <ThemeToggle />
        <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
        <Link
          href="/manager"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
        >
          ← Manager
        </Link>
      </>
    ),
    [timeLeft, extendSession]
  );

  const groupedLines = useMemo(() => {
    if (!taskPayload) return [];
    const map = new Map<string, LineRow[]>();
    for (const line of taskPayload.lines) {
      const k = `${line.sectionOrder}::${line.sectionTitle}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(line);
    }
    return Array.from(map.entries()).sort(([ka], [kb]) => {
      const oa = Number(ka.split("::")[0] ?? 0);
      const ob = Number(kb.split("::")[0] ?? 0);
      return oa - ob;
    });
  }, [taskPayload]);

  return (
    <DashboardLayout headerActions={headerActions}>
      <div className="max-w-3xl mx-auto space-y-6 text-white">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quality Review</h1>
          <p className="text-sm text-white/60 mt-1">
            Sample completed work, review one task at a time, and record scores.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {step === "setup" && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <h2 className="text-lg font-medium text-white/90">1. Filters</h2>
            <label className="block text-sm">
              <span className="text-white/60">Agent</span>
              <select
                value={subjectAgentId}
                onChange={(e) => setSubjectAgentId(e.target.value)}
                className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
              >
                <option value="">Select…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.email} ({a.email})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-white/60">Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/60">End date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-white/60">Task type</span>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {taskType === "WOD_IVCS" && (
              <label className="block text-sm">
                <span className="text-white/60">WOD source (optional filter)</span>
                <select
                  value={wodSource}
                  onChange={(e) => setWodSource((e.target.value || "") as WodIvcsSource | "")}
                  className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
                >
                  <option value="">All sources</option>
                  {WOD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="text-white/60">Disposition (optional)</span>
              <input
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                placeholder="Exact value, Spam, or Answered in SF"
                className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10 placeholder:text-white/30"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/60">Sample size (1–100)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={sampleSize}
                onChange={(e) => setSampleSize(Number(e.target.value) || 1)}
                className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/60">Checklist template</span>
              <select
                value={templateVersionId}
                onChange={(e) => setTemplateVersionId(e.target.value)}
                disabled={loadingTemplates || templates.length === 0}
                className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
              >
                <option value="">
                  {loadingTemplates ? "Loading…" : templates.length ? "Select…" : "No template"}
                </option>
                {templates.map((t) => (
                  <option key={t.templateVersionId} value={t.templateVersionId}>
                    {t.displayName} ({t.lineCount} lines)
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => void fetchEligibility()}
                disabled={loadingEligibility || busy}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {loadingEligibility ? "Loading…" : "Preview eligibility"}
              </button>
              <button
                type="button"
                onClick={() => void createBatch()}
                disabled={
                  busy ||
                  !eligibility ||
                  eligibility.totalEligible < sampleSize ||
                  !templateVersionId
                }
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
              >
                Create batch & start
              </button>
            </div>

            {eligibility && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm space-y-2">
                <div className="text-white/80 font-medium">
                  Eligible tasks (not yet reserved or reviewed):{" "}
                  <span className="text-white">{eligibility.totalEligible}</span>
                </div>
                <ul className="text-white/60 list-disc list-inside">
                  {Object.entries(eligibility.countsByTaskType).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                </ul>
                {eligibility.totalEligible < sampleSize && (
                  <p className="text-amber-300/90">
                    Sample size exceeds eligible count for these filters.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "review" && batchId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-medium text-white/90">2. Review task</h2>
              <button
                type="button"
                onClick={() => void cancelBatch()}
                className="text-sm text-amber-300 hover:text-amber-200 underline"
              >
                Cancel batch
              </button>
            </div>

            {lastScores && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Last submit — weighted {lastScores.weightedScore.toFixed(1)}, cap{" "}
                {lastScores.scoreCap.toFixed(1)}, final {lastScores.finalScore.toFixed(1)} (critical
                fails: {lastScores.failedCriticalCount})
              </div>
            )}

            {taskPayload && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
                <div className="text-sm text-white/70 space-y-1">
                  <div>
                    <span className="text-white/50">Task</span>{" "}
                    <span className="font-mono text-white/90">{currentTaskId}</span>
                  </div>
                  <div>
                    <span className="text-white/50">Type</span>{" "}
                    {String(taskPayload.task.taskType)}
                  </div>
                  <div>
                    <span className="text-white/50">Disposition</span>{" "}
                    {(taskPayload.task.disposition as string) || "—"}
                  </div>
                  <div>
                    <span className="text-white/50">Completed</span>{" "}
                    {taskPayload.task.endTime
                      ? new Date(String(taskPayload.task.endTime)).toLocaleString()
                      : "—"}
                  </div>
                  {(taskPayload.task.text as string)?.slice(0, 400) && (
                    <div className="pt-2 text-white/80 whitespace-pre-wrap">
                      {(taskPayload.task.text as string).slice(0, 1200)}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 pt-4 space-y-6">
                  {groupedLines.map(([key, lines]) => (
                    <div key={key}>
                      <h3 className="text-sm font-semibold text-amber-200/90 mb-2">
                        {lines[0]?.sectionTitle}
                      </h3>
                      <div className="space-y-4">
                        {lines.map((line) => (
                          <div key={line.id} className="rounded-lg bg-black/20 p-3 space-y-2">
                            <div className="text-sm text-white/90">{line.label}</div>
                            {line.helpText && (
                              <div className="text-xs text-white/50">{line.helpText}</div>
                            )}
                            <div className="text-xs text-white/40">
                              Weight {Number(line.weight).toFixed(2)}
                              {line.isCritical ? " · Critical" : ""}
                              {line.allowNa ? " · N/A allowed" : ""}
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm">
                              {(["PASS", "FAIL", "NA"] as const).map((opt) => (
                                <label key={opt} className="inline-flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`line-${line.id}`}
                                    checked={responses[line.id] === opt}
                                    disabled={opt === "NA" && !line.allowNa}
                                    onChange={() =>
                                      setResponses((r) => ({
                                        ...r,
                                        [line.id]: opt,
                                      }))
                                    }
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                            <input
                              placeholder="Optional line note"
                              value={lineComments[line.id] ?? ""}
                              onChange={(e) =>
                                setLineComments((c) => ({ ...c, [line.id]: e.target.value }))
                              }
                              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <label className="block text-sm">
                  <span className="text-white/60">Overall reviewer notes (optional)</span>
                  <textarea
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white border border-white/10"
                  />
                </label>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitReview()}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Submit & next"}
                </button>
              </div>
            )}
          </div>
        )}

        {step === "summary" && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <h2 className="text-lg font-medium text-white/90">3. Batch complete</h2>
            <p className="text-sm text-white/60">Scores for this batch:</p>
            <ul className="text-sm space-y-1 font-mono text-white/80">
              {summaryRows.map((r) => (
                <li key={r.taskId}>
                  {r.taskId.slice(0, 12)}… — {r.status}
                  {r.finalScore != null ? ` — final ${Number(r.finalScore).toFixed(1)}` : ""}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={resetFlow}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
            >
              Start new review
            </button>
          </div>
        )}

        <AutoLogoutWarning
          isOpen={showWarning}
          timeLeft={timeLeft}
          onExtend={extendSession}
          onLogout={() => {
            localStorage.removeItem("currentRole");
            void fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        />
      </div>
    </DashboardLayout>
  );
}

export default function QualityReviewPage() {
  return (
    <DashboardNavigationProvider>
      <QualityReviewContent />
    </DashboardNavigationProvider>
  );
}
