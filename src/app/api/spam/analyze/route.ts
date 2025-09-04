// Advanced spam analysis API
import { NextResponse } from "next/server";
import { analyzeSpamPatterns, getImprovedSpamScore, learnFromSpamDecision } from "@/lib/spam-detection";

export async function POST(req: Request) {
  try {
    const { text, brand, action } = await req.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ 
        success: false, 
        error: "Text is required" 
      }, { status: 400 });
    }

    // Get improved spam score with historical learning
    const analysis = await getImprovedSpamScore(text, brand);
    
    // If this is a learning action (manual spam decision)
    if (action === 'learn' && typeof req.headers.get('x-spam-decision') === 'string') {
      const isSpam = req.headers.get('x-spam-decision') === 'true';
      await learnFromSpamDecision(text, isSpam, brand);
    }

    return NextResponse.json({
      success: true,
      analysis: {
        score: analysis.score,
        reasons: analysis.reasons,
        patterns: analysis.patterns,
        historicalConfidence: analysis.historicalConfidence,
        recommendation: analysis.score > 70 ? 'likely_spam' : 
                       analysis.score > 40 ? 'suspicious' : 'likely_legitimate'
      }
    });
  } catch (error) {
    console.error('Spam analysis error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Analysis failed" 
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const text = url.searchParams.get('text');
    const brand = url.searchParams.get('brand');
    
    if (!text) {
      return NextResponse.json({ 
        success: false, 
        error: "Text parameter is required" 
      }, { status: 400 });
    }

    const analysis = await getImprovedSpamScore(text, brand || undefined);
    
    return NextResponse.json({
      success: true,
      analysis: {
        score: analysis.score,
        reasons: analysis.reasons,
        patterns: analysis.patterns,
        historicalConfidence: analysis.historicalConfidence,
        recommendation: analysis.score > 70 ? 'likely_spam' : 
                       analysis.score > 40 ? 'suspicious' : 'likely_legitimate'
      }
    });
  } catch (error) {
    console.error('Spam analysis error:', error);
    return NextResponse.json({ 
      success: false, 
      error: "Analysis failed" 
    }, { status: 500 });
  }
}
