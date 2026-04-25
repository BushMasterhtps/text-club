"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import { DashboardNavigationProvider } from "@/contexts/DashboardNavigationContext";
import type { QAReviewLineResponse } from "@prisma/client";
import { QaReviewTaskContext } from "@/app/manager/quality-review/_components/QaReviewTaskContext";
import {
  computeLiveScorePreviewResult,
  QaLiveScorePreviewBody,
  QA_LIVE_SCORE_DISCLAIMER,
} from "@/app/manager/quality-review/_components/qa-live-score-preview";
import { formatCompletedAt } from "@/app/manager/quality-review/_components/qa-review-formatters";

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

type ScoreFeedback = {
  earnedWeight: number;
  possibleWeight: number;
  weightedPercent: number;
  weightedScore: number;
  failedCriticalCount: number;
  scoreCap: number | null;
  finalScore: number;
};

type OriginalLineResult = {
  lineId: string;
  slug: string;
  response: QAReviewLineResponse;
  comment: string | null;
  labelSnapshot: string;
};

type OriginalReviewContext = {
  id: string;
  reviewer: { id: string; name: string | null; email: string };
  submittedAt: string | null;
  finalScore: number | null;
  templateVersion: {
    id: string;
    version: number;
    template: { displayName: string; taskType: string; slug: string };
  };
  parentTemplateVersionId: string;
  templateMode: "same" | "latest";
  lineResults: OriginalLineResult[];
};

function matchOriginalLineResult(
  line: LineRow,
  currentTemplateVersionId: string,
  original: OriginalReviewContext
): OriginalLineResult | null {
  const byLineId = new Map(original.lineResults.map((r) => [r.lineId, r]));
  const bySlug = new Map(original.lineResults.map((r) => [r.slug, r]));
  if (currentTemplateVersionId === original.parentTemplateVersionId) {
    return byLineId.get(line.id) ?? bySlug.get(line.slug) ?? null;
  }
  return bySlug.get(line.slug) ?? null;
}

