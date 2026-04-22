"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/app/_components/DashboardLayout";
import ThemeToggle from "@/app/_components/ThemeToggle";
import SessionTimer from "@/app/_components/SessionTimer";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/app/_components/AutoLogoutWarning";
import { computeQualityReviewScores } from "@/lib/quality-review-scoring";
import type { QAReviewLineResponse } from "@prisma/client";

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

export default function RegradeReviewPage() {
  const params = useParams<{ reviewId: string }>();
  const reviewId = params.reviewId;
  const router = useRouter();
  const { timeLeft, extendSession, showWarning } = useAutoLogout();

  const [lines, setLines] = useState<LineRow[]>([]);
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const [meta, setMeta] = useState<{
    regradeReason: string | null;
    templateLabel: string;
    version: number;
  } | null>(null);
  const [responses, setResponses] = useState<Record<string, QAReviewLineResponse>>({});
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [lastScores, setLastScores] = useState<ScoreFeedback | null>(null);

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
        setMeta({
          regradeReason: d.review.regradeReason,
          templateLabel: d.review.templateVersion?.template?.displayName ?? "Template",
          version: d.review.templateVersion?.version ?? 0,
        });
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

  const liveScores = useMemo(() => {
    if (!lines.length) return null;
    try {
      const map = new Map<string, QAReviewLineResponse>();
      for (const line of lines) {
        const r = responses[line.id];
        if (!r) return null;
        map.set(line.id, r);
      }
      return computeQualityReviewScores(lines, map);
    } catch {
      return null;
    }
  }, [lines, responses]);

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
      <AutoLogoutWarning show={showWarning} timeLeft={timeLeft} onExtend={extendSession} />
      <div className="max-w-3xl mx-auto space-y-6 text-white pb-16 px-4">
        <header className="border-b border-white/10 pb-6">
          <h1 className="text-2xl font-semibold">Complete regrade</h1>
          {meta?.regradeReason ? (
            <p className="text-sm text-amber-200/90 mt-2 border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-500/10">
              Reason on file: {meta.regradeReason}
            </p>
          ) : null}
          <p className="text-xs text-white/45 mt-2">
            {meta?.templateLabel} · template v{meta?.version}
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {busy && !task && <p className="text-sm text-white/45">Loading…</p>}

        {task && (
          <div className="rounded-2xl border border-white/12 bg-neutral-950/60 p-5 space-y-4">
            <div className="text-xs text-white/45 font-mono break-all">Task {String(task.id)}</div>
            <div className="text-sm text-white/75">
              Type: {String(task.taskType)} · Disposition:{" "}
              {task.disposition != null && String(task.disposition) !== ""
                ? String(task.disposition)
                : "—"}
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <div className="space-y-4">
            {lines.map((line) => (
              <div
                key={line.id}
                className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2"
              >
                <div className="text-xs text-white/40">
                  {line.sectionTitle} · line {line.lineOrder}
                </div>
                <div className="text-sm font-medium text-white/90">{line.label}</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {(["PASS", "FAIL", "NA"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`ln-${line.id}`}
                        checked={responses[line.id] === opt}
                        onChange={() => setResponses((p) => ({ ...p, [line.id]: opt }))}
                      />
                      {opt}
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

            {liveScores && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-4 py-3 text-sm">
                <div className="text-cyan-200/90 text-xs font-semibold uppercase mb-1">
                  Live preview
                </div>
                <div>
                  {liveScores.earnedWeight.toFixed(2)} / {liveScores.possibleWeight.toFixed(2)} →{" "}
                  {liveScores.weightedPercent.toFixed(1)}%
                </div>
                <div className="text-lg font-bold text-white mt-1">
                  Final score: {liveScores.finalScore.toFixed(1)}%
                </div>
              </div>
            )}

            {lastScores && (
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-50">
                Submitted. Redirecting to QA dashboard…
              </div>
            )}

            <button
              type="button"
              disabled={busy || !!lastScores}
              onClick={() => void submit()}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold disabled:opacity-40"
            >
              {busy ? "…" : "Submit regrade"}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
