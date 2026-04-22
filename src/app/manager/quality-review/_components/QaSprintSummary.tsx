"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDefaultSprintYmdBounds } from "@/lib/quality-review-sprint";
import {
  QA_COVERAGE_TARGET_REVIEWS_PER_AGENT,
  QA_NEEDS_ATTENTION_SNAPSHOT_LIMIT,
  QA_SMART_QUEUE_LIMIT,
} from "@/lib/quality-review-constants";
import type { QaAgentCoverageRow, QaCoverageDisplayStatus } from "@/lib/quality-review-dashboard";
import {
  buildQaDashboardUrl,
  QA_ROSTER_SCOPE_ALL,
  QA_ROSTER_SCOPE_TRACKED,
  QA_TEAM_FILTER_ANY,
  QA_TEAM_FILTER_UNASSIGNED,
} from "@/lib/quality-review-dashboard";

type Summary = {
  startYmd: string;
  endYmd: string;
  coverageTarget: number;
  rosterScope: string;
  qaTeamFilter: string;
  totalReviewsCompleted: number;
  agentsFullyCovered: number;
  agentsBelowTarget: number;
  agentsWithZeroQa: number;
  agentsExempt: number;
  agentsNoEligibleWork: number;
  agentsTracked: number;
  totalAgentsListed: number;
  teamOptions: string[];
  needsAttention: QaAgentCoverageRow[];
  smartQueue: QaAgentCoverageRow[];
};

function statusBadgeClass(s: QaCoverageDisplayStatus) {
  if (s === "none") return "bg-red-500/25 text-red-200 border-red-400/30";
  if (s === "below") return "bg-amber-500/25 text-amber-100 border-amber-400/30";
  return "bg-white/10 text-white/70 border-white/15";
}

