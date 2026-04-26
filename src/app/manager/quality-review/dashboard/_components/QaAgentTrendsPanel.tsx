"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { lineFailRateChartData, type LineCoachingRowOut } from "@/lib/quality-review-agent-trends";

type TaskTypeRow = {
  taskType: string;
  currentCount: number;
  previousCount: number;
  currentAvg: number | null;
  previousAvg: number | null;
  deltaPercent: number | null;
  trend: string;
  trendLabel: string;
};

type TrendsPayload = {
  agentId: string;
  current: { startYmd: string; endYmd: string };
  previous: { startYmd: string; endYmd: string };
  overall: {
    currentAvg: number | null;
    previousAvg: number | null;
    deltaPercent: number | null;
    trend: string;
    trendLabel: string;
    currentReviewCount: number;
    previousReviewCount: number;
  };
  byTaskType: TaskTypeRow[];
  scoreChart: { dateYmd: string; avgScore: number; count: number }[];
  lineCoachingByTaskType: Record<string, LineCoachingRowOut[]>;
};

type ScoreLineDatum = {
  dateYmd: string;
  shortDate: string;
  avgScore: number;
  count: number;
};

type FailBarDatum = { label: string; failRatePct: number };

/** Stable for Recharts — avoid new object identity each parent render (reduces SVG redraw / flicker). */
const SCORE_CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 } as const;
const BAR_CHART_MARGIN = { top: 4, right: 12, left: 4, bottom: 4 } as const;
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: "#171717",
  border: "1px solid #333",
  fontSize: 12,
};
const AXIS_TICK_SM = { fill: "#fff8", fontSize: 10 } as const;
const AXIS_TICK_Y_CAT = { fill: "#fff9", fontSize: 9 } as const;
const Y_DOMAIN_SCORE: [number, number] = [0, 100];
const BAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0];
const GRID_STROKE = "#ffffff18";
const LINE_DOT_PROPS = { r: 3 } as const;

function scoreTooltipFormatter(
  v: number,
  name: string,
  item: { payload?: { count?: number } }
): [string | number, string] {
  if (name === "avgScore") {
    const c = item?.payload?.count ?? 0;
    return [`${v.toFixed(1)}% (${c} review${c === 1 ? "" : "s"})`, "Avg score"];
  }
  return [v, name];
}

function scoreTooltipLabel(
  _l: unknown,
  payload: ReadonlyArray<{ payload?: { dateYmd?: string } }>
): string {
  return payload?.[0]?.payload?.dateYmd ?? "";
}

function failTooltipFormatter(v: number): [string, string] {
  return [`${v}%`, "Fail rate"];
}

