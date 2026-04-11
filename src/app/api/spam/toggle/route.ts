// src/app/api/spam/toggle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

const prisma = new PrismaClient();

export async function PATCH(req: NextRequest) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const body = await req.json() as { id?: string; enabled?: boolean };
    if (!body?.id || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "id and enabled are required" },
        { status: 400 }
      );
    }

    const rule = await prisma.spamRule.update({
      where: { id: body.id },
      data: { enabled: body.enabled },
      select: { id: true, pattern: true, enabled: true, createdAt: true },
    });

    return NextResponse.json({ success: true, rule });
  } catch (err) {
    console.error("spam toggle error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to toggle rule" },
      { status: 500 }
    );
  }
}