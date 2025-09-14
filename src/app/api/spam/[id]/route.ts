// src/app/api/spam/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** DELETE /api/spam/[id] — delete one spam rule by ID */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
    }

    // Check if the rule exists
    const existingRule = await prisma.spamRule.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existingRule) {
      return NextResponse.json({ success: false, error: "Spam rule not found" }, { status: 404 });
    }

    // Delete the rule
    await prisma.spamRule.delete({ where: { id } });
    
    return NextResponse.json({ 
      success: true, 
      message: "Spam rule deleted successfully" 
    });
  } catch (err) {
    console.error("spam DELETE [id] error:", err);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to delete spam rule" 
    }, { status: 500 });
  }
}