const AgentTrendScoreLineChart = memo(function AgentTrendScoreLineChart({ data }: { data: ScoreLineDatum[] }) {
  return (
    <div className="h-48 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" debounce={120}>
        <LineChart data={data} margin={SCORE_CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="shortDate" tick={AXIS_TICK_SM} />
          <YAxis domain={Y_DOMAIN_SCORE} width={36} tick={AXIS_TICK_SM} />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={scoreTooltipFormatter as unknown as (...a: unknown[]) => [string, string]}
            labelFormatter={scoreTooltipLabel as unknown as (...a: unknown[]) => string}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="avgScore"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={LINE_DOT_PROPS}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const AgentTrendFailRateBarChart = memo(function AgentTrendFailRateBarChart({ data }: { data: FailBarDatum[] }) {
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" debounce={120}>
        <BarChart data={data} layout="vertical" margin={BAR_CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis type="number" domain={Y_DOMAIN_SCORE} tick={AXIS_TICK_SM} />
          <YAxis type="category" dataKey="label" width={120} tick={AXIS_TICK_Y_CAT} />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            formatter={failTooltipFormatter as unknown as (...a: unknown[]) => [string, string]}
            isAnimationActive={false}
          />
          <Bar dataKey="failRatePct" fill="#f97316" radius={BAR_RADIUS} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

function formatReportingYmdHuman(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatYmdRangeHumanLabel(startYmd: string, endYmd: string): string {
  const lo = startYmd <= endYmd ? startYmd : endYmd;
  const hi = startYmd <= endYmd ? endYmd : startYmd;
  return `${formatReportingYmdHuman(lo)} – ${formatReportingYmdHuman(hi)}`;
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtScore(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

type Props = {
  agentId: string;
  startDate: string;
  endDate: string;
  agentLabel: string;
};

export function QaAgentTrendsPanel({ agentId, startDate, endDate, agentLabel }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrendsPayload | null>(null);
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/manager/quality-review/dashboard/agents/${encodeURIComponent(agentId)}/trends?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load trends");
      const d = json.data as TrendsPayload;
      setData(d);
      const first =
        d.byTaskType.find((r) => r.currentCount > 0)?.taskType ?? d.byTaskType[0]?.taskType ?? null;
      setSelectedTaskType(first);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [agentId, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOpen(true);
  }, [agentId]);

  const lineRows = useMemo(() => {
    if (!data || !selectedTaskType) return [];
    return data.lineCoachingByTaskType[selectedTaskType] ?? [];
  }, [data, selectedTaskType]);

  const failBarData = useMemo(() => lineFailRateChartData(lineRows), [lineRows]);

  const scoreLineData = useMemo((): ScoreLineDatum[] => {
    if (!data) return [];
    return data.scoreChart
      .filter((r) => r.count > 0)
      .map((r) => ({
        ...r,
        shortDate: r.dateYmd.slice(5),
      }));
  }, [data]);

  const periodLabels = useMemo(() => {
    if (!data) return null;
    return {
      currentHuman: formatYmdRangeHumanLabel(data.current.startYmd, data.current.endYmd),
      previousHuman: formatYmdRangeHumanLabel(data.previous.startYmd, data.previous.endYmd),
      currentRaw: `${data.current.startYmd} → ${data.current.endYmd}`,
      previousRaw: `${data.previous.startYmd} → ${data.previous.endYmd}`,
    };
  }, [data]);

  const scoreChartKey = useMemo(
    () => `trends-score-${agentId}-${startDate}-${endDate}`,
    [agentId, startDate, endDate]
  );

  const failChartKey = useMemo(
    () => `trends-fail-${agentId}-${startDate}-${endDate}-${selectedTaskType ?? "none"}`,
    [agentId, startDate, endDate, selectedTaskType]
  );

  return (
    <section className="rounded-2xl border border-cyan-500/20 bg-neutral-950/70 p-4 md:p-5 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-white">Agent QA Trends</h2>
          <p className="text-[11px] text-white/45 mt-0.5">
            Official scores only (submitted, current version) for{" "}
            <span className="text-white/70">{agentLabel}</span>
            {periodLabels ? (
              <>
                . Current period (your selected dashboard range):{" "}
                <span className="text-white/55 tabular-nums">{periodLabels.currentHuman}</span>
                {" · "}
                Compared with the previous matching period:{" "}
                <span className="text-white/55 tabular-nums">{periodLabels.previousHuman}</span>
              </>
            ) : (
              <span className="text-white/40"> · Loading period details…</span>
            )}
          </p>
        </div>
        <span className="text-white/50 text-sm shrink-0" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <>
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          )}
          {loading && <p className="text-sm text-white/45">Loading trends…</p>}
          {!loading && data && periodLabels && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-200/80">
                  How this comparison works
                </p>
                <p className="text-xs text-white/75 leading-relaxed">
                  <span className="font-semibold text-white/85">Current period</span> is the date range you
                  selected on the dashboard (PST reporting labels).{" "}
                  <span className="font-semibold text-white/85">Previous period</span> is the same number of
                  consecutive reporting days immediately before that range — not “the rest of the month.”
                </p>
                <ul className="text-xs text-white/70 space-y-1 list-disc pl-4">
                  <li>
                    <span className="text-white/80">Current period:</span> {periodLabels.currentHuman}{" "}
                    <span className="text-white/40">({periodLabels.currentRaw})</span>
                  </li>
                  <li>
                    <span className="text-white/80">Previous matching period:</span>{" "}
                    {periodLabels.previousHuman}{" "}
                    <span className="text-white/40">({periodLabels.previousRaw})</span>
                  </li>
                </ul>
                <p className="text-[10px] text-white/40 leading-relaxed border-t border-white/10 pt-2">
                  For a month-over-month style view, pick the month you want to review on the dashboard; this
                  panel will compare it to the prior block of the same length. A dedicated month-vs-month mode
                  can be added later.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-200/80">
                  Overall summary
                </p>
                <p className="text-white/85">
                  Current avg:{" "}
                  <span className="font-semibold tabular-nums">{fmtScore(data.overall.currentAvg)}</span>
                  <span className="text-white/40 mx-2">·</span>
                  Previous avg:{" "}
                  <span className="font-semibold tabular-nums">{fmtScore(data.overall.previousAvg)}</span>
                </p>
                <p className="text-white/85">
                  Trend:{" "}
                  <span className="font-semibold text-cyan-200/95">{data.overall.trendLabel}</span>
                  <span className="text-white/40 mx-2">·</span>
                  Reviews:{" "}
                  <span className="tabular-nums">
                    {data.overall.currentReviewCount} current / {data.overall.previousReviewCount}{" "}
                    previous
                  </span>
                </p>
                <p className="text-[10px] text-white/35 pt-1">
                  Review history below may include superseded rows; this panel uses only current-version
                  official scores.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-2">
                  Overall QA score (current period)
                </p>
                {scoreLineData.length === 0 ? (
                  <p className="text-xs text-white/45 py-6 text-center rounded-xl border border-white/10 bg-black/25">
                    No scored reviews with a submission timestamp in this window (or all on the same
                    reporting day without daily spread).
                  </p>
                ) : (
                  <div key={scoreChartKey}>
                    <AgentTrendScoreLineChart data={scoreLineData} />
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/45 mb-2">
                  By task type
                </p>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/40 text-left text-[11px] uppercase tracking-wide text-white/45">
                      <tr>
                        <th className="px-3 py-2">Task type</th>
                        <th className="px-3 py-2 tabular-nums">Reviews</th>
                        <th className="px-3 py-2 tabular-nums">Avg</th>
                        <th className="px-3 py-2 tabular-nums">Prev avg</th>
                        <th className="px-3 py-2">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.byTaskType.map((row) => (
                        <tr
                          key={row.taskType}
                          className={`cursor-pointer hover:bg-white/[0.06] ${
                            selectedTaskType === row.taskType ? "bg-cyan-500/10" : ""
                          }`}
                          onClick={() => setSelectedTaskType(row.taskType)}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-violet-200/90">{row.taskType}</td>
                          <td className="px-3 py-2 tabular-nums text-white/80">
                            {row.currentCount} / {row.previousCount}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{fmtScore(row.currentAvg)}</td>
                          <td className="px-3 py-2 tabular-nums">{fmtScore(row.previousAvg)}</td>
                          <td className="px-3 py-2 text-cyan-200/95">{row.trendLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-white/35 mt-1">Click a row for line-level coaching.</p>
              </div>

              {selectedTaskType && (
                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">
                    Line coaching — {selectedTaskType}
                  </p>
                  {failBarData.length === 0 ? (
                    <p className="text-xs text-white/45 py-4 text-center rounded-xl border border-white/10 bg-black/25">
                      No applicable line responses (all N/A or no data) for this task type in the current
                      window.
                    </p>
                  ) : (
                    <div key={failChartKey}>
                      <AgentTrendFailRateBarChart data={failBarData} />
                    </div>
                  )}
                  {lineRows.length === 0 ? (
                    <p className="text-xs text-white/45 py-3 px-2 rounded-xl border border-white/10 bg-black/20">
                      No line-level results for this task type in the current window (or template lines
                      did not match any aggregated keys).
                    </p>
                  ) : (
                    <div className="overflow-x-auto max-h-[360px] overflow-y-auto rounded-xl border border-white/10">
                      <table className="min-w-full text-xs">
                        <thead className="sticky top-0 bg-black/50 text-left text-[10px] uppercase tracking-wide text-white/45">
                          <tr>
                            <th className="px-2 py-2">Section</th>
                            <th className="px-2 py-2">Line</th>
                            <th className="px-2 py-2 tabular-nums">P/F/NA</th>
                            <th className="px-2 py-2 tabular-nums">Pass%</th>
                            <th className="px-2 py-2 tabular-nums">Fail%</th>
                            <th className="px-2 py-2 tabular-nums">Prev pass%</th>
                            <th className="px-2 py-2 tabular-nums">Prev fail%</th>
                            <th className="px-2 py-2">Fail Δ</th>
                            <th className="px-2 py-2">Signal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {lineRows.map((ln) => (
                            <tr key={`${ln.slug}-${ln.label}`} className="hover:bg-white/[0.03]">
                              <td
                                className="px-2 py-1.5 text-white/55 max-w-[7rem] truncate"
                                title={ln.sectionTitle}
                              >
                                {ln.sectionTitle}
                              </td>
                              <td className="px-2 py-1.5 text-white/80 max-w-[12rem] truncate" title={ln.label}>
                                {ln.label}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-white/70">
                                {ln.pass}/{ln.fail}/{ln.na}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{pct(ln.passRate)}</td>
                              <td className="px-2 py-1.5 tabular-nums">{pct(ln.failRate)}</td>
                              <td className="px-2 py-1.5 tabular-nums">{pct(ln.previousPassRate)}</td>
                              <td className="px-2 py-1.5 tabular-nums">{pct(ln.previousFailRate)}</td>
                              <td className="px-2 py-1.5 text-cyan-200/90 whitespace-nowrap">
                                {ln.failRateTrendLabel}
                              </td>
                              <td className="px-2 py-1.5 text-white/75">{ln.coachingLabel}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
