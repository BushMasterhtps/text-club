import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

/**
 * POST /api/agent/heartbeat
 * body: { id?: string; email?: string }
 * Updates lastSeen for the authenticated user, or for another user only when caller is MANAGER.
 */
export async function POST(req: NextRequest) {
  const session = await verifyAuth(req);
  if (!session.success) {
    return NextResponse.json(
      { success: false, error: session.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { id, email } = body as { id?: string; email?: string };

    if (!id && !email) {
      return NextResponse.json(
        { success: false, error: "id or email is required" },
        { status: 400 }
      );
    }

    const role = session.userRole!;
    const jwtId = session.userId!;
    const jwtEmail = (session.userEmail || "").toLowerCase().trim();

    if (role === "AGENT" || role === "MANAGER_AGENT") {
      if (id && id !== jwtId) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      const em = email ? String(email).toLowerCase().trim() : "";
      if (email && em !== jwtEmail) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const updated = await prisma.user.update({
      where: id ? { id } : { email: email! },
      data: {
        lastSeen: new Date(),
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
