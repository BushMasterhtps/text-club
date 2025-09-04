// Clear duplicate learning data
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
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
