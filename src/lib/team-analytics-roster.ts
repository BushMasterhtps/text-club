import type { PrismaClient } from "@prisma/client";
import {
  PRODUCTIVITY_ROSTER_TEAM_FILTER_ANY,
  resolveProductivityScorecardSubjects,
} from "@/lib/productivity-scorecard-subjects";

/** Holds assembly-line queues that appear as “active” work in /holds (excludes Duplicates + Completed). */
export const HOLDS_ACTIVE_WORKFLOW_QUEUES = [
  "Agent Research",
  "Customer Contact",
  "Escalated Call 4+ Day",
] as const;

export type TeamAnalyticsRosterResolution =
  | { filterActive: false; subjectIds: null }
  | { filterActive: true; subjectIds: string[] };

/**
 * Same roster scope as the performance scorecard / Team Analytics dropdown:
 * productivity-eligible agents (+ manager agents) optionally filtered by `User.rosterTeam`.
 */
export async function resolveTeamAnalyticsSubjectIds(
  db: PrismaClient,
  rosterTeam: string | null | undefined
): Promise<TeamAnalyticsRosterResolution> {
  const raw = (rosterTeam ?? "").trim();
  if (!raw || raw === PRODUCTIVITY_ROSTER_TEAM_FILTER_ANY) {
    return { filterActive: false, subjectIds: null };
  }
  const subjects = await resolveProductivityScorecardSubjects(db, {
    mode: "performance_scorecard",
    rosterTeam: raw,
  });
  return { filterActive: true, subjectIds: subjects.map((s) => s.id) };
}

/** Tasks attributed to a roster team (completed / sent-back / completed-by). */
export function teamAttributedTaskWhere(subjectIds: string[]) {
  return {
    OR: [
      { assignedToId: { in: subjectIds } },
      { sentBackBy: { in: subjectIds } },
      { completedBy: { in: subjectIds } },
    ],
  };
}
