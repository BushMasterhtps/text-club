// Remove learning data to prevent future false positives
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { text, brand, isSpam } = await req.json();
    
    if (!text) {
      return NextResponse.json({ 
        success: false, 
        error: "Text is required" 
      }, { status: 400 });
    }

    // Remove learning entries for this exact text and decision
    const deleted = await prisma.spamLearning.deleteMany({
      where: {
        text: text.substring(0, 1000),
        brand: brand || null,
        isSpam
      }
    });
    
    return NextResponse.json({
      success: true,
      message: `Removed ${deleted.count} learning entries to prevent future false positives`,
      deletedCount: deleted.count
    });
  } catch (error) {
    console.error('Unlearn error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to remove learning data" 
    }, { status: 500 });
  }
}
