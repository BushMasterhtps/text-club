import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * PATCH /api/manager/agents/toggle
 * body: { id: string, isLive: boolean }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, isLive } = body as { id?: string; isLive?: boolean };

    if (!id || typeof isLive !== "boolean") {
      return NextResponse.json(
        { success: false, error: "id and isLive are required" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        isLive,
        // when going live, bump heartbeat immediately; when pausing, clear it
        lastSeen: isLive ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        isLive: true,
        lastSeen: true,
      },
    });

    return NextResponse.json({ success: true, agent: updated });
  } catch (err) {
    console.error("toggle live failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to toggle agent" },
      { status: 500 }
    );
  }
}