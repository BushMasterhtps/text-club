import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requireStaffApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    const bodyEmail = String(email).toLowerCase().trim();
    const jwtEmail = auth.userEmail.toLowerCase().trim();
    if (bodyEmail !== jwtEmail) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Update lastSeen timestamp for the authenticated user only
    await prisma.user.updateMany({
      where: { email: bodyEmail },
      data: { lastSeen: new Date() }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error updating user heartbeat:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update heartbeat" },
      { status: 500 }
    );
  }
}
