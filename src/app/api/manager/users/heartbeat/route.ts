import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // Update lastSeen timestamp for the user
    await prisma.user.updateMany({
      where: { email },
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
