import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH: update user role
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const role = body?.role === "MANAGER" ? "MANAGER" : body?.role === "MANAGER_AGENT" ? "MANAGER_AGENT" : body?.role === "AGENT" ? "AGENT" : null;
    if (!id || !role) {
      return NextResponse.json({ success: false, error: "id and role are required" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to update role" }, { status: 500 });
  }
}


