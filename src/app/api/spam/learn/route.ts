// Learn from individual spam/legitimate decisions
import { NextResponse } from "next/server";
import { learnFromSpamDecision } from "@/lib/spam-detection";

export async function POST(req: Request) {
  try {
    const { text, brand, isSpam, source } = await req.json();
    
    if (!text) {
      return NextResponse.json({ 
        success: false, 
        error: "Text is required" 
      }, { status: 400 });
    }

    await learnFromSpamDecision(text, isSpam, brand, source);
    
    return NextResponse.json({
      success: true,
      message: `Learned from ${isSpam ? 'spam' : 'legitimate'} decision (${source || 'unknown'} source)`
    });
  } catch (error) {
    console.error('Learn from decision error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to learn from decision" 
    }, { status: 500 });
  }
}
