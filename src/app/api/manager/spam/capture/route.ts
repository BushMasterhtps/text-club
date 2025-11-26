import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";
import { validateStatusTransition } from "@/lib/self-healing/status-validator";
import { getImprovedSpamScore } from "@/lib/spam-detection";
import { fuzzyContains } from "@/lib/fuzzy-matching";

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
      // Exact match first
      if (words.some(word => word === p)) return true;
      
      // Then try fuzzy matching for variations (e.g., "unlock", "UnLOck", "nlock")
      // Only use fuzzy for common spam keywords that have variations
      const fuzzyKeywords = ['unlock', 'claim', 'win', 'free', 'urgent'];
      if (fuzzyKeywords.some(keyword => similarity(p, keyword) > 0.5)) {
        return fuzzyContains(t, p, 0.7); // 70% similarity threshold
      }
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

export async function POST() {
  try {
    // 1) load rules once
    const rules = await prisma.spamRule.findMany({
      where: { enabled: true },
      select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
    });

    // 2) Get total count of READY messages (only scan READY, not PROMOTED)
    // PROMOTED messages are already converted to tasks and should not be re-scanned
    const totalReady = await prisma.rawMessage.count({
      where: { status: RawStatus.READY }
    });

    // 3) Process only 100 items at a time to prevent timeouts and connection issues
    const BATCH_SIZE = 100;
    const batch = await prisma.rawMessage.findMany({
      where: { 
        status: RawStatus.READY  // FIX: Only scan READY messages, not PROMOTED
      },
      select: { id: true, brand: true, text: true, status: true }, // FIX: Include status for validation
      orderBy: { createdAt: "desc" },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) {
      return NextResponse.json({ 
        success: true, 
        updatedCount: 0,
        totalInQueue: totalReady,
        remainingInQueue: totalReady
      });
    }

    // 4) Process batch and mark as spam if matched
    let updatedCount = 0;
    const updates: Array<{ id: string; hits: string[] }> = [];
    let learningMatchedCount = 0;

    for (const rm of batch) {
      const hits: string[] = [];
      let learningScore = 0;
      
      // Check phrase rules first
      for (const r of rules) {
        if (ruleMatchesText(r, rm.brand, rm.text)) hits.push(r.pattern);
      }
      
      // Check learning system if no phrase rules matched (for efficiency)
      if (hits.length === 0 && rm.text) {
        try {
          const learningResult = await getImprovedSpamScore(rm.text, rm.brand || undefined);
          learningScore = learningResult.score;
          
          // If learning system says it's spam (score >= 70), add to hits
          if (learningScore >= 70) {
            hits.push(`Learning: ${Math.round(learningScore)}%`);
            learningMatchedCount++;
          }
        } catch (error) {
          console.error(`Error getting learning score for message ${rm.id}:`, error);
        }
      }
      
      // If we have matches (from rules or learning), validate and add to updates
      if (hits.length > 0) {
        // Validate status transition before adding to updates
        const validation = validateStatusTransition(
          rm.status,
          RawStatus.SPAM_REVIEW,
          'spam capture'
        );
        
        if (validation.valid) {
          updates.push({ id: rm.id, hits });
        } else {
          // Log blocked transition but continue processing
          console.warn(`[SELF-HEAL] Skipping message ${rm.id}: ${validation.error}`);
        }
      }
    }

    // 5) Batch update to reduce database connections
    // FIX: Add validation - only update messages that are still READY (prevent race conditions)
    if (updates.length > 0) {
      // Use Promise.all for parallel updates but limit concurrency to prevent connection exhaustion
      const CONCURRENT_UPDATES = 10;
      for (let i = 0; i < updates.length; i += CONCURRENT_UPDATES) {
        const chunk = updates.slice(i, i + CONCURRENT_UPDATES);
        const chunkResults = await Promise.all(
          chunk.map(async ({ id, hits }) => {
            try {
              // FIX: Only update if still READY (prevent invalid status transitions)
              // This ensures we don't accidentally update PROMOTED messages
              const result = await prisma.rawMessage.updateMany({
                where: { 
                  id,
                  status: RawStatus.READY  // Only update if still READY
                },
                data: {
                  status: RawStatus.SPAM_REVIEW,
                  previewMatches: hits,
                },
              });
              return result.count; // Return count of updated rows (0 or 1)
            } catch (error) {
              console.error(`Error updating raw message ${id}:`, error);
              return 0; // Return 0 if update failed
            }
          })
        );
        // Sum up successful updates from this chunk
        updatedCount += chunkResults.reduce((sum, count) => sum + count, 0);
      }
    }

    // 6) Calculate remaining items in queue
    const remainingInQueue = Math.max(0, totalReady - updatedCount);

    return NextResponse.json({ 
      success: true, 
      updatedCount,
      totalInQueue: totalReady,
      remainingInQueue,
      processed: batch.length,
      learningMatchedCount // Include learning system count
    });
  } catch (error: any) {
    console.error("Spam capture error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error?.message || "Failed to capture spam",
        details: error?.stack 
      },
      { status: 500 }
    );
  }
}