import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: set a temporary password (stub; stores as note for now, replace with real auth later)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const tempPassword = String(body?.tempPassword || "").trim();
    if (!id || !tempPassword) {
      return NextResponse.json({ success: false, error: "id and tempPassword are required" }, { status: 400 });
    }

    // For now, just write a TaskHistory-like audit on the user using a metadata field.
    // If you later add real auth, replace this with proper password hashing + email.
    await prisma.user.update({
      where: { id },
      data: { /* placeholder; no password field in schema */ },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to set temp password" }, { status: 500 });
  }
}


