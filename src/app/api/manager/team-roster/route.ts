import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

/** Read-only roster snapshot for Team Roster Configuration (Phase 2.0). */
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
      select: {
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
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json({ success: true, data: { users } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[manager/team-roster GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
