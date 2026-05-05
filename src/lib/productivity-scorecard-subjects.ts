import type { Prisma, PrismaClient } from "@prisma/client";

export type ProductivityScorecardSubjectMode =
  | "performance_scorecard"
  | "sprint_rankings";

export type ProductivityScorecardDateRange = {
  start: string;
  end: string;
};

export type ProductivityScorecardSubject = {
  id: string;
  name: string | null;
  email: string;
  rosterTeam: string | null;
};

/** Query param: unset or this value = all roster teams (no roster filter). Mirrors QA `__any__`. */
export const PRODUCTIVITY_ROSTER_TEAM_FILTER_ANY = "__any__";

/** Query param: only users with null/blank `rosterTeam`. */
export const PRODUCTIVITY_ROSTER_TEAM_FILTER_UNASSIGNED = "__unassigned__";

/**
 * Extra `User` where clause from `rosterTeam` query param. Does not alter productivity eligibility.
 */
export function productivityRosterTeamWhereFromParam(
  raw: string | null | undefined
): Prisma.UserWhereInput {
  const t = (raw ?? "").trim();
  if (!t || t === PRODUCTIVITY_ROSTER_TEAM_FILTER_ANY) {
    return {};
  }
  if (t === PRODUCTIVITY_ROSTER_TEAM_FILTER_UNASSIGNED) {
    return {
      OR: [{ rosterTeam: null }, { rosterTeam: "" }],
    };
  }
  return { rosterTeam: t };
}

/**
 * Canonical list of users who appear as productivity scorecard / sprint ranking subjects.
 * Does not use tasks, Trello, or agentTypes for membership (eligibility is on User).
 */
export async function resolveProductivityScorecardSubjects(
  db: PrismaClient,
  params: {
    mode: ProductivityScorecardSubjectMode;
    /** Reserved for future window-specific rules; unused in v1. */
    dateRange?: ProductivityScorecardDateRange;
    /** Optional `User.rosterTeam` filter (query param `rosterTeam`). */
    rosterTeam?: string | null;
  }
): Promise<ProductivityScorecardSubject[]> {
  const rosterClause = productivityRosterTeamWhereFromParam(params.rosterTeam);

  const andParts: Prisma.UserWhereInput[] = [
    { productivityEligible: true, isActive: true },
    { OR: [{ role: "AGENT" as const }, { role: "MANAGER_AGENT" as const }] },
    ...(params.mode === "sprint_rankings" ? [{ isLive: true }] : []),
    ...(Object.keys(rosterClause).length > 0 ? [rosterClause] : []),
  ];

  const where: Prisma.UserWhereInput = { AND: andParts };

  return db.user.findMany({
    where,
    select: { id: true, name: true, email: true, rosterTeam: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}
