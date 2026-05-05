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

function normalizeProductivityExemptReason(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  return s.length ? s : null;
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

/**
 * Sparse update: any of `rosterTeam`, `productivityEligible`, `productivityExemptReason`.
 * Only keys present in the body are written. QA fields and agentTypes are never updated here.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
    }

    const data: {
      rosterTeam?: string | null;
      productivityEligible?: boolean;
      productivityExemptReason?: string | null;
    } = {};

    if ("rosterTeam" in body) {
      try {
        data.rosterTeam = normalizeRosterTeam(body.rosterTeam);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid roster team.";
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
    }

    if ("productivityEligible" in body) {
      if (typeof body.productivityEligible !== "boolean") {
        return NextResponse.json(
          { success: false, error: "productivityEligible must be a boolean when provided." },
          { status: 400 }
        );
      }
      data.productivityEligible = body.productivityEligible;
    }

    if ("productivityExemptReason" in body) {
      data.productivityExemptReason = normalizeProductivityExemptReason(body.productivityExemptReason);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No updatable fields supplied. Send one or more of: rosterTeam, productivityEligible, productivityExemptReason.",
        },
        { status: 400 }
      );
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
      data,
      select: teamRosterSelect,
    });

    return NextResponse.json({ success: true, data: { user } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manager/team-roster PATCH]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
