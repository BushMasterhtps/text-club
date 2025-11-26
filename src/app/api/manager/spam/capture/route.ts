import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";
import { validateStatusTransition } from "@/lib/self-healing/status-validator";
import { fuzzyContains } from "@/lib/fuzzy-matching";
import { withSelfHealing } from "@/lib/self-healing/wrapper";

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
    // This helps catch variations like "unlock now" vs "unlock now!"
    return fuzzyContains(t, p, 0.75); // 75% similarity for phrases
  }
  if (r.mode === SpamMode.LONE) return t === p;
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

/**
 * FAST CAPTURE: Phrase rules only (2-5 seconds)
 * This is the first step - catches most spam quickly
 * Background processing (pattern + learning) happens separately via /capture-background
 */
export async function POST() {
  return await withSelfHealing(async () => {
    const startTime = Date.now();
    
    try {
      // 1) Load rules once
      const rules = await prisma.spamRule.findMany({
        where: { enabled: true },
        select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
      });

      // 2) Get total count of READY messages
      const totalReady = await prisma.rawMessage.count({
        where: { status: RawStatus.READY }
      });

      // 3) Process same scope as preview (1000 messages)
      const PREVIEW_SCOPE = 1000;
      
      // Fetch all messages in preview scope
      const allMessages = await prisma.rawMessage.findMany({
        where: { 
          status: RawStatus.READY
        },
        select: { id: true, brand: true, text: true, status: true },
        orderBy: { createdAt: "desc" },
        take: PREVIEW_SCOPE,
      });

      if (allMessages.length === 0) {
        return NextResponse.json({ 
          success: true, 
          updatedCount: 0,
          totalInQueue: totalReady,
          remainingInQueue: totalReady,
          processed: 0,
          needsBackground: false
        });
      }
      
      console.log(`[SPAM CAPTURE FAST] Processing ${allMessages.length} messages (phrase rules only)`);

      // 4) FAST CAPTURE: Only check phrase rules (fast string matching)
      const updates: Array<{ id: string; hits: string[] }> = [];
      let phraseMatchedCount = 0;
      let validationBlockedCount = 0;

      for (const rm of allMessages) {
        const hits: string[] = [];
        
        // ONLY check phrase rules (fast - no pattern/learning analysis)
        for (const r of rules) {
          if (ruleMatchesText(r, rm.brand, rm.text)) {
            hits.push(r.pattern);
            phraseMatchedCount++;
          }
        }
        
        // If we have phrase rule matches, validate and add to updates
        if (hits.length > 0) {
          const validation = validateStatusTransition(
            rm.status,
            RawStatus.SPAM_REVIEW,
            'spam capture'
          );
          
          if (validation.valid) {
            updates.push({ id: rm.id, hits });
          } else {
            console.warn(`[SELF-HEAL] Skipping message ${rm.id}: ${validation.error}`);
            validationBlockedCount++;
          }
        }
      }
      
      console.log(`[SPAM CAPTURE FAST] Found ${updates.length} phrase rule matches out of ${allMessages.length} messages`);

      // 5) Batch update database (optimized)
      let updatedCount = 0;
      if (updates.length > 0) {
        const updateIds = updates.map(u => u.id);
        const updateMap = new Map(updates.map(u => [u.id, u.hits]));
        
        // Single batch update for status
        const result = await prisma.rawMessage.updateMany({
          where: { 
            id: { in: updateIds },
            status: RawStatus.READY
          },
          data: { status: RawStatus.SPAM_REVIEW },
        });
        
        updatedCount = result.count;
        console.log(`[SPAM CAPTURE FAST] Updated ${updatedCount} messages to SPAM_REVIEW status`);
        
        // Update previewMatches in batches
        if (updatedCount > 0) {
          const CONCURRENT_UPDATES = 10;
          for (let i = 0; i < updateIds.length; i += CONCURRENT_UPDATES) {
            const chunk = updateIds.slice(i, i + CONCURRENT_UPDATES);
            await Promise.all(
              chunk.map(async (id) => {
                const hits = updateMap.get(id);
                if (hits) {
                  await prisma.rawMessage.updateMany({
                    where: { id, status: RawStatus.SPAM_REVIEW },
                    data: { previewMatches: hits },
                  });
                }
              })
            );
          }
        }
      }

      const elapsed = Date.now() - startTime;
      const remainingInQueue = Math.max(0, totalReady - updatedCount);
      const needsBackground = allMessages.length > 0; // Background processing needed for pattern/learning

      console.log(`[SPAM CAPTURE FAST] Completed in ${elapsed}ms. ${updatedCount} captured. Background processing needed: ${needsBackground}`);

      return NextResponse.json({ 
        success: true, 
        updatedCount,
        totalInQueue: totalReady,
        remainingInQueue,
        processed: allMessages.length,
        phraseMatchedCount,
        needsBackground, // Frontend will call background endpoint if true
        elapsed
      });
    } catch (error: any) {
      console.error("[SPAM CAPTURE FAST] Error:", error);
      return NextResponse.json({
        success: false,
        error: error?.message || "Failed to capture spam",
        details: error?.stack
      }, { status: 500 });
    }
  }, { service: 'spam-capture' });
}
