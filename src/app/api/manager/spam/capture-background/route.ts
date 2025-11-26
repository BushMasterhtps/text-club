import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RawStatus } from "@prisma/client";
import { validateStatusTransition } from "@/lib/self-healing/status-validator";
import { analyzeSpamPatterns, getBatchImprovedSpamScores } from "@/lib/spam-detection";
import { withSelfHealing } from "@/lib/self-healing/wrapper";

/**
 * Background processing endpoint for pattern + learning spam detection
 * This runs after fast capture (phrase rules) to catch pattern/learning matches
 * Processes in optimized batches to avoid timeouts
 */
export async function POST(req: Request) {
  return await withSelfHealing(async () => {
    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 20000; // 20 seconds (leave 6 seconds buffer for Netlify's 26s timeout)
    const BATCH_SIZE = 200; // Process 200 messages at a time
    
    try {
      const body = await req.json().catch(() => ({}));
      const skip = body.skip || 0;
      const take = body.take || BATCH_SIZE;
      
      // Fetch messages that are still READY (not caught by phrase rules)
      const messages = await prisma.rawMessage.findMany({
        where: { 
          status: RawStatus.READY
        },
        select: { id: true, brand: true, text: true, status: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      });

      if (messages.length === 0) {
        return NextResponse.json({ 
          success: true, 
          updatedCount: 0,
          processed: 0,
          remaining: 0,
          complete: true
        });
      }

      console.log(`[SPAM CAPTURE BACKGROUND] Processing ${messages.length} messages (skip: ${skip}, take: ${take})`);

      const updates: Array<{ id: string; hits: string[] }> = [];
      let patternMatchedCount = 0;
      let learningMatchedCount = 0;
      let validationBlockedCount = 0;

      // OPTIMIZATION: Parallel pattern analysis (CPU-bound, can run in parallel)
      const patternResults = await Promise.all(
        messages.map(async (rm) => {
          if (!rm.text) return { id: rm.id, score: 0, reasons: [] };
          
          try {
            const result = analyzeSpamPatterns(rm.text);
            return { id: rm.id, score: result.score, reasons: result.reasons };
          } catch (error) {
            console.error(`[SPAM CAPTURE BACKGROUND] Error analyzing patterns for ${rm.id}:`, error);
            return { id: rm.id, score: 0, reasons: [] };
          }
        })
      );

      // OPTIMIZATION: Batch learning system check (one query instead of N queries)
      const itemsForLearning = messages
        .map((rm, idx) => ({ 
          text: rm.text || '', 
          brand: rm.brand || undefined,
          index: idx,
          id: rm.id
        }))
        .filter(item => item.text.length > 0);

      let learningResults = new Map<string, { score: number; historicalConfidence: number }>();
      if (itemsForLearning.length > 0) {
        try {
          learningResults = await getBatchImprovedSpamScores(
            itemsForLearning.map(item => ({ text: item.text, brand: item.brand }))
          );
        } catch (error) {
          console.error('[SPAM CAPTURE BACKGROUND] Error in batch learning check:', error);
        }
      }

      // Process results and identify matches
      for (let i = 0; i < messages.length; i++) {
        const rm = messages[i];
        const hits: string[] = [];
        
        // Check pattern detection (already computed in parallel)
        const patternResult = patternResults[i];
        if (patternResult.score >= 50) {
          const patternReasons = patternResult.reasons.slice(0, 2).join(', ');
          hits.push(`Pattern: ${Math.round(patternResult.score)}% (${patternReasons})`);
          patternMatchedCount++;
        }
        
        // Check learning system (already computed in batch)
        if (rm.text && hits.length === 0) {
          const itemKey = `${rm.text.substring(0, 50)}|${rm.brand || ''}`;
          const learningResult = learningResults.get(itemKey);
          
          if (learningResult && learningResult.score >= 60) {
            hits.push(`Learning: ${Math.round(learningResult.score)}%`);
            learningMatchedCount++;
          }
        }
        
        // If we have matches, validate and add to updates
        if (hits.length > 0) {
          const validation = validateStatusTransition(
            rm.status,
            RawStatus.SPAM_REVIEW,
            'spam capture background'
          );
          
          if (validation.valid) {
            updates.push({ id: rm.id, hits });
          } else {
            console.warn(`[SELF-HEAL] Skipping message ${rm.id}: ${validation.error}`);
            validationBlockedCount++;
          }
        }
      }

      console.log(`[SPAM CAPTURE BACKGROUND] Found ${updates.length} matches (${patternMatchedCount} pattern, ${learningMatchedCount} learning), ${validationBlockedCount} blocked`);

      // Batch update database
      let actuallyUpdatedCount = 0;
      if (updates.length > 0) {
        const updateIds = updates.map(u => u.id);
        const updateMap = new Map(updates.map(u => [u.id, u.hits]));
        
        // Update status
        const result = await prisma.rawMessage.updateMany({
          where: { 
            id: { in: updateIds },
            status: RawStatus.READY
          },
          data: { status: RawStatus.SPAM_REVIEW },
        });
        
        actuallyUpdatedCount = result.count;
        // Use the number we FOUND as the primary count (matches what we detected)
        // This ensures UI shows what we found, even if some updates fail due to race conditions
        const updatedCount = updates.length;
        
        if (actuallyUpdatedCount < updates.length) {
          console.warn(`[SPAM CAPTURE BACKGROUND] Race condition: ${updates.length - actuallyUpdatedCount} messages were already updated by another process`);
        }
        
        // Update previewMatches (only for messages that were actually updated)
        if (actuallyUpdatedCount > 0) {
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
      // Calculate remaining based on what we found, not what we updated
      const remaining = Math.max(0, messages.length - updates.length);
      const complete = messages.length < take; // If we got fewer than requested, we're done
      // Return number FOUND (matches detection), not number actually updated
      const updatedCount = updates.length;

      return NextResponse.json({
        success: true,
        updatedCount, // Return number FOUND (matches detection)
        actuallyUpdatedCount, // Also return actual update count for debugging
        processed: messages.length,
        remaining,
        complete,
        patternMatchedCount,
        learningMatchedCount,
        elapsed: elapsed,
        nextSkip: skip + messages.length
      });
    } catch (error: any) {
      console.error('[SPAM CAPTURE BACKGROUND] Error:', error);
      return NextResponse.json({
        success: false,
        error: error?.message || 'Background processing failed'
      }, { status: 500 });
    }
  }, { service: 'spam-capture-background' });
}

