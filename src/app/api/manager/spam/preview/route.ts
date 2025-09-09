import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";
import { getImprovedSpamScore } from "@/lib/spam-detection";

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

  if (r.mode === SpamMode.CONTAINS) return t.includes(p);
  if (r.mode === SpamMode.LONE) return t === p; // exactly the lone token/phrase
  return false;
}

export async function GET() {
  // CACHE BUST: Force new deployment to clear Netlify cache
  // 1) load enabled rules
  const rules = await prisma.spamRule.findMany({
    where: { enabled: true },
    select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
    orderBy: { updatedAt: "desc" },
  });

  // 2) pull "pending" raws (READY or PROMOTED) - limit for performance
  const raws = await prisma.rawMessage.findMany({
    where: { status: { in: [RawStatus.READY, RawStatus.PROMOTED] } },
    select: { id: true, brand: true, text: true },
    orderBy: { createdAt: "desc" },
    take: 500, // Further reduced to prevent timeouts
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

  for (const rm of raws) {
    const hits: string[] = [];
    let learningScore = 0;
    let learningReasons: string[] = [];
    
    // Check simple phrase rules
    for (const r of rules) {
      if (ruleMatchesText(r, rm.brand, rm.text)) {
        hits.push(r.pattern);
      }
    }
    
    // Check learning system (only if no simple rule matches for efficiency)
    if (hits.length === 0 && rm.text) {
      try {
        const learningResult = await getImprovedSpamScore(rm.text, rm.brand || undefined);
        learningScore = learningResult.score;
        learningReasons = learningResult.reasons;
        
        // If learning system says it's spam (score >= 70), count it
        if (learningScore >= 70) {
          learningMatchedCount++;
        }
      } catch (error) {
        console.error('Error getting learning score:', error);
      }
    }
    
    // Count as matched if either simple rules OR learning system catches it
    if (hits.length > 0 || learningScore >= 70) {
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

  return NextResponse.json({
    success: true,
    version: "2.0", // Force cache invalidation
    totalPending: raws.length,
    rules: rules.map((r) => r.pattern),
    matchedCount,
    learningMatchedCount,
    matches,
  });
}