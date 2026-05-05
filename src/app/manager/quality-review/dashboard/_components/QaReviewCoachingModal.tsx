"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { QaReviewTaskContext } from "@/app/manager/quality-review/_components/QaReviewTaskContext";

type TemplateVersion = {
  id: string;
  version: number;
  template: { displayName: string; taskType: string; slug: string };
};

type LineDef = {
  id: string;
  slug: string;
  sectionOrder: number;
  sectionTitle: string;
  lineOrder: number;
  label: string;
  helpText: string | null;
  weight: string | number;
  isCritical: boolean;
  allowNa: boolean;
};

type LineResultRow = {
  lineId: string;
  response: string;
  comment: string | null;
  labelSnapshot: string;
  weightSnapshot: string | number;
  isCriticalSnapshot: boolean;
  allowNaSnapshot: boolean;
};

type ReviewHeader = {
  id: string;
  taskId: string;
  status: string;
  submittedAt: string | null;
  finalScore: number | null;
  weightedScore: number | null;
  failedCriticalCount: number | null;
  scoreCap: number | null;
  reviewerNotes: string | null;
  isCurrentVersion: boolean;
  regradeReason: string | null;
  templateVersion: TemplateVersion;
  reviewer: { id: string; name: string | null; email: string };
  subjectAgent: { id: string; name: string | null; email: string } | null;
  taskSnapshot: Record<string, unknown> | null;
};

type Props = {
  reviewId: string | null;
  onClose: () => void;
};

function formatWeight(w: unknown): string {
  if (w == null) return "—";
  const n = Number(w);
  return Number.isFinite(n) ? n.toFixed(2) : String(w);
}

function responseStyle(r: string): string {
  if (r === "PASS") return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
  if (r === "FAIL") return "bg-red-500/20 text-red-200 border-red-500/40";
  if (r === "NA") return "bg-white/10 text-white/70 border-white/20";
  return "bg-white/5 text-white/60 border-white/15";
}

