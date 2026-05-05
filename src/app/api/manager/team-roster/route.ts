import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

/** Same max length as QA team label (`quality-review/roster`). */
const ROSTER_TEAM_MAX = 120;

const teamRosterSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isLive: true,
  rosterTeam: true,
  qaIsTracked: true,
  qaTeam: true,
  qaExemptReason: true,
  productivityEligible: true,
  productivityExemptReason: true,
  agentTypes: true,
} as const;

function normalizeRosterTeam(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (s.length > ROSTER_TEAM_MAX) {
    throw new Error(`Roster team must be at most ${ROSTER_TEAM_MAX} characters.`);
  }
  return s;
}

/** Team roster snapshot for Team Roster Configuration. */
export async function GET(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ role: "AGENT" }, { role: "MANAGER_AGENT" }],
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: teamRosterSelect,
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json({ success: true, data: { users } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manager/team-roster GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/** Update `rosterTeam` only (Phase 2.1). */
export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
    }
    if (!("rosterTeam" in body)) {
      return NextResponse.json(
        { success: false, error: "rosterTeam is required (use null or empty string to clear)." },
        { status: 400 }
      );
    }

    let normalized: string | null;
    try {
      normalized = normalizeRosterTeam(body.rosterTeam);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid roster team.";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        OR: [{ role: "AGENT" }, { role: "MANAGER_AGENT" }],
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "User not found or not eligible for team roster." },
        { status: 404 }
      );
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { rosterTeam: normalized },
      select: teamRosterSelect,
    });

    return NextResponse.json({ success: true, data: { user } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manager/team-roster PATCH]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
