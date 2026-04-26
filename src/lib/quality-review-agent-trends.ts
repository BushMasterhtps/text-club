import { reportingYmdFromUtcInstant } from "@/lib/agent-reporting-day-bounds";
import { addDaysToYmd } from "@/lib/quality-review-sprint";

/** Inclusive count of PST reporting calendar days from `lo` through `hi` (labels sorted ascending). */
export function inclusiveReportingDaySpan(loYmd: string, hiYmd: string): number {
  const lo = loYmd <= hiYmd ? loYmd : hiYmd;
  const hi = loYmd <= hiYmd ? hiYmd : loYmd;
  let n = 0;
  let cur = lo;
  for (;;) {
    n++;
    if (cur === hi) break;
    cur = addDaysToYmd(cur, 1);
  }
  return n;
}

/**
 * Previous comparison window: same inclusive length as [startYmd, endYmd], ending the day before the
 * current window starts (PST calendar labels, same semantics as coverage APIs).
 */
export function previousMatchingReportingRangeYmd(
  startYmd: string,
  endYmd: string
): { prevStartYmd: string; prevEndYmd: string } {
  const lo = startYmd <= endYmd ? startYmd : endYmd;
  const hi = startYmd <= endYmd ? endYmd : startYmd;
  const span = inclusiveReportingDaySpan(lo, hi);
  const prevEndYmd = addDaysToYmd(lo, -1);
  const prevStartYmd = addDaysToYmd(prevEndYmd, -(span - 1));
  return { prevStartYmd, prevEndYmd };
}

export type ScoreTrendKind = "up" | "down" | "flat" | "new" | "none";

export function trendFromScoreDelta(
  currentAvg: number | null,
  previousAvg: number | null,
  previousHasReviews: boolean
): { delta: number | null; trend: ScoreTrendKind } {
  if (currentAvg == null) return { delta: null, trend: "none" };
  if (!previousHasReviews || previousAvg == null) {
    return { delta: null, trend: "new" };
  }
  const delta = Math.round((currentAvg - previousAvg) * 10) / 10;
  if (delta > 0) return { delta, trend: "up" };
  if (delta < 0) return { delta, trend: "down" };
  return { delta: 0, trend: "flat" };
}

export function formatScoreTrendArrow(trend: ScoreTrendKind, delta: number | null): string {
  if (trend === "none") return "—";
  if (trend === "new") return "New";
  if (trend === "flat") return "→ 0.0%";
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  const arrow = trend === "up" ? "↑" : "↓";
  return `${arrow} ${sign}${delta.toFixed(1)}%`;
}

type LineAgg = {
  slug: string;
  sectionTitle: string;
  label: string;
  sectionOrder: number;
  lineOrder: number;
  pass: number;
  fail: number;
  na: number;
};

function applicableTotal(a: LineAgg): number {
  return a.pass + a.fail;
}

function passRate(a: LineAgg): number | null {
  const t = applicableTotal(a);
  if (t <= 0) return null;
  return a.pass / t;
}

function failRate(a: LineAgg): number | null {
  const t = applicableTotal(a);
  if (t <= 0) return null;
  return a.fail / t;
}

export type LineCoachingSignal = "strong" | "improved" | "monitor" | "needs_coaching" | "new";

export function lineCoachingSignal(
  cur: LineAgg,
  prev: LineAgg | undefined
): LineCoachingSignal {
  const fr = failRate(cur);
  const failCount = cur.fail;
  if (failCount === 0 && (fr == null || fr === 0)) return "strong";
  if (!prev || applicableTotal(prev) === 0) {
    if (failCount === 0) return "strong";
    return "new";
  }
  const pfr = failRate(prev);
  const cfr = failRate(cur);
  if (pfr == null || cfr == null) return "monitor";
  const high = failCount >= 4 || cfr >= 0.4;
  const delta = cfr - pfr;
  if (delta > 0.001) return "needs_coaching";
  if (delta < -0.001) return "improved";
  return high ? "needs_coaching" : "monitor";
}