function RegradeReviewPageContent() {
  const params = useParams<{ reviewId: string }>();
  const reviewId = params.reviewId;
  const router = useRouter();
  const { timeLeft, extendSession, showWarning } = useAutoLogout();

  const [lines, setLines] = useState<LineRow[]>([]);
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [templateVersionId, setTemplateVersionId] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    regradeReason: string | null;
    templateLabel: string;
    version: number;
  } | null>(null);
  const [originalContext, setOriginalContext] = useState<OriginalReviewContext | null>(null);
  const [responses, setResponses] = useState<Record<string, QAReviewLineResponse>>({});
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [lastScores, setLastScores] = useState<ScoreFeedback | null>(null);
  const [mobileLiveScoreOpen, setMobileLiveScoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/manager/quality-review/task-reviews/${reviewId}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Failed to load review");
        if (cancelled) return;
        const d = json.data;
        if (d.review.status !== "PENDING") {
          throw new Error("This review is not pending. Open it from the QA dashboard if needed.");
        }
        setLines(d.lines as LineRow[]);
        setTask(d.task as Record<string, unknown>);
        setTaskId(String(d.review.taskId));
        setTemplateVersionId(String(d.review.templateVersionId));
        setMeta({
          regradeReason: d.review.regradeReason,
          templateLabel: d.review.templateVersion?.template?.displayName ?? "Template",
          version: d.review.templateVersion?.version ?? 0,
        });
        setOriginalContext((d.originalReviewContext as OriginalReviewContext | null) ?? null);
        const init: Record<string, QAReviewLineResponse> = {};
        for (const line of d.lines as LineRow[]) {
          init[line.id] = "PASS";
        }
        setResponses(init);
        setLineComments({});
        setReviewerNotes("");
        setLastScores(null);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  const groupedLines = useMemo(() => {
    const map = new Map<string, LineRow[]>();
    for (const line of lines) {
      const k = `${line.sectionOrder}::${line.sectionTitle}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(line);
    }
    return Array.from(map.entries()).sort(([ka], [kb]) => {
      const oa = Number(ka.split("::")[0] ?? 0);
      const ob = Number(kb.split("::")[0] ?? 0);
      return oa - ob;
    });
  }, [lines]);

  const liveScoreResult = useMemo(
    () => computeLiveScorePreviewResult(lines, responses),
    [lines, responses]
  );

  const submit = async () => {
    if (!lines.length) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        responses: lines.map((line) => ({
          lineId: line.id,
          response: responses[line.id]!,
          comment: lineComments[line.id]?.trim() || undefined,
        })),
        reviewerNotes: reviewerNotes.trim() || undefined,
      };
      const res = await fetch(`/api/manager/quality-review/task-reviews/${reviewId}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Submit failed");
      setLastScores(json.data.scores as ScoreFeedback);
      setTimeout(() => {
        router.push("/manager/quality-review/dashboard");
      }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <Link
        href="/manager/quality-review/dashboard"
        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/20"
      >
        QA dashboard
      </Link>
    </>
  );

  return (
    <DashboardLayout headerActions={headerActions}>
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
      <div
        className={`max-w-6xl mx-auto text-white pb-16 px-4 ${
          task && lines.length ? "max-lg:pb-44" : ""
        }`}
      >
        <header className="border-b border-white/10 pb-6 mb-6">
          <h1 className="text-2xl font-semibold">Complete regrade</h1>
          <p className="text-xs text-white/45 mt-2">
            {meta?.templateLabel} · new checklist v{meta?.version}
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100 mb-6">
            {error}
          </div>
        )}

        {busy && !task && <p className="text-sm text-white/45">Loading…</p>}

        {task && taskId && (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start">
            <div className="space-y-6 min-w-0">
              <QaReviewTaskContext taskId={taskId} task={task} />

              {originalContext && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-950/30 p-4 text-sm space-y-2 lg:hidden">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200/90">
                    Original review
                  </p>
                  <p className="text-white/80">
                    Reviewer:{" "}
                    <span className="font-medium">
                      {originalContext.reviewer.name || originalContext.reviewer.email}
                    </span>
                  </p>
                  <p className="text-white/55 text-xs">
                    Submitted:{" "}
                    {originalContext.submittedAt
                      ? formatCompletedAt(originalContext.submittedAt)
                      : "—"}{" "}
                    · Score:{" "}
                    {originalContext.finalScore != null
                      ? `${originalContext.finalScore.toFixed(1)}%`
                      : "—"}
                  </p>
                  <p className="text-white/55 text-xs">
                    Template: {originalContext.templateVersion.template.displayName} v
                    {originalContext.templateVersion.version} · Regrade checklist:{" "}
                    <span className="text-amber-100/90">
                      {originalContext.templateMode === "same"
                        ? "Same template version"
                        : "Latest active template"}
                    </span>
                  </p>
                  {meta?.regradeReason ? (
                    <p className="text-amber-100/85 text-xs border-t border-amber-500/20 pt-2 mt-2">
                      <span className="font-semibold">Reason: </span>
                      {meta.regradeReason}
                    </p>
                  ) : null}
                </div>
              )}

              {lines.length > 0 && (
                <div className="space-y-8">
                  {groupedLines.map(([key, sectionLines]) => (
                    <div key={key}>
                      <h3 className="text-xs font-bold text-amber-200/95 mb-3 tracking-widest uppercase border-l-2 border-amber-400/60 pl-3">
                        {sectionLines[0]?.sectionTitle}
                      </h3>
                      <div className="space-y-4">
                        {sectionLines.map((line) => {
                          const orig =
                            originalContext && templateVersionId
                              ? matchOriginalLineResult(line, templateVersionId, originalContext)
                              : null;
                          return (
                            <div
                              key={line.id}
                              className="rounded-xl bg-white/[0.04] border border-white/10 p-4 md:p-5 space-y-3"
                            >
                              <div className="text-xs text-white/40">
                                {line.sectionTitle} · line {line.lineOrder}
                              </div>
                              <div className="text-sm font-medium text-white">{line.label}</div>
                              {line.helpText ? (
                                <div className="text-xs text-white/45 leading-relaxed">{line.helpText}</div>
                              ) : null}
                              <div className="text-xs text-white/35">
                                Weight {Number(line.weight).toFixed(2)}
                                {line.isCritical ? " · Critical" : ""}
                                {line.allowNa ? " · N/A allowed" : ""}
                              </div>
                              {orig ? (
                                <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-[11px] space-y-1 text-white/65">
                                  <div className="font-semibold text-white/55 uppercase tracking-wide text-[10px]">
                                    Previous review
                                  </div>
                                  <div>
                                    <span className="text-white/40">Decision: </span>
                                    <span className="text-violet-200/95 font-medium">{orig.response}</span>
                                  </div>
                                  {orig.comment ? (
                                    <div>
                                      <span className="text-white/40">Note: </span>
                                      {orig.comment}
                                    </div>
                                  ) : null}
                                  <div className="text-white/40">
                                    Grader:{" "}
                                    {originalContext?.reviewer.name ||
                                      originalContext?.reviewer.email ||
                                      "—"}
                                    {originalContext?.submittedAt ? (
                                      <>
                                        {" "}
                                        · {formatCompletedAt(originalContext.submittedAt)}
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-white/35 italic">
                                  No matching line on the original checklist (template may have changed).
                                </div>
                              )}
                              <div className="flex flex-wrap gap-4 text-sm">
                                {(["PASS", "FAIL", "NA"] as const).map((opt) => (
                                  <label key={opt} className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      className="accent-violet-500"
                                      name={`ln-${line.id}`}
                                      checked={responses[line.id] === opt}
                                      disabled={opt === "NA" && !line.allowNa}
                                      onChange={() => setResponses((p) => ({ ...p, [line.id]: opt }))}
                                    />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                              <input
                                placeholder="Optional line comment"
                                value={lineComments[line.id] ?? ""}
                                onChange={(e) =>
                                  setLineComments((p) => ({ ...p, [line.id]: e.target.value }))
                                }
                                className="w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <label className="block text-xs text-white/50">
                    Overall reviewer notes
                    <textarea
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm"
                    />
                  </label>

                  {lastScores && (
                    <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-50">
                      Submitted. Redirecting to QA dashboard…
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy || !!lastScores}
                    onClick={() => void submit()}
                    className="w-full sm:w-auto px-8 py-3 rounded-xl bg-violet-600 text-white font-semibold disabled:opacity-40 shadow-lg shadow-violet-950/40"
                  >
                    {busy ? "…" : "Submit regrade"}
                  </button>
                </div>
              )}
            </div>

            <aside className="hidden lg:block space-y-4 shrink-0 lg:sticky lg:top-4">
              {originalContext ? (
                <div className="rounded-xl border border-amber-400/25 bg-amber-950/25 p-4 text-sm space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200/90">
                    Original review
                  </p>
                  <p className="text-white/80">
                    Reviewer:{" "}
                    <span className="font-medium">
                      {originalContext.reviewer.name || originalContext.reviewer.email}
                    </span>
                  </p>
                  <p className="text-white/55 text-xs">
                    Submitted:{" "}
                    {originalContext.submittedAt
                      ? formatCompletedAt(originalContext.submittedAt)
                      : "—"}
                  </p>
                  <p className="text-white/55 text-xs">
                    Score:{" "}
                    {originalContext.finalScore != null
                      ? `${originalContext.finalScore.toFixed(1)}%`
                      : "—"}
                  </p>
                  <p className="text-white/55 text-xs">
                    Template: {originalContext.templateVersion.template.displayName} v
                    {originalContext.templateVersion.version}
                  </p>
                  <p className="text-white/55 text-xs">
                    This regrade uses:{" "}
                    <span className="text-amber-100/90 font-medium">
                      {originalContext.templateMode === "same"
                        ? "Same template version"
                        : "Latest active template"}
                    </span>
                  </p>
                  {meta?.regradeReason ? (
                    <p className="text-amber-100/85 text-xs border-t border-amber-500/20 pt-2">
                      <span className="font-semibold">Regrade reason: </span>
                      {meta.regradeReason}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-xl border border-white/12 bg-neutral-900/90 p-4 shadow-lg">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-3">
                  Live score preview
                </p>
                <QaLiveScorePreviewBody result={liveScoreResult} />
                {QA_LIVE_SCORE_DISCLAIMER}
              </div>
            </aside>
          </div>
        )}

        {task && lines.length > 0 && (
          <div
            className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-neutral-950/95 backdrop-blur-md shadow-[0_-12px_40px_rgba(0,0,0,0.5)]"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={() => setMobileLiveScoreOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left min-h-[48px] hover:bg-white/[0.04]"
              aria-expanded={mobileLiveScoreOpen}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Live score preview
                </p>
                {liveScoreResult?.kind === "breakdown" ? (
                  <p className="text-xs text-white/85 tabular-nums truncate">
                    <span className="text-white/50">E</span>{" "}
                    {liveScoreResult.breakdown.earnedWeight.toFixed(1)}/
                    {liveScoreResult.breakdown.possibleWeight.toFixed(1)}
                    <span className="text-white/40 mx-1.5">·</span>
                    {liveScoreResult.breakdown.weightedPercent.toFixed(0)}%
                    <span className="text-white/40 mx-1.5">·</span>
                    CF {liveScoreResult.breakdown.failedCriticalCount}
                    {liveScoreResult.breakdown.scoreCap != null && (
                      <>
                        <span className="text-white/40 mx-1.5">·</span>
                        cap {liveScoreResult.breakdown.scoreCap}%
                      </>
                    )}
                    <span className="text-white/40 mx-1.5">·</span>
                    <span className="font-semibold text-emerald-300">
                      → {liveScoreResult.breakdown.finalScore.toFixed(0)}%
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
                <div className="pt-3">
                  <QaLiveScorePreviewBody result={liveScoreResult} />
                  {QA_LIVE_SCORE_DISCLAIMER}
                </div>
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
    </DashboardLayout>
  );
}

export default function RegradeReviewPage() {
  return (
    <DashboardNavigationProvider>
      <RegradeReviewPageContent />
    </DashboardNavigationProvider>
  );
}
