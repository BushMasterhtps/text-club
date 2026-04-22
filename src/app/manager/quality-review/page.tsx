"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/app/_components/DashboardLayout";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import { computeQualityReviewScores } from "@/lib/quality-review-scoring";
import { buildOrderedMetadataRows } from "@/lib/quality-review-task-display";
import { QaSprintSummary } from "@/app/manager/quality-review/_components/QaSprintSummary";
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

type ActiveTemplateInfo = {
  templateId: string;
  templateVersionId: string;
  displayName: string;
  slug: string;
  version: number;
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

type DispositionOption = { value: string; count: number; label: string };

type PreviewTask = {
  id: string;
  taskType: string;
  disposition: string | null;
  endTime: string | null;
  brand: string | null;
  textPreview: string | null;
};

type EligibilityData = {
  totalEligible: number;
  countsByTaskType: Record<string, number>;
  countsByDisposition: DispositionOption[];
  previewTasks: PreviewTask[];
};

type ScoreFeedback = {
  earnedWeight: number;
  possibleWeight: number;
  weightedPercent: number;
  weightedScore: number;
  failedCriticalCount: number;
  scoreCap: number | null;
  finalScore: number;
};

const DISPOSITION_ALL = "__ALL__";
/** Must match API / eligibility filter for null/empty disposition. */
const DISPOSITION_NONE = "__NONE__";

const NO_DISPOSITION_LABEL = "No disposition";

function formatDispositionDisplay(value: string | null | undefined): string {
  if (value == null || value === "") return NO_DISPOSITION_LABEL;
  if (value === DISPOSITION_NONE) return NO_DISPOSITION_LABEL;
  return value;
}

function clampSample(n: number) {
  if (!Number.isFinite(n)) return 5;
  return Math.min(100, Math.max(1, Math.round(n)));
}

function formatCompletedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function QualityReviewContent() {
  const { timeLeft, extendSession, showWarning } = useAutoLogout();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [subjectAgentId, setSubjectAgentId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("TEXT_CLUB");
  const [dispositionChoice, setDispositionChoice] = useState(DISPOSITION_ALL);
  const [wodSource, setWodSource] = useState<WodIvcsSource | "">("");
  const [sampleSizeInput, setSampleSizeInput] = useState("5");

  const sampleSize = useMemo(() => clampSample(parseInt(sampleSizeInput, 10)), [sampleSizeInput]);

  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<ActiveTemplateInfo | null>(null);
  const [loadingActiveTemplate, setLoadingActiveTemplate] = useState(false);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
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
  const [lastScores, setLastScores] = useState<ScoreFeedback | null>(null);
  const [summaryRows, setSummaryRows] = useState<
    Array<{ taskId: string; finalScore: number | null; status: string }>
  >([]);

  /** Eligibility preview: expanded snippet per task id */
  const [previewSnippetExpanded, setPreviewSnippetExpanded] = useState<Record<string, boolean>>({});
  /** Mobile / small screens: expanded live score drawer */
  const [mobileLiveScoreOpen, setMobileLiveScoreOpen] = useState(false);
  const [taskMoreFieldsOpen, setTaskMoreFieldsOpen] = useState(false);
  const [taskPrimaryTextExpanded, setTaskPrimaryTextExpanded] = useState(false);

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
      setLoadingActiveTemplate(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/manager/quality-review/templates/active?taskType=${taskType}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Failed to resolve active template");
        if (cancelled) return;
        setActiveTemplate((json.data as ActiveTemplateInfo | null) ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          console.error("[quality-review] active template", e);
          setActiveTemplate(null);
        }
      } finally {
        if (!cancelled) setLoadingActiveTemplate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskType]);

  useEffect(() => {
    if (!subjectAgentId || !startDate || !endDate) {
      setEligibility(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const agent = subjectAgentId;
      const start = startDate;
      const end = endDate;
      const tt = taskType;
      const ws = wodSource;
      const disp = dispositionChoice;
      void (async () => {
        setLoadingEligibility(true);
        setError(null);
        try {
          const params = new URLSearchParams({
            agentId: agent,
            startDate: start,
            endDate: end,
            taskType: tt,
          });
          if (disp && disp !== DISPOSITION_ALL) {
            params.set("disposition", disp === DISPOSITION_NONE ? DISPOSITION_NONE : disp);
          }
          if (tt === "WOD_IVCS" && ws) params.set("wodIvcsSource", ws);

          const res = await fetch(`/api/manager/quality-review/eligibility?${params}`, {
            credentials: "include",
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error || "Eligibility failed");
          setEligibility({
            totalEligible: json.data.totalEligible,
            countsByTaskType: json.data.countsByTaskType ?? {},
            countsByDisposition: json.data.countsByDisposition ?? [],
            previewTasks: json.data.previewTasks ?? [],
          });
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Eligibility failed");
          setEligibility(null);
        } finally {
          setLoadingEligibility(false);
        }
      })();
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subjectAgentId, startDate, endDate, taskType, wodSource, dispositionChoice]);

  const dispositionOptionsForSelect = useMemo(() => {
    const opts = (eligibility?.countsByDisposition ?? []).map((o) => ({
      ...o,
      label:
        o.value === DISPOSITION_NONE
          ? `${NO_DISPOSITION_LABEL} (${o.count})`
          : `${o.value} (${o.count})`,
    }));
    return [{ value: DISPOSITION_ALL, count: 0, label: "All dispositions" }, ...opts];
  }, [eligibility]);

  const previewTasksSorted = useMemo(() => {
    const list = eligibility?.previewTasks ?? [];
    return [...list].sort((a, b) => {
      const ta = a.endTime ? new Date(a.endTime).getTime() : 0;
      const tb = b.endTime ? new Date(b.endTime).getTime() : 0;
      return tb - ta;
    });
  }, [eligibility]);

  const liveScorePreview = useMemo(() => {
    if (!taskPayload) return null;
    const map = new Map<string, QAReviewLineResponse>();
    for (const line of taskPayload.lines) {
      const r = responses[line.id];
      if (!r) return { error: "missing_line" as const };
      map.set(line.id, r);
    }
    const linesForScore = taskPayload.lines.map((l) => ({
      id: l.id,
      weight: { toNumber: () => Number(l.weight) },
      isCritical: l.isCritical,
      allowNa: l.allowNa,
    }));
    try {
      return { breakdown: computeQualityReviewScores(linesForScore, map) };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("NO_APPLICABLE_LINES")) return { error: "no_applicable" as const };
      if (msg.startsWith("NA_NOT_ALLOWED")) return { error: "na_not_allowed" as const };
      return { error: "other" as const };
    }
  }, [taskPayload, responses]);

  useEffect(() => {
    if (step !== "review") setMobileLiveScoreOpen(false);
  }, [step]);

  useEffect(() => {
    setPreviewSnippetExpanded({});
  }, [eligibility]);

  const liveScoreInner = useMemo(() => {
    if (!liveScorePreview) {
      return <p className="text-xs text-white/45">Load a task to see the estimate.</p>;
    }
    if ("breakdown" in liveScorePreview) {
      const b = liveScorePreview.breakdown;
      return (
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-white/45">Earned weight</dt>
            <dd className="font-mono text-white tabular-nums">{b.earnedWeight.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-white/45">Possible weight</dt>
            <dd className="font-mono text-white tabular-nums">{b.possibleWeight.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-white/10 pt-2">
            <dt className="text-white/45">Weighted %</dt>
            <dd className="font-semibold text-violet-200 tabular-nums">{b.weightedPercent.toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-white/45">Critical fails</dt>
            <dd className="tabular-nums text-white">{b.failedCriticalCount}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-white/45">Score cap</dt>
            <dd className="tabular-nums text-white">{b.scoreCap != null ? `${b.scoreCap}%` : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-white/10 pt-3">
            <dt className="text-white/60 font-medium">Projected final</dt>
            <dd className="text-lg font-bold text-emerald-300 tabular-nums">{b.finalScore.toFixed(1)}%</dd>
          </div>
        </dl>
      );
    }
    return (
      <div className="text-xs text-amber-200/85 leading-relaxed space-y-2">
        <p className="font-medium text-white/70">Preview unavailable</p>
        {liveScorePreview.error === "no_applicable" ? (
          <p>
            No scorable lines (all N/A or zero weight). Submit will be blocked until at least one
            line counts toward the score.
          </p>
        ) : liveScorePreview.error === "na_not_allowed" ? (
          <p>N/A is not allowed on one or more lines you marked N/A.</p>
        ) : (
          <p>Adjust responses to see a live estimate.</p>
        )}
      </div>
    );
  }, [liveScorePreview]);

  const liveScoreDisclaimer = (
    <p className="text-[10px] leading-snug text-white/38 mt-3 pt-2 border-t border-white/10">
      Live preview only — submit confirms the official score.
    </p>
  );

  useEffect(() => {
    if (!eligibility) return;
    const allowed = new Set([
      DISPOSITION_ALL,
      ...eligibility.countsByDisposition.map((o) => o.value),
    ]);
    if (!allowed.has(dispositionChoice)) setDispositionChoice(DISPOSITION_ALL);
  }, [eligibility, dispositionChoice]);

  const createBatch = async () => {
    if (!subjectAgentId || !startDate || !endDate) {
      setError("Select agent and date range.");
      return;
    }
    if (!activeTemplate) {
      setError(
        "No active checklist for this task type. Add or publish one under Quality Review → Templates."
      );
      return;
    }
    const batchSampleCount = sampleSize;
    if (!Number.isFinite(batchSampleCount) || batchSampleCount < 1 || batchSampleCount > 100) {
      setError("Sample size must be a number from 1 to 100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dispositionBody =
        dispositionChoice === DISPOSITION_ALL
          ? undefined
          : dispositionChoice === DISPOSITION_NONE
            ? DISPOSITION_NONE
            : dispositionChoice;

      const res = await fetch("/api/manager/quality-review/batches", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectAgentId,
          startDate,
          endDate,
          sampleCount: batchSampleCount,
          taskType,
          disposition: dispositionBody,
          wodIvcsSource: taskType === "WOD_IVCS" && wodSource ? wodSource : undefined,
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
      const msg = e instanceof Error ? e.message : "Batch creation failed";
      console.error("[quality-review] createBatch", e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const loadTask = async (bId: string, tId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/manager/quality-review/batches/${bId}/tasks/${tId}`, {
        credentials: "include",
      });
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
      setMobileLiveScoreOpen(false);
      setTaskMoreFieldsOpen(false);
      setTaskPrimaryTextExpanded(false);
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
      setLastScores(json.data.scores as ScoreFeedback);
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
            (
              bj.data.tasks as Array<{
                taskId: string;
                status: string;
                finalScore: number | null;
              }>
            ).map((t) => ({
              taskId: t.taskId,
              status: t.status,
              finalScore: t.finalScore,
            }))
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
    setDispositionChoice(DISPOSITION_ALL);
  };

  const headerActions = useMemo(
    () => (
      <>
        <ThemeToggle />
        <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
        <Link
          href="/manager/quality-review/dashboard"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
        >
          QA dashboard
        </Link>
        <Link
          href="/manager/quality-review/templates"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
        >
          Templates
        </Link>
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

  const taskHeaderSkipKeys = useMemo(() => {
    const t = taskPayload?.task as Record<string, unknown> | undefined;
    const s = new Set<string>();
    if (!t) return s;
    for (const k of ["brand", "status", "phone", "email"] as const) {
      const v = t[k];
      if (v != null && String(v).trim() !== "") s.add(k);
    }
    return s;
  }, [taskPayload]);

  const taskMetadataRows = useMemo(() => {
    if (!taskPayload?.task) return [];
    return buildOrderedMetadataRows(
      taskPayload.task as Record<string, unknown>,
      taskHeaderSkipKeys
    );
  }, [taskPayload, taskHeaderSkipKeys]);

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

  const filtersReady = Boolean(subjectAgentId && startDate && endDate);

  return (
    <DashboardLayout headerActions={headerActions}>
      <div className="max-w-5xl mx-auto space-y-10 text-white pb-16">
        <header className="border-b border-white/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300/90 mb-2">
            Manager tools
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Quality Review</h1>
          <p className="text-sm text-white/55 mt-3 max-w-2xl leading-relaxed">
            Review real completed tasks in a guided batch. Eligibility updates automatically from
            your filters. Scores use earned weight vs. applicable weight (N/A lines excluded), with
            a critical-failure cap.
          </p>
        </header>

        <QaSprintSummary />

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {step === "setup" && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white">New batch</h2>
                <p className="text-xs text-white/45 mt-1">
                  Step 1: scope the work. Step 2: confirm eligibility, then create the batch.
                </p>
              </div>
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 md:p-7 shadow-lg shadow-black/25">
              <h3 className="text-xs font-bold uppercase tracking-widest text-violet-200/80 mb-1">
                Scope & batch
              </h3>
              <p className="text-xs text-white/40 mb-5">Who, when, and what to sample.</p>
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="text-white/55">Agent</span>
                  <select
                    value={subjectAgentId}
                    onChange={(e) => setSubjectAgentId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
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
                    <span className="text-white/55">Start</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-white/55">End</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="text-white/55">Task type (required for batch)</span>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as TaskType)}
                    className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none"
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
                    <span className="text-white/55">WOD source (optional)</span>
                    <select
                      value={wodSource}
                      onChange={(e) => setWodSource((e.target.value || "") as WodIvcsSource | "")}
                      className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none"
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
                  <span className="text-white/55">Disposition</span>
                  <select
                    value={dispositionChoice}
                    onChange={(e) => setDispositionChoice(e.target.value)}
                    disabled={!filtersReady || loadingEligibility}
                    className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none disabled:opacity-50"
                  >
                    {dispositionOptionsForSelect.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-white/40 mt-1">
                    Options reflect completed work for this agent and date range (and task type).
                  </p>
                </label>
                <label className="block text-sm">
                  <span className="text-white/55">Sample size (1–100)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={sampleSizeInput}
                    onChange={(e) => setSampleSizeInput(e.target.value.replace(/[^\d]/g, ""))}
                    onBlur={() => setSampleSizeInput(String(clampSample(parseInt(sampleSizeInput, 10))))}
                    className="mt-1.5 w-full rounded-lg bg-neutral-950/80 px-3 py-2.5 text-white border border-white/15 focus:border-violet-400/60 focus:outline-none font-mono"
                  />
                </label>
                <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    Active checklist (auto)
                  </div>
                  {loadingActiveTemplate ? (
                    <p className="text-sm text-white/50">Loading template…</p>
                  ) : activeTemplate ? (
                    <>
                      <p className="text-sm text-white/90 font-medium">{activeTemplate.displayName}</p>
                      <p className="text-xs text-white/50">
                        Version {activeTemplate.version} · {activeTemplate.lineCount} lines ·{" "}
                        <span className="font-mono text-white/40">{activeTemplate.slug}</span>
                      </p>
                      <Link
                        href={`/manager/quality-review/templates/${activeTemplate.templateId}`}
                        className="inline-block text-xs text-violet-300 hover:text-violet-200 underline underline-offset-2"
                      >
                        Edit template
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-amber-200/90">
                      No active checklist for this task type.{" "}
                      <Link
                        href="/manager/quality-review/templates"
                        className="underline underline-offset-2 text-violet-300 hover:text-violet-200"
                      >
                        Configure templates
                      </Link>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      if (!filtersReady) return;
                      setLoadingEligibility(true);
                      setError(null);
                      const params = new URLSearchParams({
                        agentId: subjectAgentId,
                        startDate,
                        endDate,
                        taskType,
                      });
                      if (dispositionChoice && dispositionChoice !== DISPOSITION_ALL) {
                        params.set(
                          "disposition",
                          dispositionChoice === DISPOSITION_NONE
                            ? DISPOSITION_NONE
                            : dispositionChoice
                        );
                      }
                      if (taskType === "WOD_IVCS" && wodSource) params.set("wodIvcsSource", wodSource);
                      void fetch(`/api/manager/quality-review/eligibility?${params}`, {
                        credentials: "include",
                      })
                        .then((r) => r.json())
                        .then((json) => {
                          if (!json.success) throw new Error(json.error || "Eligibility failed");
                          setEligibility({
                            totalEligible: json.data.totalEligible,
                            countsByTaskType: json.data.countsByTaskType ?? {},
                            countsByDisposition: json.data.countsByDisposition ?? [],
                            previewTasks: json.data.previewTasks ?? [],
                          });
                        })
                        .catch((e: unknown) => {
                          setError(e instanceof Error ? e.message : "Eligibility failed");
                          setEligibility(null);
                        })
                        .finally(() => setLoadingEligibility(false));
                    }}
                    disabled={!filtersReady || loadingEligibility || busy}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium disabled:opacity-40"
                  >
                    {loadingEligibility ? "Refreshing…" : "Refresh eligibility"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void createBatch()}
                    disabled={
                      busy ||
                      !eligibility ||
                      eligibility.totalEligible < sampleSize ||
                      !activeTemplate ||
                      !filtersReady
                    }
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 shadow-md shadow-emerald-900/30"
                  >
                    Create batch & start
                  </button>
                </div>
                {eligibility && eligibility.totalEligible < sampleSize && (
                  <p className="text-sm text-amber-200/90">
                    Sample size ({sampleSize}) is larger than eligible tasks (
                    {eligibility.totalEligible}).
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/45 to-neutral-950/90 p-6 md:p-7 flex flex-col min-h-[320px] shadow-lg shadow-black/20">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-200/95">
                  Eligibility overview
                </h3>
                {loadingEligibility && filtersReady && (
                  <span className="text-xs text-white/45 animate-pulse">Updating…</span>
                )}
              </div>
              <p className="text-xs text-white/40 mb-4">
                Counts reflect reservable completed tasks for the current filters.
              </p>

              {!filtersReady && (
                <p className="text-sm text-white/45 flex-1">
                  Select an agent and date range to load eligible completed work (PST reporting
                  days).
                </p>
              )}

              {filtersReady && !eligibility && !loadingEligibility && (
                <p className="text-sm text-white/45">No data yet.</p>
              )}

              {eligibility && (
                <div className="space-y-5 flex-1 overflow-y-auto max-h-[520px] pr-1">
                  <div>
                    <div className="text-4xl font-bold text-white tracking-tight">
                      {eligibility.totalEligible}
                    </div>
                    <div className="text-xs text-white/50 uppercase tracking-wide mt-1">
                      eligible tasks (matches filters, not reserved)
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white/45 uppercase mb-2">
                      By task type
                    </h3>
                    <ul className="text-sm space-y-1 text-white/80">
                      {Object.entries(eligibility.countsByTaskType).map(([k, v]) => (
                        <li key={k} className="flex justify-between gap-4 border-b border-white/5 py-1">
                          <span className="font-mono text-xs">{k}</span>
                          <span className="text-emerald-200/90 font-medium">{v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white/45 uppercase mb-2">
                      By disposition
                    </h3>
                    <ul className="text-sm space-y-1 text-white/75 max-h-40 overflow-y-auto">
                      {eligibility.countsByDisposition.map((d) => (
                        <li key={d.value} className="flex justify-between gap-2 py-0.5">
                          <span
                            className="truncate text-xs text-white/85"
                            title={
                              d.value === DISPOSITION_NONE ? NO_DISPOSITION_LABEL : d.value
                            }
                          >
                            {d.value === DISPOSITION_NONE ? NO_DISPOSITION_LABEL : d.value}
                          </span>
                          <span className="text-emerald-200/80 shrink-0 tabular-nums">{d.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-white/45 uppercase mb-2">
                      Preview — recent completed
                    </h3>
                    <p className="text-[11px] text-white/35 mb-2">
                      Newest first · sample of tasks matching filters (not reserved).
                    </p>
                    <ul className="space-y-2.5">
                      {previewTasksSorted.length === 0 && (
                        <li className="text-sm text-white/40 py-2">No rows in preview.</li>
                      )}
                      {previewTasksSorted.map((t) => (
                        <li
                          key={t.id}
                          className="rounded-xl bg-black/35 border border-white/[0.08] p-3 shadow-sm transition-colors hover:border-white/15 hover:bg-black/40"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-white/5 pb-2 mb-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">
                              {t.taskType}
                            </span>
                            <span className="text-[11px] text-white/45 tabular-nums">
                              {formatCompletedAt(t.endTime)}
                            </span>
                          </div>
                          <dl className="grid grid-cols-1 gap-1.5 text-xs">
                            <div className="flex gap-2">
                              <dt className="text-white/40 shrink-0 w-20">Disposition</dt>
                              <dd className="text-white/85 min-w-0 truncate">
                                {formatDispositionDisplay(t.disposition)}
                              </dd>
                            </div>
                            {t.brand ? (
                              <div className="flex gap-2">
                                <dt className="text-white/40 shrink-0 w-20">Brand</dt>
                                <dd className="text-white/70 truncate">{t.brand}</dd>
                              </div>
                            ) : null}
                            <div className="flex gap-2">
                              <dt className="text-white/40 shrink-0 w-20">Task id</dt>
                              <dd className="font-mono text-[10px] text-violet-200/80 break-all">
                                {t.id}
                              </dd>
                            </div>
                          </dl>
                          {t.textPreview ? (
                            <div className="mt-2 border-t border-white/5 pt-2">
                              <p
                                className={`text-xs text-white/55 leading-snug whitespace-pre-wrap ${
                                  previewSnippetExpanded[t.id]
                                    ? "max-h-52 overflow-y-auto pr-0.5"
                                    : "line-clamp-2"
                                }`}
                                title={previewSnippetExpanded[t.id] ? undefined : t.textPreview}
                              >
                                {t.textPreview}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewSnippetExpanded((prev) => ({
                                    ...prev,
                                    [t.id]: !prev[t.id],
                                  }))
                                }
                                className="mt-1.5 text-[11px] font-medium text-violet-300/90 hover:text-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 rounded"
                                aria-expanded={Boolean(previewSnippetExpanded[t.id])}
                              >
                                {previewSnippetExpanded[t.id] ? "Show less" : "Show more"}
                              </button>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-white/30 italic border-t border-white/5 pt-2">
                              No text snippet
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
            </div>
          </div>
        )}

        {step === "review" && batchId && (
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-950/25 via-neutral-950/40 to-neutral-950/80 p-6 md:p-8 ring-1 ring-white/5 shadow-xl shadow-black/30 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-violet-300/90 mb-1">
                  Active review
                </p>
                <h2 className="text-xl font-semibold text-white">Task checklist</h2>
                <p className="text-xs text-white/40 mt-1">
                  Complete each line, then submit. A live score preview stays within reach on smaller
                  screens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void cancelBatch()}
                className="text-sm text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                Cancel batch
              </button>
            </div>

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8 lg:items-start">
              <div
                className={`space-y-6 min-w-0 ${
                  taskPayload
                    ? mobileLiveScoreOpen
                      ? "max-lg:pb-80"
                      : "max-lg:pb-40"
                    : ""
                }`}
              >
                {lastScores && (
                  <div className="rounded-xl border border-cyan-500/35 bg-cyan-950/50 px-4 py-4 text-sm text-cyan-50 space-y-2 shadow-inner">
                    <div className="font-semibold text-cyan-200/90 text-xs uppercase tracking-wide">
                      Last submission
                    </div>
                    <div>
                      Earned {lastScores.earnedWeight.toFixed(2)} / possible{" "}
                      {lastScores.possibleWeight.toFixed(2)} →{" "}
                      <span className="font-semibold">{lastScores.weightedPercent.toFixed(1)}%</span>
                    </div>
                    <div className="text-white/80">
                      Critical fails: {lastScores.failedCriticalCount}
                      {lastScores.scoreCap != null
                        ? ` · Cap at ${lastScores.scoreCap}%`
                        : " · No critical cap"}
                    </div>
                    <div className="text-lg font-bold text-white pt-1 border-t border-cyan-500/20">
                      Final score: {lastScores.finalScore.toFixed(1)}%
                    </div>
                  </div>
                )}

                {taskPayload && (
                  <div className="rounded-2xl border border-white/12 bg-neutral-950/60 p-6 md:p-7 space-y-6 ring-1 ring-white/5">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-white/45 mb-3">
                        Task context
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/80 border-b border-white/10 pb-5">
                        <div>
                          <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                            Task id
                          </div>
                          <div className="font-mono text-xs text-violet-200/90 break-all">
                            {currentTaskId}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                            Completed
                          </div>
                          <div className="tabular-nums">
                            {taskPayload.task.endTime
                              ? formatCompletedAt(String(taskPayload.task.endTime))
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                            Type
                          </div>
                          <div>{String(taskPayload.task.taskType)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                            Disposition
                          </div>
                          <div>
                            {formatDispositionDisplay(taskPayload.task.disposition as string | null)}
                          </div>
                        </div>
                        {taskPayload.task.brand != null &&
                          String(taskPayload.task.brand).trim() !== "" && (
                            <div>
                              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                                Brand
                              </div>
                              <div>{String(taskPayload.task.brand)}</div>
                            </div>
                          )}
                        {taskPayload.task.status != null &&
                          String(taskPayload.task.status).trim() !== "" && (
                            <div>
                              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                                Status
                              </div>
                              <div className="font-mono text-xs">{String(taskPayload.task.status)}</div>
                            </div>
                          )}
                        {taskPayload.task.phone != null &&
                          String(taskPayload.task.phone).trim() !== "" && (
                            <div>
                              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                                Phone
                              </div>
                              <div>{String(taskPayload.task.phone)}</div>
                            </div>
                          )}
                        {taskPayload.task.email != null &&
                          String(taskPayload.task.email).trim() !== "" && (
                            <div>
                              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
                                Email
                              </div>
                              <div className="break-all">{String(taskPayload.task.email)}</div>
                            </div>
                          )}
                      </div>

                      {(() => {
                        const assigned = taskPayload.task.assignedTo as
                          | { name?: string | null; email?: string | null }
                          | null
                          | undefined;
                        const completedBy = taskPayload.task.completedByUser as
                          | { name?: string | null; email?: string | null }
                          | null
                          | undefined;
                        if (!assigned && !completedBy) return null;
                        return (
                          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                            <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                              People
                            </div>
                            {assigned ? (
                              <div className="text-sm text-white/80">
                                <span className="text-white/45">Assigned to: </span>
                                {assigned.name || assigned.email || "—"}
                                {assigned.email && assigned.name ? (
                                  <span className="text-white/50"> ({assigned.email})</span>
                                ) : null}
                              </div>
                            ) : null}
                            {completedBy ? (
                              <div className="text-sm text-white/80">
                                <span className="text-white/45">Completed by: </span>
                                {completedBy.name || completedBy.email || "—"}
                                {completedBy.email && completedBy.name ? (
                                  <span className="text-white/50"> ({completedBy.email})</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {(() => {
                        const raw = taskPayload.task.rawMessage as
                          | Record<string, unknown>
                          | null
                          | undefined;
                        if (!raw || typeof raw !== "object") return null;
                        const bits = ["brand", "phone", "email", "text"] as const;
                        const hasAny = bits.some((k) => {
                          const v = raw[k];
                          return v != null && String(v).trim() !== "";
                        });
                        if (!hasAny) return null;
                        return (
                          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                            <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                              Source message
                            </div>
                            <dl className="grid gap-2 text-sm text-white/80">
                              {raw.brand != null && String(raw.brand).trim() !== "" ? (
                                <div className="flex gap-2">
                                  <dt className="text-white/45 w-24 shrink-0">Brand</dt>
                                  <dd className="min-w-0">{String(raw.brand)}</dd>
                                </div>
                              ) : null}
                              {raw.phone != null && String(raw.phone).trim() !== "" ? (
                                <div className="flex gap-2">
                                  <dt className="text-white/45 w-24 shrink-0">Phone</dt>
                                  <dd className="min-w-0">{String(raw.phone)}</dd>
                                </div>
                              ) : null}
                              {raw.email != null && String(raw.email).trim() !== "" ? (
                                <div className="flex gap-2">
                                  <dt className="text-white/45 w-24 shrink-0">Email</dt>
                                  <dd className="min-w-0 break-all">{String(raw.email)}</dd>
                                </div>
                              ) : null}
                              {raw.text != null && String(raw.text).trim() !== "" ? (
                                <div className="pt-1">
                                  <dt className="text-white/45 text-xs mb-1">Raw message text</dt>
                                  <dd className="text-xs text-white/70 whitespace-pre-wrap max-h-40 overflow-y-auto rounded-lg bg-black/30 p-2 border border-white/5">
                                    {String(raw.text)}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                          </div>
                        );
                      })()}
                    </div>
                    {(() => {
                      const taskText = String(taskPayload.task.text ?? "").trim();
                      const raw = taskPayload.task.rawMessage as Record<string, unknown> | null | undefined;
                      const rawText =
                        raw && typeof raw === "object" && raw.text != null
                          ? String(raw.text).trim()
                          : "";
                      const body = taskText || rawText;
                      if (!body) {
                        return (
                          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
                            No primary task text on this record. Check full task details below if
                            fields exist on other columns.
                          </div>
                        );
                      }
                      const label = taskText ? "Primary task text" : "Source message text (task.text empty)";
                      return (
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide">
                              {label}
                            </div>
                            <button
                              type="button"
                              onClick={() => setTaskPrimaryTextExpanded((e) => !e)}
                              className="text-[11px] font-medium text-violet-300/90 hover:text-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded px-1"
                            >
                              {taskPrimaryTextExpanded ? "More compact" : "Expand text area"}
                            </button>
                          </div>
                          <div
                            className={`text-sm text-white/85 whitespace-pre-wrap rounded-xl bg-black/35 p-4 border border-white/8 leading-relaxed overflow-y-auto transition-[max-height] duration-200 ${
                              taskPrimaryTextExpanded
                                ? "max-h-[min(75vh,36rem)]"
                                : "max-h-52"
                            }`}
                          >
                            {body}
                          </div>
                        </div>
                      );
                    })()}

                    {taskMetadataRows.length > 0 ? (
                      <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setTaskMoreFieldsOpen((o) => !o)}
                          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-white/90 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/40"
                          aria-expanded={taskMoreFieldsOpen}
                        >
                          <span>
                            Full task details
                            <span className="text-white/40 font-normal ml-2">
                              ({taskMetadataRows.length} fields)
                            </span>
                          </span>
                          <span className="text-white/45 text-xs shrink-0" aria-hidden>
                            {taskMoreFieldsOpen ? "▲" : "▼"}
                          </span>
                        </button>
                        {taskMoreFieldsOpen && (
                          <div className="border-t border-white/10 px-4 py-3 max-h-[min(55vh,28rem)] overflow-y-auto">
                            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
                              {taskMetadataRows.map((row) => (
                                <div
                                  key={row.key}
                                  className="flex flex-col gap-0.5 border-b border-white/5 pb-2 sm:border-0 sm:pb-0"
                                >
                                  <dt className="text-[11px] text-white/45">{row.label}</dt>
                                  <dd className="text-white/85 break-words">{row.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-8 pt-2">
                      {groupedLines.map(([key, lines]) => (
                        <div key={key}>
                          <h3 className="text-xs font-bold text-amber-200/95 mb-3 tracking-widest uppercase border-l-2 border-amber-400/60 pl-3">
                            {lines[0]?.sectionTitle}
                          </h3>
                          <div className="space-y-4">
                            {lines.map((line) => (
                              <div
                                key={line.id}
                                className="rounded-xl bg-white/[0.04] border border-white/10 p-4 md:p-5 space-y-3"
                              >
                                <div className="text-sm font-medium text-white">{line.label}</div>
                                {line.helpText && (
                                  <div className="text-xs text-white/45 leading-relaxed">{line.helpText}</div>
                                )}
                                <div className="text-xs text-white/35">
                                  Weight {Number(line.weight).toFixed(2)}
                                  {line.isCritical ? " · Critical" : ""}
                                  {line.allowNa ? " · N/A allowed" : ""}
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm">
                                  {(["PASS", "FAIL", "NA"] as const).map((opt) => (
                                    <label
                                      key={opt}
                                      className="inline-flex items-center gap-2 cursor-pointer select-none"
                                    >
                                      <input
                                        type="radio"
                                        className="accent-violet-500"
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
                                  className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <label className="block text-sm">
                      <span className="text-white/50 font-medium">Overall reviewer notes (optional)</span>
                      <textarea
                        value={reviewerNotes}
                        onChange={(e) => setReviewerNotes(e.target.value)}
                        rows={2}
                        className="mt-1.5 w-full rounded-lg bg-black/30 px-3 py-2 text-white border border-white/10"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitReview()}
                      className="w-full sm:w-auto px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold disabled:opacity-50 shadow-lg shadow-violet-950/40"
                    >
                      {busy ? "Saving…" : "Submit & next"}
                    </button>
                  </div>
                )}
              </div>

              {taskPayload && (
                <aside className="hidden lg:block lg:sticky lg:top-4 space-y-3 shrink-0">
                  <div className="rounded-xl border border-white/12 bg-neutral-900/90 p-4 shadow-lg">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-3">
                      Live score preview
                    </p>
                    {liveScoreInner}
                    {liveScoreDisclaimer}
                  </div>
                </aside>
              )}
            </div>

            {taskPayload && (
              <div
                className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-neutral-950/95 backdrop-blur-md shadow-[0_-12px_40px_rgba(0,0,0,0.5)]"
                style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
              >
                <button
                  type="button"
                  onClick={() => setMobileLiveScoreOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left min-h-[48px] hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/50"
                  aria-expanded={mobileLiveScoreOpen}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      Live score preview
                    </p>
                    {liveScorePreview && "breakdown" in liveScorePreview ? (
                      <p className="text-xs text-white/85 tabular-nums truncate">
                        <span className="text-white/50">E</span>{" "}
                        {liveScorePreview.breakdown.earnedWeight.toFixed(1)}/
                        {liveScorePreview.breakdown.possibleWeight.toFixed(1)}
                        <span className="text-white/40 mx-1.5">·</span>
                        {liveScorePreview.breakdown.weightedPercent.toFixed(0)}%
                        <span className="text-white/40 mx-1.5">·</span>
                        CF {liveScorePreview.breakdown.failedCriticalCount}
                        {liveScorePreview.breakdown.scoreCap != null && (
                          <>
                            <span className="text-white/40 mx-1.5">·</span>
                            cap {liveScorePreview.breakdown.scoreCap}%
                          </>
                        )}
                        <span className="text-white/40 mx-1.5">·</span>
                        <span className="font-semibold text-emerald-300">
                          → {liveScorePreview.breakdown.finalScore.toFixed(0)}%
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-amber-200/90 truncate">Tap for score details</p>
                    )}
                  </div>
                  <span className="shrink-0 text-white/45 text-xs" aria-hidden>
                    {mobileLiveScoreOpen ? "▲" : "▼"}
                  </span>
                </button>
                {mobileLiveScoreOpen && (
                  <div className="border-t border-white/10 px-3 pb-3 max-h-[42vh] overflow-y-auto overscroll-contain">
                    <div className="pt-3">{liveScoreInner}</div>
                    {liveScoreDisclaimer}
                  </div>
                )}
                {!mobileLiveScoreOpen && (
                  <p className="px-3 pb-2 pt-1 border-t border-white/10 text-center text-[10px] leading-snug text-white/35">
                    Live preview only — submit confirms the official score.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === "summary" && (
          <section className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-neutral-950 to-neutral-950 p-8 md:p-10 space-y-8 shadow-xl shadow-black/25 ring-1 ring-white/5">
            <div className="border-b border-white/10 pb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300/90 mb-2">
                Batch complete
              </p>
              <h2 className="text-2xl font-semibold text-white">Summary</h2>
              <p className="text-sm text-white/50 mt-3 max-w-xl leading-relaxed">
                Final % is the minimum of weighted % and the critical-failure cap when caps apply.
                N/A lines are excluded from the denominator.
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">
                Tasks in this batch
              </h3>
              <ul className="rounded-xl border border-white/12 overflow-hidden divide-y divide-white/8 bg-black/25">
                {summaryRows.map((r) => (
                  <li
                    key={r.taskId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-sm hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="font-mono text-xs text-violet-200/80 break-all min-w-0 flex-1">
                      {r.taskId}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-white/45 shrink-0">
                      {r.status}
                    </span>
                    {r.finalScore != null && (
                      <span className="font-semibold text-emerald-300 tabular-nums shrink-0 text-base">
                        {Number(r.finalScore).toFixed(1)}%
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={resetFlow}
              className="px-6 py-3 rounded-xl bg-white/12 hover:bg-white/18 text-white text-sm font-semibold border border-white/10"
            >
              Start new review
            </button>
          </section>
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
