import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/agent/heartbeat
 * body: { id?: string; email?: string }
 * - Updates lastSeen=now() and (optionally) flips isLive=true if you want.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, email } = body as { id?: string; email?: string };

    if (!id && !email) {
      return NextResponse.json(
        { success: false, error: "id or email is required" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: id ? { id } : { email: email! },
      data: {
        lastSeen: new Date(),
        // Optional: uncomment to auto-mark live when we see a heartbeat
        // isLive: true,
      },
      select: { id: true, email: true, isLive: true, lastSeen: true },
    });

    return NextResponse.json({ success: true, agent: updated });
  } catch (err) {
    console.error("heartbeat error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to record heartbeat" },
      { status: 500 }
    );
  }
}