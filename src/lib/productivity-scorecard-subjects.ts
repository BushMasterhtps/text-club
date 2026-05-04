import type { PrismaClient } from "@prisma/client";

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
  }
): Promise<ProductivityScorecardSubject[]> {
  const where = {
    productivityEligible: true,
    isActive: true,
    OR: [{ role: "AGENT" as const }, { role: "MANAGER_AGENT" as const }],
    ...(params.mode === "sprint_rankings" ? { isLive: true } : {}),
  };

  return db.user.findMany({
    where,
    select: { id: true, name: true, email: true, rosterTeam: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}