export function lineFailRateTrendLabel(
  cur: LineAgg,
  prev: LineAgg | undefined
): { label: string; worsened: boolean | null } {
  const cfr = failRate(cur);
  const pfr = prev && applicableTotal(prev) > 0 ? failRate(prev) : null;
  if (cfr == null) return { label: "—", worsened: null };
  if (pfr == null) return { label: "New", worsened: null };
  const pp = Math.round((cfr - pfr) * 1000) / 10; // percentage points
  if (Math.abs(pp) < 0.05) return { label: "→ 0.0pp", worsened: false };
  if (pp > 0) return { label: `↑ +${pp.toFixed(1)}pp`, worsened: true };
  return { label: `↓ ${pp.toFixed(1)}pp`, worsened: false };
}

export function coachingSignalLabel(s: LineCoachingSignal): string {
  switch (s) {
    case "strong":
      return "Strong";
    case "improved":
      return "Improved";
    case "monitor":
      return "Monitor";
    case "needs_coaching":
      return "Needs coaching";
    case "new":
      return "New";
    default:
      return "Monitor";
  }
}

export type ReviewLineRow = {
  response: string;
  line: {
    slug: string;
    sectionTitle: string;
    label: string;
    sectionOrder: number;
    lineOrder: number;
  } | null;
  labelSnapshot: string;
};

export type ReviewForTrend = {
  finalScore: number | null;
  submittedAt: Date | null;
  templateVersion: { template: { taskType: string } };
  lineResults: ReviewLineRow[];
};

export function aggregateReviewsByTaskType(
  reviews: ReviewForTrend[]
): Map<string, { scores: number[]; reviews: ReviewForTrend[] }> {
  const m = new Map<string, { scores: number[]; reviews: ReviewForTrend[] }>();
  for (const r of reviews) {
    const tt = r.templateVersion.template.taskType;
    if (!m.has(tt)) m.set(tt, { scores: [], reviews: [] });
    const bucket = m.get(tt)!;
    bucket.reviews.push(r);
    if (r.finalScore != null && Number.isFinite(r.finalScore)) {
      bucket.scores.push(r.finalScore);
    }
  }
  return m;
}

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function lineKey(slug: string, labelSnapshot: string): string {
  const s = slug?.trim();
  if (s) return `slug:${s}`;
  const lab = labelSnapshot?.trim() || "unknown";
  return `label:${lab}`;
}

export function aggregateLineStatsByTaskType(
  reviews: ReviewForTrend[],
  taskType: string
): Map<string, LineAgg> {
  const map = new Map<string, LineAgg>();
  for (const r of reviews) {
    if (r.templateVersion.template.taskType !== taskType) continue;
    for (const lr of r.lineResults) {
      const slug = lr.line?.slug?.trim() || "";
      const key = lineKey(slug, lr.labelSnapshot);
      const sectionTitle = lr.line?.sectionTitle ?? "—";
      const label = lr.line?.label ?? lr.labelSnapshot ?? "—";
      const sectionOrder = lr.line?.sectionOrder ?? 0;
      const lineOrder = lr.line?.lineOrder ?? 0;
      if (!map.has(key)) {
        map.set(key, {
          slug: slug || lr.labelSnapshot,
          sectionTitle,
          label,
          sectionOrder,
          lineOrder,
          pass: 0,
          fail: 0,
          na: 0,
        });
      }
      const row = map.get(key)!;
      if (lr.response === "PASS") row.pass++;
      else if (lr.response === "FAIL") row.fail++;
      else if (lr.response === "NA") row.na++;
      if (lr.line) {
        row.sectionOrder = lr.line.sectionOrder;
        row.lineOrder = lr.line.lineOrder;
        row.sectionTitle = lr.line.sectionTitle;
        row.label = lr.line.label;
        if (slug) row.slug = slug;
      }
    }
  }
  return map;
}

