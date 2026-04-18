import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

// PATCH: toggle live/pause
export async function PATCH(req: NextRequest) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const isLive = typeof body?.isLive === "boolean" ? (body.isLive as boolean) : null;
    if (!id || isLive === null) {
      return NextResponse.json({ success: false, error: "id and isLive are required" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isLive, lastSeen: isLive ? new Date() : null },
      select: { id: true, email: true, isLive: true, lastSeen: true },
    });
    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to toggle live" }, { status: 500 });
  }
}


