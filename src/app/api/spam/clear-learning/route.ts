// Clear duplicate learning data
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerApiAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requireManagerApiAuth(request);
  if (!auth.allowed) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    // Delete all existing learning data
    const deletedCount = await prisma.spamLearning.deleteMany({});
    
    return NextResponse.json({
      success: true,
      message: `Cleared ${deletedCount.count} learning records`,
      deletedCount: deletedCount.count
    });
  } catch (error) {
    console.error('Clear learning data error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to clear learning data" 
    }, { status: 500 });
  }
}
