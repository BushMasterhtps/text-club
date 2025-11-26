import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";
import { validateStatusTransition } from "@/lib/self-healing/status-validator";
import { getImprovedSpamScore, analyzeSpamPatterns } from "@/lib/spam-detection";
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

    // 3) Process same scope as preview (1000 messages) but in batches to prevent timeouts
    // Preview checks 1000 messages and finds 529 matches, so we should process the same 1000
    const PREVIEW_SCOPE = 1000; // Match preview's scope
    const PROCESSING_BATCH_SIZE = 100; // Process 100 at a time to avoid timeouts
    
    // Fetch all messages in preview scope (same as preview)
    const allMessages = await prisma.rawMessage.findMany({
      where: { 
        status: RawStatus.READY  // FIX: Only scan READY messages, not PROMOTED
      },
      select: { id: true, brand: true, text: true, status: true }, // FIX: Include status for validation
      orderBy: { createdAt: "desc" },
      take: PREVIEW_SCOPE, // Match preview's scope
    });

    if (allMessages.length === 0) {
      return NextResponse.json({ 
        success: true, 
        updatedCount: 0,
        totalInQueue: totalReady,
        remainingInQueue: totalReady,
        processed: 0
      });
    }
    
    console.log(`[SPAM CAPTURE] Processing ${allMessages.length} messages (matching preview scope of ${PREVIEW_SCOPE})`);

    // 4) Process all messages and mark as spam if matched
    let updatedCount = 0;
    const updates: Array<{ id: string; hits: string[] }> = [];
    let learningMatchedCount = 0;
    let patternMatchedCount = 0;
    let phraseMatchedCount = 0;
    let validationBlockedCount = 0;
    
    // Process messages in internal batches to avoid timeout during analysis
    const processingBatches = [];
    for (let i = 0; i < allMessages.length; i += PROCESSING_BATCH_SIZE) {
      processingBatches.push(allMessages.slice(i, i + PROCESSING_BATCH_SIZE));
    }
    
    console.log(`[SPAM CAPTURE] Processing ${allMessages.length} messages in ${processingBatches.length} internal batches of ${PROCESSING_BATCH_SIZE}`);

    // Process each internal batch
    for (let batchIndex = 0; batchIndex < processingBatches.length; batchIndex++) {
      const batch = processingBatches[batchIndex];
      console.log(`[SPAM CAPTURE] Processing internal batch ${batchIndex + 1}/${processingBatches.length} (${batch.length} messages)`);
      
      for (const rm of batch) {
      const hits: string[] = [];
      let patternScore = 0;
      let learningScore = 0;
      
      // Check phrase rules first
      for (const r of rules) {
        if (ruleMatchesText(r, rm.brand, rm.text)) {
          hits.push(r.pattern);
          phraseMatchedCount++;
        }
      }
      
      // Check pattern detection for obvious spam (gibberish, random numbers, etc.)
      // This catches obvious spam that phrase rules might miss
      if (rm.text) {
        try {
          const patternResult = analyzeSpamPatterns(rm.text);
          patternScore = patternResult.score;
          
          // DEBUG: Log pattern scores for first few messages
          if (updates.length < 5) {
            console.log(`[SPAM CAPTURE DEBUG] Message ${rm.id.substring(0, 8)}... text="${rm.text?.substring(0, 50)}..." patternScore=${patternScore}`);
          }
          
          // Lower threshold for obvious spam patterns (50% instead of 60%)
          // This catches more spam including single words, short messages, etc.
          // Obvious spam like random numbers should score 100%
          if (patternScore >= 50) {
            // Add pattern reasons to hits for tracking
            const patternReasons = patternResult.reasons.slice(0, 2).join(', ');
            hits.push(`Pattern: ${Math.round(patternScore)}% (${patternReasons})`);
            patternMatchedCount++;
          }
        } catch (error) {
          console.error(`[SPAM CAPTURE] Error analyzing patterns for message ${rm.id}:`, error);
        }
      } else {
        // DEBUG: Log messages without text
        if (updates.length < 5) {
          console.log(`[SPAM CAPTURE DEBUG] Message ${rm.id.substring(0, 8)}... has no text`);
        }
      }
      
      // Check learning system if no phrase rules or patterns matched (for efficiency)
      if (hits.length === 0 && rm.text) {
        try {
          const learningResult = await getImprovedSpamScore(rm.text, rm.brand || undefined);
          learningScore = learningResult.score;
          
          // Lower threshold to 60% for learning system too (was 70%)
          // This catches more spam while still maintaining accuracy
          if (learningScore >= 60) {
            hits.push(`Learning: ${Math.round(learningScore)}%`);
            learningMatchedCount++;
          }
        } catch (error) {
          console.error(`Error getting learning score for message ${rm.id}:`, error);
        }
      }
      
      // If we have matches (from rules, patterns, or learning), validate and add to updates
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
          validationBlockedCount++;
        }
      }
    }
    
    }
    
    console.log(`[SPAM CAPTURE] Complete analysis: ${allMessages.length} messages, ${updates.length} matches found (${phraseMatchedCount} phrase, ${patternMatchedCount} pattern, ${learningMatchedCount} learning), ${validationBlockedCount} blocked by validation`);
    console.log(`[SPAM CAPTURE] Rules loaded: ${rules.length}, Messages with text: ${allMessages.filter(r => r.text).length}/${allMessages.length}`);
    
    // DEBUG: Show sample of first few messages
    if (allMessages.length > 0) {
      const sample = allMessages.slice(0, 3);
      console.log(`[SPAM CAPTURE DEBUG] Sample messages:`, sample.map(r => ({
        id: r.id.substring(0, 8),
        hasText: !!r.text,
        textPreview: r.text?.substring(0, 30),
        brand: r.brand
      })));
    }

    // 5) Batch update to reduce database connections
    // FIX: Use transaction to prevent race conditions where messages change status between fetch and update
    if (updates.length > 0) {
      console.log(`[SPAM CAPTURE] Attempting to update ${updates.length} messages out of ${allMessages.length} processed...`);
      
      // Collect all IDs for batch update
      const updateIds = updates.map(u => u.id);
      const updateMap = new Map(updates.map(u => [u.id, u.hits]));
      
      // Use a single updateMany with IN clause for better performance and atomicity
      // This updates all matching messages in one query
      try {
        const result = await prisma.rawMessage.updateMany({
          where: { 
            id: { in: updateIds },
            status: RawStatus.READY  // Only update if still READY (prevents race conditions)
          },
          data: {
            status: RawStatus.SPAM_REVIEW,
            // Note: previewMatches will be set to the hits for each message
            // Since updateMany doesn't support per-row data, we'll do a second pass for previewMatches
          },
        });
        
        updatedCount = result.count;
        console.log(`[SPAM CAPTURE] Updated ${updatedCount} messages to SPAM_REVIEW status`);
        
        // Now update previewMatches for each successfully updated message
        // Do this in smaller batches to avoid connection issues
        if (updatedCount > 0) {
          const CONCURRENT_UPDATES = 10;
          for (let i = 0; i < updateIds.length; i += CONCURRENT_UPDATES) {
            const chunk = updateIds.slice(i, i + CONCURRENT_UPDATES);
            await Promise.all(
              chunk.map(async (id) => {
                try {
                  const hits = updateMap.get(id);
                  if (hits) {
                    await prisma.rawMessage.updateMany({
                      where: { 
                        id,
                        status: RawStatus.SPAM_REVIEW  // Only update if we successfully moved to SPAM_REVIEW
                      },
                      data: {
                        previewMatches: hits,
                      },
                    });
                  }
                } catch (error) {
                  console.error(`[SPAM CAPTURE] Error updating previewMatches for ${id}:`, error);
                }
              })
            );
          }
        }
        
        const statusChangedCount = updates.length - updatedCount;
        if (statusChangedCount > 0) {
          console.warn(`[SPAM CAPTURE] ${statusChangedCount} messages changed status (race condition) - they were likely promoted to tasks between fetch and update`);
        }
      } catch (error) {
        console.error(`[SPAM CAPTURE] Error in batch update:`, error);
        // Fallback to individual updates if batch update fails
        const CONCURRENT_UPDATES = 10;
        for (let i = 0; i < updates.length; i += CONCURRENT_UPDATES) {
          const chunk = updates.slice(i, i + CONCURRENT_UPDATES);
          const chunkResults = await Promise.all(
            chunk.map(async ({ id, hits }) => {
              try {
                const result = await prisma.rawMessage.updateMany({
                  where: { 
                    id,
                    status: RawStatus.READY
                  },
                  data: {
                    status: RawStatus.SPAM_REVIEW,
                    previewMatches: hits,
                  },
                });
                return result.count;
              } catch (error) {
                console.error(`[SPAM CAPTURE] Error updating raw message ${id}:`, error);
                return 0;
              }
            })
          );
          updatedCount += chunkResults.reduce((sum, count) => sum + count, 0);
        }
      }
    } else {
      console.log(`[SPAM CAPTURE] No matches found in batch of ${batch.length} messages`);
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