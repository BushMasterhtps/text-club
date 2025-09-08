import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from 'bcryptjs';

// POST: set a temporary password
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || body?.userId || "").trim(); // Support both id and userId
    const tempPassword = String(body?.tempPassword || "").trim();
    
    if (!id || !tempPassword) {
      return NextResponse.json({ success: false, error: "User ID and temporary password are required" }, { status: 400 });
    }

    if (tempPassword.length < 8) {
      return NextResponse.json({ success: false, error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    // Hash the temporary password
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Update user with new password and mark as needing to change on first login
    await prisma.user.update({
      where: { id },
      data: { 
        password: hashedPassword,
        mustChangePassword: true
      },
    });
    
    return NextResponse.json({ 
      success: true, 
      message: "Temporary password set successfully. User will be prompted to change it on first login."
    });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return NextResponse.json({ success: false, error: err?.message || "Failed to set temporary password" }, { status: 500 });
  }
}


