"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getDefaultSprintYmdBounds } from "@/lib/quality-review-sprint";
import {
  QA_COVERAGE_TARGET_REVIEWS_PER_AGENT,
  QA_NEEDS_ATTENTION_SNAPSHOT_LIMIT,
} from "@/lib/quality-review-constants";

type Summary = {
  startYmd: string;
  endYmd: string;
  coverageTarget: number;
  totalReviewsCompleted: number;
  agentsFullyCovered: number;
  agentsBelowTarget: number;
  agentsWithZeroQa: number;
  totalAgentsListed: number;
  needsAttention: Array<{
    agentId: string;
    name: string | null;
    email: string;
    reviewsCompleted: number;
    coverageTarget: number;
    coverageStatus: string;
  }>;
};

export function QaSprintSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { startYmd, endYmd } = getDefaultSprintYmdBounds();
        const res = await fetch(
          `/api/manager/quality-review/dashboard/summary?startDate=${encodeURIComponent(startYmd)}&endDate=${encodeURIComponent(endYmd)}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Failed to load QA summary");
        if (!cancelled) setSummary(json.data as Summary);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
        Loading QA sprint summary…
      </div>
    );
  }
  if (err || !summary) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        {err ?? "Summary unavailable"}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/40 to-neutral-950/80 p-5 md:p-6 ring-1 ring-white/5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-white/10 pb-4 mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-violet-200/90">
            QA sprint snapshot
          </h2>
          <p className="text-xs text-white/45 mt-1 tabular-nums">
            Window {summary.startYmd} → {summary.endYmd} · target{" "}
            {summary.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT} reviews / agent
          </p>
        </div>
        <Link
          href={`/manager/quality-review/dashboard?startDate=${summary.startYmd}&endDate=${summary.endYmd}`}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 border border-violet-400/30"
        >
          Open dashboard
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="rounded-xl bg-black/30 border border-white/10 px-3 py-3">
          <div className="text-2xl font-bold text-white tabular-nums">
            {summary.totalReviewsCompleted}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-white/40 mt-1">
            Reviews (current)
          </div>
        </div>
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 px-3 py-3">
          <div className="text-2xl font-bold text-emerald-200 tabular-nums">
            {summary.agentsFullyCovered}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-emerald-200/60 mt-1">At target</div>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-3">
          <div className="text-2xl font-bold text-amber-200 tabular-nums">
            {summary.agentsBelowTarget}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-amber-200/60 mt-1">Below target</div>
        </div>
        <div className="rounded-xl bg-red-500/10 border border-red-400/25 px-3 py-3">
          <div className="text-2xl font-bold text-red-200 tabular-nums">
            {summary.agentsWithZeroQa}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-red-200/60 mt-1">Zero QA</div>
        </div>
      </div>
      {summary.needsAttention.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40 mb-1">
            Needs attention
          </p>
          <p className="text-[10px] text-white/35 mb-2 leading-snug">
            Same sprint window and rules as the dashboard (SUBMITTED + current version only). Showing
            up to {QA_NEEDS_ATTENTION_SNAPSHOT_LIMIT} agents with the lowest counts; open the
            dashboard for the full list.
          </p>
          <ul className="space-y-1.5 text-xs text-white/75">
            {summary.needsAttention.map((a) => (
              <li key={a.agentId} className="flex flex-wrap justify-between gap-2">
                <span className="truncate">{a.name || a.email}</span>
                <span className="text-white/45 tabular-nums shrink-0">
                  {a.reviewsCompleted}/{a.coverageTarget}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
