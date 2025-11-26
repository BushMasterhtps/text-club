import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";
import { getImprovedSpamScore, analyzeSpamPatterns } from "@/lib/spam-detection";
import { fuzzyContains } from "@/lib/fuzzy-matching";

/** simple normalize: lowercase, strip punctuation, collapse spaces */
function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ruleMatchesText(
  r: { pattern: string; patternNorm: string; mode: SpamMode; brand: string | null },
  brand: string | null | undefined,
  text: string | null | undefined
) {
  // brand-scoped rule? only apply when brand matches (case-insensitive)
  if (r.brand && norm(brand) !== norm(r.brand)) return false;

  const t = norm(text);
  const p = r.patternNorm ? norm(r.patternNorm) : norm(r.pattern);

  if (!p || !t) return false;

  if (r.mode === SpamMode.CONTAINS) {
    // First try exact word boundary matching (fast path)
    const words = t.split(/\s+/);
    const patternWords = p.split(/\s+/);
    
    // For single-word patterns, check if it exists as a complete word
    if (patternWords.length === 1) {
      // Exact match first (strict word boundary)
      if (words.some(word => word === p)) return true;
      
      // Then try fuzzy matching for variations (e.g., "unlock", "UnLOck", "nlock")
      // Only use fuzzy for common spam keywords that have variations
      // IMPORTANT: Don't use fuzzy for typos like "fodd" - they should only match exactly
      const fuzzyKeywords = ['unlock', 'claim', 'win', 'free', 'urgent'];
      const isTypoPattern = p.length <= 4 && /[^aeiou]{3,}/i.test(p); // Likely typo if short and has many consonants
      
      if (!isTypoPattern && fuzzyKeywords.some(keyword => similarity(p, keyword) > 0.5)) {
        return fuzzyContains(t, p, 0.7); // 70% similarity threshold
      }
      
      // For typo patterns or non-fuzzy keywords, require exact match only
      return false;
    }
    
    // For multi-word patterns, check if the phrase exists with word boundaries
    const regex = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (regex.test(t)) return true;
    
    // If exact match fails, try fuzzy matching for multi-word patterns
    return fuzzyContains(t, p, 0.75); // 75% similarity for phrases
  }
  if (r.mode === SpamMode.LONE) return t === p; // exactly the lone token/phrase
  return false;
}

// Helper function for similarity check (simple version for inline use)
function similarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;
  
  const maxLen = Math.max(str1.length, str2.length);
  let distance = 0;
  
  // Simple character-by-character comparison
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] !== str2[i]) distance++;
  }
  distance += Math.abs(str1.length - str2.length);
  
  return 1 - (distance / maxLen);
}

export async function GET() {
  try {
    // CACHE BUST: Force new deployment to clear Netlify cache
    // 1) load enabled rules
    const rules = await prisma.spamRule.findMany({
      where: { enabled: true },
      select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
      orderBy: { updatedAt: "desc" },
    });

  // 2) pull "pending" raws - ONLY scan READY (not yet processed) messages
  // FIX: Do not scan PROMOTED messages as they are already converted to tasks
  // PROMOTED messages should not be re-scanned for spam
  const raws = await prisma.rawMessage.findMany({
    where: { 
      status: RawStatus.READY  // FIX: Only scan READY messages
    },
    select: { id: true, brand: true, text: true },
    orderBy: { createdAt: "desc" },
    take: 1000, // Increased to show more accurate preview (was 500)
  });

  let matchedCount = 0;
  let learningMatchedCount = 0;
  const matches: Array<{
    taskId: string;
    brand: string | null;
    text: string | null;
    matchedPatterns: string[];
    learningScore?: number;
    learningReasons?: string[];
  }> = [];

  // Process in batches to prevent timeout and connection exhaustion
  const PROCESSING_BATCH_SIZE = 100;
  for (let i = 0; i < raws.length; i += PROCESSING_BATCH_SIZE) {
    const batch = raws.slice(i, i + PROCESSING_BATCH_SIZE);
    
    for (const rm of batch) {
      const hits: string[] = [];
      let patternScore = 0;
      let learningScore = 0;
      let learningReasons: string[] = [];
      
      // Check simple phrase rules
      for (const r of rules) {
        if (ruleMatchesText(r, rm.brand, rm.text)) {
          hits.push(r.pattern);
        }
      }
      
      // Check pattern detection for obvious spam (gibberish, random numbers, etc.)
      // This catches obvious spam that phrase rules might miss
      if (rm.text) {
        try {
          const patternResult = analyzeSpamPatterns(rm.text);
          patternScore = patternResult.score;
          
          // Lower threshold for obvious spam patterns (50% instead of 60%)
          // This catches more spam including single words, short messages, etc.
          if (patternScore >= 50) {
            const patternReasons = patternResult.reasons.slice(0, 2).join(', ');
            hits.push(`Pattern: ${Math.round(patternScore)}% (${patternReasons})`);
          }
        } catch (error) {
          console.error('Error analyzing patterns:', error);
        }
      }
      
      // Check learning system (only if no simple rule or pattern matches for efficiency)
      // Limit learning system checks to prevent timeout (only check first 200 items)
      if (hits.length === 0 && rm.text && i < 200) {
        try {
          const learningResult = await getImprovedSpamScore(rm.text, rm.brand || undefined);
          learningScore = learningResult.score;
          learningReasons = learningResult.reasons;
          
          // Lower threshold to 60% for learning system too (was 70%)
          if (learningScore >= 60) {
            learningMatchedCount++;
          }
        } catch (error) {
          console.error('Error getting learning score:', error);
          // Continue processing even if learning system fails
        }
      }
      
      // Count as matched if either simple rules, patterns, OR learning system catches it
      if (hits.length > 0 || learningScore >= 60) {
        matchedCount++;
        matches.push({
          taskId: rm.id, // kept name "taskId" for your existing UI type
          brand: rm.brand,
          text: rm.text,
          matchedPatterns: hits,
          learningScore: learningScore > 0 ? learningScore : undefined,
          learningReasons: learningReasons.length > 0 ? learningReasons : undefined,
        });
      }
    }
  }

    return NextResponse.json({
      success: true,
      version: "2.0", // Force cache invalidation
      totalPending: raws.length,
      rules: rules.map((r) => r.pattern),
      matchedCount,
      learningMatchedCount,
      matches,
    });
  } catch (error: any) {
    console.error("Spam preview error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to preview spam",
        details: error?.stack,
      },
      { status: 500 }
    );
  }
}