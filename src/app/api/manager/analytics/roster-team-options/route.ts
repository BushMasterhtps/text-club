import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

const baseWhere = {
  isActive: true,
  OR: [{ role: "AGENT" as const }, { role: "MANAGER_AGENT" as const }],
};

/**
 * Distinct `User.rosterTeam` labels for active agents/manager-agents (productivity roster scope).
 * Used by Team Analytics team filter; includes whether any user has unassigned roster team.
 */
export async function GET(req: NextRequest) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const groups = await prisma.user.groupBy({
      by: ["rosterTeam"],
      where: {
        ...baseWhere,
        rosterTeam: { not: null },
      },
    });

    const teams = groups
      .map((g) => g.rosterTeam)
      .filter((t): t is string => typeof t === "string" && t.trim() !== "")
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const unassignedCount = await prisma.user.count({
      where: {
        ...baseWhere,
        OR: [{ rosterTeam: null }, { rosterTeam: "" }],
      },
    });

    return NextResponse.json({
      success: true,
      teams,
      hasUnassigned: unassignedCount > 0,
    });
  } catch (e) {
    console.error("roster-team-options:", e);
    return NextResponse.json(
      { success: false, error: "Failed to load roster team options" },
      { status: 500 }
    );
  }
}
