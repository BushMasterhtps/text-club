// Learn from individual spam/legitimate decisions
import { NextRequest, NextResponse } from "next/server";
import { learnFromSpamDecision } from "@/lib/spam-detection";
import { apiAuthDeniedResponse, requireManagerApiAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireManagerApiAuth(req);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

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