function statusShort(s: QaCoverageDisplayStatus) {
  if (s === "none") return "Zero";
  if (s === "below") return "Below";
  return s;
}

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function QaSprintSummary() {
  const defaultSprint = useMemo(() => getDefaultSprintYmdBounds(), []);
  const [poolScope, setPoolScope] = useState<typeof QA_ROSTER_SCOPE_ALL | typeof QA_ROSTER_SCOPE_TRACKED>(
    QA_ROSTER_SCOPE_TRACKED
  );
  const [teamSel, setTeamSel] = useState<string>(QA_TEAM_FILTER_ANY);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const rosterScope = poolScope;
  const qaTeamFilter = teamSel;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { startYmd, endYmd } = defaultSprint;
      const rosterQ =
        rosterScope === QA_ROSTER_SCOPE_TRACKED
          ? `&rosterScope=${encodeURIComponent(QA_ROSTER_SCOPE_TRACKED)}`
          : "";
      const teamQ =
        qaTeamFilter !== QA_TEAM_FILTER_ANY
          ? `&qaTeam=${encodeURIComponent(qaTeamFilter)}`
          : "";
      const res = await fetch(
        `/api/manager/quality-review/dashboard/summary?startDate=${encodeURIComponent(startYmd)}&endDate=${encodeURIComponent(endYmd)}${rosterQ}${teamQ}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load QA summary");
      setSummary(json.data as Summary);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [defaultSprint, rosterScope, qaTeamFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamSelectOptions = useMemo(() => {
    const opts = summary?.teamOptions ?? [];
    if (
      teamSel === QA_TEAM_FILTER_ANY ||
      teamSel === QA_TEAM_FILTER_UNASSIGNED ||
      !teamSel ||
      opts.includes(teamSel)
    ) {
      return opts;
    }
    return [...opts, teamSel].sort((a, b) => a.localeCompare(b));
  }, [summary?.teamOptions, teamSel]);

  const dashBase = useMemo(() => {
    if (!summary) return null;
    return {
      startYmd: summary.startYmd,
      endYmd: summary.endYmd,
      rosterScope,
      qaTeamFilter,
    };
  }, [summary, rosterScope, qaTeamFilter]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
        Loading QA sprint summary…
      </div>
    );
  }
  if (err || !summary || !dashBase) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        {err ?? "Summary unavailable"}
      </div>
    );
  }

  const tileLink = (coverageStatus: QaCoverageDisplayStatus | null, rosterOverride?: string | null) =>
    buildQaDashboardUrl({
      ...dashBase,
      rosterScope: rosterOverride ?? dashBase.rosterScope,
      coverageStatus,
    });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-950/40 to-neutral-950/80 p-5 md:p-6 ring-1 ring-white/5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 border-b border-white/10 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-violet-200/90">
              QA sprint snapshot
            </h2>
            <p className="text-xs text-white/45 mt-1 tabular-nums">
              Window {summary.startYmd} → {summary.endYmd} · target{" "}
              {summary.coverageTarget ?? QA_COVERAGE_TARGET_REVIEWS_PER_AGENT} reviews / agent ·{" "}
              {summary.agentsTracked ?? 0} tracked in scope
            </p>
            <p className="text-[10px] text-white/35 mt-1 max-w-xl leading-snug">
              Default sprint (PST). Pool <span className="text-white/55">Tracked</span> focuses on
              QA-tracked agents; switch to <span className="text-white/55">Everyone</span> to include
              exempt rows in counts. Team narrows all tiles and lists.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 items-end shrink-0">
            <label className="text-[10px] text-white/45 uppercase tracking-wide block">
              Pool
              <select
                value={poolScope}
                onChange={(e) =>
                  setPoolScope(
                    e.target.value === QA_ROSTER_SCOPE_TRACKED
                      ? QA_ROSTER_SCOPE_TRACKED
                      : QA_ROSTER_SCOPE_ALL
                  )
                }
                className="mt-1 block rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-xs text-white min-w-[9rem]"
              >
                <option value={QA_ROSTER_SCOPE_TRACKED}>Tracked (coverage)</option>
                <option value={QA_ROSTER_SCOPE_ALL}>Everyone</option>
              </select>
            </label>
            <label className="text-[10px] text-white/45 uppercase tracking-wide block">
              QA team
              <select
                value={teamSel}
                onChange={(e) => setTeamSel(e.target.value)}
                className="mt-1 block rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-xs text-white min-w-[9rem]"
              >
                <option value={QA_TEAM_FILTER_ANY}>All teams</option>
                <option value={QA_TEAM_FILTER_UNASSIGNED}>Unassigned</option>
                {teamSelectOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href={buildQaDashboardUrl(dashBase)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 border border-violet-400/30 self-end"
            >
              Open dashboard
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <Link
            href={tileLink(null)}
            className="rounded-xl bg-black/30 border border-white/10 px-3 py-3 block hover:border-violet-400/40 hover:bg-black/40 transition-colors"
          >
            <div className="text-2xl font-bold text-white tabular-nums">
              {summary.totalReviewsCompleted}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-white/40 mt-1">
              Reviews (tracked)
            </div>
          </Link>
          <Link
            href={tileLink("complete")}
            className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 px-3 py-3 block hover:border-emerald-300/50 transition-colors"
          >
            <div className="text-2xl font-bold text-emerald-200 tabular-nums">
              {summary.agentsFullyCovered}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-200/60 mt-1">At target</div>
          </Link>
          <Link
            href={tileLink("below")}
            className="rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-3 block hover:border-amber-300/50 transition-colors"
          >
            <div className="text-2xl font-bold text-amber-200 tabular-nums">
              {summary.agentsBelowTarget}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-amber-200/60 mt-1">Below target</div>
          </Link>
          <Link
            href={tileLink("none")}
            className="rounded-xl bg-red-500/10 border border-red-400/25 px-3 py-3 block hover:border-red-300/50 transition-colors"
          >
            <div className="text-2xl font-bold text-red-200 tabular-nums">
              {summary.agentsWithZeroQa}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-red-200/60 mt-1">Zero QA</div>
          </Link>
          <Link
            href={tileLink("exempt", QA_ROSTER_SCOPE_ALL)}
            className="rounded-xl bg-slate-500/10 border border-slate-400/25 px-3 py-3 block hover:border-slate-300/50 transition-colors"
          >
            <div className="text-2xl font-bold text-slate-200 tabular-nums">
              {summary.agentsExempt ?? 0}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-300/60 mt-1">Exempt</div>
          </Link>
          <Link
            href={tileLink("no_eligible_work")}
            className="rounded-xl bg-sky-500/10 border border-sky-400/25 px-3 py-3 block hover:border-sky-300/50 transition-colors"
          >
            <div className="text-2xl font-bold text-sky-200 tabular-nums">
              {summary.agentsNoEligibleWork ?? 0}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-sky-200/60 mt-1">No eligible work</div>
          </Link>
        </div>
        {summary.needsAttention.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40 mb-1">
              Needs attention
            </p>
            <p className="text-[10px] text-white/35 mb-2 leading-snug">
              Tracked agents with eligible work, not yet at target (current-version reviews in window).
              Up to {QA_NEEDS_ATTENTION_SNAPSHOT_LIMIT} rows; sorted by urgency (zero QA first).
            </p>
            <ul className="space-y-2">
              {summary.needsAttention.map((a) => (
                <li
                  key={a.agentId}
                  className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <span className="font-medium text-white/90 truncate max-w-[10rem]">
                    {a.name || a.email}
                  </span>
                  <span className="text-white/40 truncate max-w-[6rem]" title={a.qaTeam ?? ""}>
                    {a.qaTeam ?? "—"}
                  </span>
                  <span className="text-white/55 tabular-nums">
                    {a.reviewsCompleted}/{a.coverageTarget}
                  </span>
                  <span className="text-white/45 tabular-nums">Elig. {a.eligibleTaskCount}</span>
                  <span className="text-white/40">Last {formatShortDate(a.lastReviewedAt)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase ${statusBadgeClass(a.coverageStatus)}`}
                  >
                    {statusShort(a.coverageStatus)}
                  </span>
                  <Link
                    href={buildQaDashboardUrl({ ...dashBase, agentId: a.agentId })}
                    className="ml-auto text-violet-300/90 hover:text-violet-200 font-semibold"
                  >
                    Dashboard →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-white/10 pb-3 mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-violet-200/90">
              Who needs QA next
            </h2>
            <p className="text-[10px] text-white/40 mt-1 max-w-2xl leading-snug">
              Tracked agents with eligible work in the sprint who are not yet at target. Same pool and
              team filters as the snapshot. Up to {QA_SMART_QUEUE_LIMIT} rows.
            </p>
          </div>
        </div>
        {summary.smartQueue.length === 0 ? (
          <p className="text-xs text-white/45 py-2">No one queued — everyone at target or no eligible work.</p>
        ) : (
          <ul className="space-y-2">
            {summary.smartQueue.map((a) => (
              <li
                key={a.agentId}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white/90 truncate">{a.name || a.email}</div>
                  <div className="text-white/35 truncate">{a.email}</div>
                </div>
                <span className="text-white/45 shrink-0">{a.qaTeam ?? "—"}</span>
                <span className="text-white/60 tabular-nums shrink-0">
                  {a.reviewsCompleted}/{a.coverageTarget}
                </span>
                <span className="text-white/50 tabular-nums shrink-0">Elig. {a.eligibleTaskCount}</span>
                <span className="text-white/40 shrink-0">Last QA {formatShortDate(a.lastReviewedAt)}</span>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase shrink-0 ${statusBadgeClass(a.coverageStatus)}`}
                >
                  {statusShort(a.coverageStatus)}
                </span>
                <Link
                  href={buildQaDashboardUrl({ ...dashBase, agentId: a.agentId })}
                  className="shrink-0 px-2 py-1 rounded-md bg-violet-600/70 text-white text-[10px] font-semibold hover:bg-violet-600"
                >
                  Dashboard
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
