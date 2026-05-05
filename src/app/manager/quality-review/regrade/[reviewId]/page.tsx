"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

const QA_DASHBOARD_PATH = "/manager/quality-review/dashboard";

/** Set true locally to trace cancel flow in the console (`[qa-regrade-cancel]`). */
const QA_REGRADE_CANCEL_DEBUG = false;

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
  /** Checklist label at the time of the original review (helps when template text drifted). */
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
  const params = useParams<{ reviewId: string | string[] }>();
  const reviewId = useMemo(
    () => (Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId) ?? "",
    [params.reviewId]
  );
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
  /** Initial GET for review + lines only — not submit/cancel. */
  const [pageBusy, setPageBusy] = useState(true);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [lastScores, setLastScores] = useState<ScoreFeedback | null>(null);
  const [mobileLiveScoreOpen, setMobileLiveScoreOpen] = useState(false);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  /** True after successful submit or explicit cancel — skips best-effort abandon cleanup. */
  const intentionalFinishRef = useRef(false);
  const busyRef = useRef(false);
  const reviewIdRef = useRef(reviewId);

  useEffect(() => {
    reviewIdRef.current = reviewId;
  }, [reviewId]);

  useEffect(() => {
    busyRef.current = pageBusy || submitBusy || cancelBusy;
  }, [pageBusy, submitBusy, cancelBusy]);

  useEffect(() => {
    if (error) {
      errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [error]);

  /** Best-effort: closing the tab or navigating away releases the PENDING draft (same as Cancel). */
  useEffect(() => {
    const onPageHide = () => {
      if (intentionalFinishRef.current || busyRef.current) return;
      const id = reviewIdRef.current;
      if (!id) return;
      void fetch(`/api/manager/quality-review/task-reviews/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!reviewId) {
        setPageBusy(false);
        setError("Missing review id in the URL.");
        return;
      }
      setPageBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/manager/quality-review/task-reviews/${encodeURIComponent(reviewId)}`,
          {
            credentials: "include",
          }
        );
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
        /** Fresh regrade: no line pre-selected (parent decisions shown separately for reference). */
        setResponses({});
        setLineComments({});
        setReviewerNotes("");
        setLastScores(null);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setPageBusy(false);
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

  const responsesComplete = useMemo(
    () =>
      lines.length > 0 &&
      lines.every((line) => {
        const r = responses[line.id];
        return r === "PASS" || r === "FAIL" || r === "NA";
      }),
    [lines, responses]
  );

  const submit = async () => {
    if (!lines.length || !responsesComplete) return;
    setSubmitBusy(true);
    setError(null);
    try {
      const body = {
        responses: lines.map((line) => {
          const r = responses[line.id];
          if (r !== "PASS" && r !== "FAIL" && r !== "NA") {
            throw new Error("Each checklist line needs a response.");
          }
          return {
            lineId: line.id,
            response: r,
            comment: lineComments[line.id]?.trim() || undefined,
          };
        }),
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
      intentionalFinishRef.current = true;
      setLastScores(json.data.scores as ScoreFeedback);
      setTimeout(() => {
        window.location.href = QA_DASHBOARD_PATH;
      }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitBusy(false);
    }
  };

  const cancelRegrade = async () => {
    if (QA_REGRADE_CANCEL_DEBUG) {
      console.log("[qa-regrade-cancel] onClick fired", {
        reviewIdLen: reviewId?.length ?? 0,
        pageBusy,
        submitBusy,
        cancelBusy,
        lastScores: !!lastScores,
      });
    }

    if (
      !window.confirm(
        "Cancel this regrade? Nothing will be saved and the task can be regraded again."
      )
    ) {
      if (QA_REGRADE_CANCEL_DEBUG) console.log("[qa-regrade-cancel] confirm dismissed");
      return;
    }

    if (QA_REGRADE_CANCEL_DEBUG) console.log("[qa-regrade-cancel] confirm accepted");

    if (!reviewId) {
      setError("Missing review id. Refresh the page and try again.");
      return;
    }

    intentionalFinishRef.current = true;
    setCancelBusy(true);
    setError(null);
    const cancelUrl = `/api/manager/quality-review/task-reviews/${encodeURIComponent(reviewId)}/cancel`;

    if (QA_REGRADE_CANCEL_DEBUG) {
      console.log("[qa-regrade-cancel] fetch start", { cancelUrl });
    }

    let navigatedAway = false;
    try {
      const res = await fetch(cancelUrl, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const raw = await res.text();
      if (QA_REGRADE_CANCEL_DEBUG) {
        console.log("[qa-regrade-cancel] response", {
          status: res.status,
          ok: res.ok,
          bodyPreview: raw.replace(/\s+/g, " ").slice(0, 300),
        });
      }

      if (!res.ok) {
        let errMsg = `Cancel failed (${res.status})`;
        if (raw.trim()) {
          try {
            const parsed = JSON.parse(raw) as { error?: string };
            if (parsed?.error) errMsg = parsed.error;
          } catch {
            /* use errMsg */
          }
        }
        throw new Error(errMsg);
      }

      // 2xx: succeed unless JSON explicitly says success:false
      const trimmed = raw.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed) as { success?: boolean; error?: string };
          if (parsed?.success === false) {
            throw new Error(parsed.error || "Cancel was not accepted");
          }
        } catch (e: unknown) {
          if (e instanceof SyntaxError) {
            /* Non-JSON body on 2xx → still treat as success */
          } else {
            throw e;
          }
        }
      }

      console.log("[qa-regrade-cancel] cancel success, hard redirecting");
      navigatedAway = true;
      window.location.replace(QA_DASHBOARD_PATH);
    } catch (e: unknown) {
      intentionalFinishRef.current = false;
      const msg = e instanceof Error ? e.message : "Could not cancel";
      setError(msg);
      if (QA_REGRADE_CANCEL_DEBUG) {
        console.error("[qa-regrade-cancel] error", e);
      }
    } finally {
      if (!navigatedAway) setCancelBusy(false);
    }
  };

  const headerActions = (
    <>
      <ThemeToggle />
      <SessionTimer timeLeft={timeLeft} onExtend={extendSession} />
      <Link
        href={QA_DASHBOARD_PATH}
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
          task && lines.length ? "max-lg:pb-52" : ""
        }`}
      >
        <header className="border-b border-white/10 pb-6 mb-6">
          <h1 className="text-2xl font-semibold">Complete regrade</h1>
          <p className="text-xs text-white/45 mt-2">
            {meta?.templateLabel} · new checklist v{meta?.version}
          </p>
          <p className="text-xs text-white/40 mt-3 max-w-2xl leading-relaxed">
            Use <span className="text-white/55">Complete regrade</span> to submit the official score.{" "}
            <span className="text-white/55">Cancel regrade</span> discards this draft and releases the
            task (same as closing the tab—best-effort).
          </p>
        </header>

        {error && (
          <div
            ref={errorBannerRef}
            role="alert"
            className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100 mb-6"
          >
            {error}
          </div>
        )}

        {pageBusy && !task && <p className="text-sm text-white/45">Loading…</p>}

        {task && taskId && (
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-950/20 via-neutral-950/50 to-neutral-950/90 p-5 md:p-7 ring-1 ring-white/5 shadow-xl shadow-black/25 space-y-6">
            <QaReviewTaskContext variant="plain" taskId={taskId} task={task} />

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start border-t border-white/10 pt-6">
              <div className="space-y-6 min-w-0">
                {originalContext && (
                  <div className="rounded-xl border border-amber-400/25 bg-amber-950/30 p-4 text-sm space-y-2 lg:hidden">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200/90">
                      Original review
                    </p>
                    <p className="text-white/80">
                      Original reviewer:{" "}
                      <span className="font-medium">
                        {originalContext.reviewer.name || originalContext.reviewer.email}
                      </span>
                    </p>
                    <p className="text-white/55 text-xs">
                      Original submitted:{" "}
                      {originalContext.submittedAt
                        ? formatCompletedAt(originalContext.submittedAt)
                        : "—"}{" "}
                      · Original final score:{" "}
                      {originalContext.finalScore != null
                        ? `${originalContext.finalScore.toFixed(1)}%`
                        : "—"}
                    </p>
                    <p className="text-white/55 text-xs">
                      Original template: {originalContext.templateVersion.template.displayName} v
                      {originalContext.templateVersion.version}
                    </p>
                    <p className="text-white/55 text-xs">
                      This regrade&apos;s checklist: {meta?.templateLabel ?? "—"} v{meta?.version ?? "—"}{" "}
                      ·{" "}
                      <span className="text-amber-100/90">
                        {originalContext.templateMode === "same"
                          ? "Same template version as original"
                          : "Latest active template (line slugs matched to prior decisions where possible)"}
                      </span>
                    </p>
                    {meta?.regradeReason ? (
                      <p className="text-amber-100/85 text-xs border-t border-amber-500/20 pt-2 mt-2">
                        <span className="font-semibold">Regrade reason: </span>
                        {meta.regradeReason}
                      </p>
                    ) : null}
                  </div>
                )}

                {lines.length > 0 && (
                  <div className="space-y-8">
                    {!responsesComplete && (
                      <p className="text-xs text-amber-200/90 rounded-lg border border-amber-500/25 bg-amber-950/25 px-3 py-2">
                        Select PASS, FAIL, or N/A on every line. Prior decisions are shown for reference
                        only and are not copied into this regrade.
                      </p>
                    )}
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
                            const snapshotDiffers =
                              orig &&
                              orig.labelSnapshot &&
                              orig.labelSnapshot.trim() !== line.label.trim();
                            return (
                              <div
                                key={line.id}
                                className="rounded-xl bg-white/[0.04] border border-white/10 p-4 md:p-5 space-y-3"
                              >
                                <div className="text-xs text-white/40">
                                  {line.sectionTitle} · line {line.lineOrder}
                                </div>
                                <div className="text-sm font-medium text-white">{line.label}</div>
                                {snapshotDiffers ? (
                                  <div className="text-[11px] text-white/50 italic border-l-2 border-white/15 pl-2">
                                    Original line wording: {orig!.labelSnapshot}
                                  </div>
                                ) : null}
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
                                      Original line result
                                    </div>
                                    <div>
                                      <span className="text-white/40">Previous: </span>
                                      <span className="text-violet-200/95 font-medium">{orig.response}</span>
                                    </div>
                                    {orig.comment ? (
                                      <div>
                                        <span className="text-white/40">Previous note: </span>
                                        {orig.comment}
                                      </div>
                                    ) : (
                                      <div className="text-white/35">Previous note: —</div>
                                    )}
                                    <div className="text-white/40">
                                      Original reviewer:{" "}
                                      {originalContext?.reviewer.name ||
                                        originalContext?.reviewer.email ||
                                        "—"}
                                      {originalContext?.submittedAt ? (
                                        <>
                                          {" "}
                                          · Submitted: {formatCompletedAt(originalContext.submittedAt)}
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

                    <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-3 sm:items-center">
                      <button
                        type="button"
                        disabled={!!lastScores || submitBusy || cancelBusy}
                        onClick={() => void cancelRegrade()}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/20 bg-white/5 text-white font-medium hover:bg-white/10 disabled:opacity-40"
                      >
                        {cancelBusy ? "…" : "Cancel regrade"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          pageBusy || !!lastScores || !responsesComplete || submitBusy || cancelBusy
                        }
                        onClick={() => void submit()}
                        className="w-full sm:w-auto px-8 py-3 rounded-xl bg-violet-600 text-white font-semibold disabled:opacity-40 shadow-lg shadow-violet-950/40"
                      >
                        {submitBusy ? "…" : "Complete regrade"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <aside className="hidden lg:block space-y-4 shrink-0 lg:sticky lg:top-4">
                <div className="rounded-xl border border-white/12 bg-neutral-900/90 p-4 shadow-lg space-y-2 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">
                    This regrade&apos;s checklist
                  </p>
                  <p className="text-white/85 font-medium">{meta?.templateLabel ?? "—"}</p>
                  <p className="text-white/55 text-xs">Version {meta?.version ?? "—"}</p>
                </div>
                {originalContext ? (
                  <div className="rounded-xl border border-amber-400/25 bg-amber-950/25 p-4 text-sm space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-amber-200/90">
                      Original review
                    </p>
                    <p className="text-white/80">
                      Original reviewer:{" "}
                      <span className="font-medium">
                        {originalContext.reviewer.name || originalContext.reviewer.email}
                      </span>
                    </p>
                    <p className="text-white/55 text-xs">
                      Original submitted:{" "}
                      {originalContext.submittedAt
                        ? formatCompletedAt(originalContext.submittedAt)
                        : "—"}
                    </p>
                    <p className="text-white/55 text-xs">
                      Original final score:{" "}
                      {originalContext.finalScore != null
                        ? `${originalContext.finalScore.toFixed(1)}%`
                        : "—"}
                    </p>
                    <p className="text-white/55 text-xs">
                      Original template: {originalContext.templateVersion.template.displayName} v
                      {originalContext.templateVersion.version}
                    </p>
                    <p className="text-white/55 text-xs">
                      Template mode:{" "}
                      <span className="text-amber-100/90 font-medium">
                        {originalContext.templateMode === "same"
                          ? "Same template version as original"
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
          </div>
        )}

        {task && lines.length > 0 && (
          <div
            className="lg:hidden fixed inset-x-0 bottom-0 z-[45] border-t border-white/15 bg-neutral-950/95 backdrop-blur-md shadow-[0_-12px_40px_rgba(0,0,0,0.5)]"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="grid grid-cols-2 gap-2 px-3 pt-2 border-b border-white/10">
              <button
                type="button"
                disabled={!!lastScores || submitBusy || cancelBusy}
                onClick={() => void cancelRegrade()}
                className="min-h-[44px] rounded-lg border border-white/20 bg-white/5 text-sm font-medium text-white disabled:opacity-40"
              >
                {cancelBusy ? "…" : "Cancel regrade"}
              </button>
              <button
                type="button"
                disabled={
                  pageBusy || !!lastScores || !responsesComplete || submitBusy || cancelBusy
                }
                onClick={() => void submit()}
                className="min-h-[44px] rounded-lg bg-violet-600 text-sm font-semibold text-white disabled:opacity-40"
              >
                {submitBusy ? "…" : "Complete regrade"}
              </button>
            </div>
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