export function mergeLineKeysForTaskType(
  currentMap: Map<string, LineAgg>,
  previousMap: Map<string, LineAgg>
): string[] {
  const keys = new Set<string>([...currentMap.keys(), ...previousMap.keys()]);
  return [...keys].sort((a, b) => {
    const ca = currentMap.get(a) ?? previousMap.get(a);
    const cb = currentMap.get(b) ?? previousMap.get(b);
    const so = (ca?.sectionOrder ?? 0) - (cb?.sectionOrder ?? 0);
    if (so !== 0) return so;
    return (ca?.lineOrder ?? 0) - (cb?.lineOrder ?? 0);
  });
}

export function dailyScoreBuckets(
  reviews: ReviewForTrend[],
  startYmd: string,
  endYmd: string
): { dateYmd: string; avgScore: number; count: number }[] {
  const lo = startYmd <= endYmd ? startYmd : endYmd;
  const hi = startYmd <= endYmd ? endYmd : startYmd;
  const byDay = new Map<string, number[]>();
  let cur = lo;
  for (;;) {
    byDay.set(cur, []);
    if (cur === hi) break;
    cur = addDaysToYmd(cur, 1);
  }
  for (const r of reviews) {
    if (!r.submittedAt || r.finalScore == null) continue;
    const ymd = reportingYmdFromUtcInstant(r.submittedAt);
    if (!byDay.has(ymd)) continue;
    byDay.get(ymd)!.push(r.finalScore);
  }
  const out: { dateYmd: string; avgScore: number; count: number }[] = [];
  cur = lo;
  for (;;) {
    const scores = byDay.get(cur) ?? [];
    out.push({
      dateYmd: cur,
      count: scores.length,
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    });
    if (cur === hi) break;
    cur = addDaysToYmd(cur, 1);
  }
  return out;
}

export type LineCoachingRowOut = {
  slug: string;
  sectionTitle: string;
  label: string;
  pass: number;
  fail: number;
  na: number;
  passRate: number | null;
  failRate: number | null;
  previousPassRate: number | null;
  previousFailRate: number | null;
  failRateTrendLabel: string;
  coachingSignal: LineCoachingSignal;
  coachingLabel: string;
};

function emptyLineAggFrom(prev?: LineAgg): LineAgg {
  if (!prev) {
    return {
      slug: "",
      sectionTitle: "—",
      label: "—",
      sectionOrder: 999,
      lineOrder: 999,
      pass: 0,
      fail: 0,
      na: 0,
    };
  }
  return {
    ...prev,
    pass: 0,
    fail: 0,
    na: 0,
  };
}

export function buildLineCoachingRowsForTaskType(
  currentReviews: ReviewForTrend[],
  previousReviews: ReviewForTrend[],
  taskType: string
): LineCoachingRowOut[] {
  const curMap = aggregateLineStatsByTaskType(currentReviews, taskType);
  const prevMap = aggregateLineStatsByTaskType(previousReviews, taskType);
  const keys = mergeLineKeysForTaskType(curMap, prevMap);
  return keys.map((key) => {
    const curRaw = curMap.get(key);
    const pr = prevMap.get(key);
    const cur = curRaw ?? emptyLineAggFrom(pr);
    const sig = lineCoachingSignal(cur, pr);
    const { label: frTrend } = lineFailRateTrendLabel(cur, pr);
    return {
      slug: cur.slug,
      sectionTitle: cur.sectionTitle,
      label: cur.label,
      pass: cur.pass,
      fail: cur.fail,
      na: cur.na,
      passRate: passRate(cur),
      failRate: failRate(cur),
      previousPassRate: pr ? passRate(pr) : null,
      previousFailRate: pr ? failRate(pr) : null,
      failRateTrendLabel: frTrend,
      coachingSignal: sig,
      coachingLabel: coachingSignalLabel(sig),
    };
  });
}

export function lineFailRateChartData(rows: LineCoachingRowOut[]): { label: string; failRatePct: number }[] {
  return rows
    .filter((r) => r.pass + r.fail > 0)
    .map((r) => ({
      label: r.label.length > 42 ? `${r.label.slice(0, 40)}…` : r.label,
      failRatePct: r.failRate != null ? Math.round(r.failRate * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.failRatePct - a.failRatePct);
}
