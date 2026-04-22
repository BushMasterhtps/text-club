import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

const QA_TEAM_MAX = 120;

function normalizeTeam(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (s.length > QA_TEAM_MAX) {
    throw new Error(`QA team must be at most ${QA_TEAM_MAX} characters.`);
  }
  return s;
}

function normalizeExemptReason(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const s = String(input).trim();
  return s.length ? s : null;
}

/** List active agents / manager-agents with QA roster fields (manager-only). */
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
        qaIsTracked: true,
        qaTeam: true,
        qaExemptReason: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    return NextResponse.json({ success: true, data: { users } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[quality-review/roster GET]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/** Update QA roster fields for one agent row. */
export async function PATCH(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
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
        { success: false, error: "User not found or not eligible for QA roster." },
        { status: 404 }
      );
    }

    const data: {
      qaIsTracked?: boolean;
      qaTeam?: string | null;
      qaExemptReason?: string | null;
    } = {};

    if ("qaIsTracked" in body) {
      if (typeof body.qaIsTracked !== "boolean") {
        return NextResponse.json(
          { success: false, error: "qaIsTracked must be a boolean when provided." },
          { status: 400 }
        );
      }
      data.qaIsTracked = body.qaIsTracked;
    }

    if ("qaTeam" in body) {
      data.qaTeam = normalizeTeam(body.qaTeam);
    }
    if ("qaExemptReason" in body) {
      data.qaExemptReason = normalizeExemptReason(body.qaExemptReason);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: "No updatable fields supplied." },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        qaIsTracked: true,
        qaTeam: true,
        qaExemptReason: true,
      },
    });

    return NextResponse.json({ success: true, data: { user: updated } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("QA team must")) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    console.error("[quality-review/roster PATCH]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