export function QaReviewCoachingModal({ reviewId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<{
    review: ReviewHeader;
    lines: LineDef[];
    lineResults: LineResultRow[];
    task: Record<string, unknown>;
  } | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setErr(null);
    setPayload(null);
    try {
      const res = await fetch(`/api/manager/quality-review/task-reviews/${id}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load review");
      if (json.data.review.status !== "SUBMITTED") {
        throw new Error("Only submitted reviews can be opened in this read-only view.");
      }
      setPayload({
        review: json.data.review,
        lines: json.data.lines,
        lineResults: json.data.lineResults,
        task: json.data.task as Record<string, unknown>,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!reviewId) {
      setPayload(null);
      setErr(null);
      return;
    }
    void load(reviewId);
  }, [reviewId, load]);

  useEffect(() => {
    if (!reviewId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewId, onClose]);

  const mergedRows = useMemo(() => {
    if (!payload) return [];
    const byLine = new Map(payload.lineResults.map((lr) => [lr.lineId, lr]));
    return payload.lines
      .map((line) => {
        const lr = byLine.get(line.id);
        return lr ? { line, lr } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => {
        if (a.line.sectionOrder !== b.line.sectionOrder) {
          return a.line.sectionOrder - b.line.sectionOrder;
        }
        return a.line.lineOrder - b.line.lineOrder;
      });
  }, [payload]);

  const sections = useMemo(() => {
    const m = new Map<string, typeof mergedRows>();
    for (const row of mergedRows) {
      const key = row.line.sectionTitle;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(row);
    }
    return m;
  }, [mergedRows]);

  if (!reviewId) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qa-coaching-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3 shrink-0 border-b border-white/10 px-4 py-4 sm:px-5 bg-neutral-950/95 backdrop-blur-sm">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
              Read-only coaching view
            </p>
            <h2 id="qa-coaching-title" className="text-lg font-semibold tracking-tight text-white truncate">
              QA review detail
            </h2>
            <p className="text-xs text-white/50 leading-relaxed max-w-xl">
              This view shows the submitted QA review exactly as it was scored. Use{" "}
              <span className="text-white/70 font-medium">Regrade</span> if a correction is needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 text-white/90 hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 sm:px-5 sm:py-5 space-y-6">
          {loading && <p className="text-sm text-white/50">Loading review…</p>}
          {err && (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {err}
            </div>
          )}

          {payload && (
            <>
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-white/80">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Task ID</div>
                    <div className="font-mono text-xs text-violet-200/90 break-all">{payload.review.taskId}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Task type</div>
                    <div>{String(payload.task.taskType ?? "—")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Template</div>
                    <div>
                      {payload.review.templateVersion.template.displayName}{" "}
                      <span className="text-white/45">· v{payload.review.templateVersion.version}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80 border-t border-white/10 pt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Reviewer</div>
                    <div>
                      {payload.review.reviewer.name || payload.review.reviewer.email}
                      {payload.review.reviewer.email && payload.review.reviewer.name ? (
                        <span className="text-white/45 text-xs"> ({payload.review.reviewer.email})</span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">QA subject (agent)</div>
                    <div>
                      {payload.review.subjectAgent
                        ? payload.review.subjectAgent.name || payload.review.subjectAgent.email
                        : (() => {
                            const c = payload.task.completedByUser as
                              | { name?: string | null; email?: string | null }
                              | null
                              | undefined;
                            return c ? c.name || c.email || "—" : "—";
                          })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Submitted</div>
                    <div className="tabular-nums">
                      {payload.review.submittedAt
                        ? new Date(payload.review.submittedAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm border-t border-white/10 pt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Final score</div>
                    <div className="text-lg font-semibold text-white tabular-nums">
                      {payload.review.finalScore != null ? `${payload.review.finalScore.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                  {payload.review.weightedScore != null && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-white/40">Weighted score</div>
                      <div className="tabular-nums text-white/85">{payload.review.weightedScore.toFixed(2)}</div>
                    </div>
                  )}
                  {payload.review.scoreCap != null && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-amber-200/80">Score cap</div>
                      <div className="tabular-nums text-amber-100/90">{payload.review.scoreCap.toFixed(1)}%</div>
                    </div>
                  )}
                  {payload.review.failedCriticalCount != null && payload.review.failedCriticalCount > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-red-200/80">Failed critical</div>
                      <div className="tabular-nums text-red-100/90">{payload.review.failedCriticalCount}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-white/40">Chain</div>
                    <div className="text-white/70">
                      {payload.review.isCurrentVersion ? "Current version" : "Superseded (historical)"}
                    </div>
                  </div>
                </div>
                {payload.review.regradeReason ? (
                  <div className="text-xs text-amber-200/85 border-t border-white/10 pt-3">
                    <span className="text-white/45">Regrade reason: </span>
                    {payload.review.regradeReason}
                  </div>
                ) : null}
                {payload.review.reviewerNotes ? (
                  <div className="text-xs text-white/60 border-t border-white/10 pt-3">
                    <span className="text-white/45 font-medium">Overall reviewer notes: </span>
                    {payload.review.reviewerNotes}
                  </div>
                ) : null}
                {payload.review.taskSnapshot && Object.keys(payload.review.taskSnapshot).length > 0 ? (
                  <details className="border-t border-white/10 pt-3 text-xs">
                    <summary className="cursor-pointer text-violet-300/90 hover:text-violet-200 font-medium">
                      Task snapshot at submission
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-white/70 whitespace-pre-wrap">
                      {JSON.stringify(payload.review.taskSnapshot, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>

              <QaReviewTaskContext
                variant="plain"
                taskId={payload.review.taskId}
                task={payload.task}
              />

              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-amber-200/95 mb-3 border-l-2 border-amber-400/60 pl-3">
                  Line-by-line results
                </h3>
                <p className="text-[11px] text-white/45 mb-4">
                  Labels, weights, critical flags, and allow-NA are shown from the saved line snapshot at
                  submission. Section and help text come from template version{" "}
                  <span className="text-white/60">v{payload.review.templateVersion.version}</span> (the same
                  version this review used).
                </p>
                <div className="space-y-8">
                  {Array.from(sections.entries()).map(([sectionTitle, rows]) => (
                    <div key={sectionTitle}>
                      <h4 className="text-sm font-semibold text-white/90 mb-3">{sectionTitle}</h4>
                      <ul className="space-y-3">
                        {rows.map(({ line, lr }) => (
                          <li
                            key={line.id}
                            className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-2"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white">{lr.labelSnapshot}</div>
                                {line.label.trim() !== lr.labelSnapshot.trim() ? (
                                  <p className="text-[10px] text-white/40 mt-0.5">
                                    Template line label today: {line.label}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold border uppercase tracking-wide ${responseStyle(lr.response)}`}
                              >
                                {lr.response}
                              </span>
                            </div>
                            {line.helpText ? (
                              <p className="text-xs text-white/50">{line.helpText}</p>
                            ) : null}
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-white/70">
                              <div>
                                <dt className="text-white/40">Weight</dt>
                                <dd className="tabular-nums">{formatWeight(lr.weightSnapshot)} pts</dd>
                              </div>
                              <div>
                                <dt className="text-white/40">Critical</dt>
                                <dd>{lr.isCriticalSnapshot ? "Yes" : "No"}</dd>
                              </div>
                              <div>
                                <dt className="text-white/40">Allow NA</dt>
                                <dd>{lr.allowNaSnapshot ? "Yes" : "No"}</dd>
                              </div>
                              <div>
                                <dt className="text-white/40">Line slug</dt>
                                <dd className="font-mono text-[10px] truncate">{line.slug}</dd>
                              </div>
                            </dl>
                            {lr.comment?.trim() ? (
                              <div className="text-xs rounded-lg bg-white/5 border border-white/8 px-2 py-1.5 text-white/75">
                                <span className="text-white/45">Reviewer comment: </span>
                                {lr.comment}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-white/15 bg-black/20 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-white/40">
                  Corrections use the existing <strong className="text-white/55">Regrade review</strong> action
                  from QA dashboard history — not implemented on this screen yet.
                </p>
                <button
                  type="button"
                  disabled
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-white/30 cursor-not-allowed"
                  title="Planned: start a regrade from this view"
                >
                  Regrade from here
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
