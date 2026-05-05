'use client';

import { Card } from '@/app/_components/Card';
import { formatYmdStringForDisplay } from '@/lib/format-ymd-label';
import { formatQaCoverageStatus } from '@/lib/qa-coverage-display';
import { buildQaDashboardUrl } from '@/lib/quality-review-dashboard';

type Props = {
  scorecardData: any;
  loading: boolean;
  /** Optional Card/root classes (e.g. Team Analytics side-by-side height). */
  className?: string;
};

/**
 * Read-only QA pillar for Team Analytics: same agents/date/rosterTeam scope as Performance Scorecard API.
 */
export default function ScorecardQaPanel({ scorecardData, loading, className }: Props) {
  if (loading) {
    return (
      <Card
        className={`p-5 h-full min-h-[12rem] flex flex-col justify-center border border-cyan-500/20 bg-cyan-950/10 ${className ?? ''}`}
      >
        <p className="text-sm text-white/60">Loading quality review metrics…</p>
      </Card>
    );
  }

  const agents = scorecardData?.agents as any[] | undefined;
  if (!agents?.length) {
    return null;
  }

  const qa = scorecardData?.qaReportingPeriod as
    | { startYmd: string; endYmd: string }
    | undefined;

  return (
    <Card
      className={`p-5 h-full min-h-0 flex flex-col border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 to-transparent ring-1 ring-cyan-500/15 ${className ?? ''}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-base font-semibold text-cyan-200 tracking-tight flex items-center gap-2">
            <span aria-hidden>✅</span> Quality Review
          </h3>
          <p className="text-xs text-white/55 mt-1 max-w-xl leading-relaxed">
            Read-only coverage metrics from submitted, current-version QA reviews. Same team and date
            range as the Performance Scorecard above—not blended into productivity or Hybrid scoring.
          </p>
        </div>
        {qa?.startYmd && qa?.endYmd && (
          <p className="text-xs text-white/45 shrink-0">
            QA window: {formatYmdStringForDisplay(qa.startYmd)} –{' '}
            {formatYmdStringForDisplay(qa.endYmd)}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-white/10">
        <table className="w-full text-sm text-left min-w-[720px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-xs text-white/55 uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Reviews / target</th>
              <th className="px-3 py-2 font-medium">Avg QA</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last review</th>
              <th className="px-3 py-2 font-medium">By</th>
              <th className="px-3 py-2 font-medium">Tracked</th>
              <th className="px-3 py-2 font-medium">QA team</th>
              <th className="px-3 py-2 font-medium">Roster</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const dashboardUrl =
                qa?.startYmd && qa?.endYmd
                  ? buildQaDashboardUrl({
                      startYmd: qa.startYmd,
                      endYmd: qa.endYmd,
                      agentId: a.id,
                    })
                  : null;
              return (
                <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-white">{a.name}</div>
                    <div className="text-xs text-white/45 truncate max-w-[10rem]" title={a.email}>
                      {a.email}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-white/90 whitespace-nowrap">
                    {a.qaReviewsCompleted ?? 0} / {a.qaCoverageTarget ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-white/90">
                    {a.qaAvgScore != null && !Number.isNaN(a.qaAvgScore)
                      ? Number(a.qaAvgScore).toFixed(1)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-white/90">{formatQaCoverageStatus(a.qaCoverageStatus)}</td>
                  <td className="px-3 py-2 text-xs text-white/80 whitespace-nowrap">
                    {a.qaLastReviewedAt
                      ? new Date(a.qaLastReviewedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-white/75 max-w-[7rem] truncate" title={a.qaLastReviewedBy?.email}>
                    {a.qaLastReviewedBy
                      ? a.qaLastReviewedBy.name?.trim() || a.qaLastReviewedBy.email
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-white/90">{a.qaIsTracked ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-xs text-white/75 max-w-[6rem] truncate" title={a.qaTeam ?? ""}>
                    {a.qaTeam ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-white/75 max-w-[6rem] truncate" title={a.rosterTeam ?? ""}>
                    {a.rosterTeam ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {dashboardUrl ? (
                      <a
                        href={dashboardUrl}
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-medium whitespace-nowrap"
                      >
                        QA dashboard →
                      </a>
                    ) : (
                      <span className="text-white/35 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-white/40 mt-3 leading-relaxed shrink-0">
        Official QA workflows and filters are unchanged on the Quality Review dashboard. This table is a
        parallel view for the scorecard roster only.
      </p>
    </Card>
  );
}
