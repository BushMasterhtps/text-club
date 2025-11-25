import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";

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
    // Use word boundary matching instead of simple substring
    // This ensures "cod" matches "cod" but not "code" or "could"
    const words = t.split(/\s+/);
    const patternWords = p.split(/\s+/);
    
    // For single-word patterns, check if it exists as a complete word
    if (patternWords.length === 1) {
      return words.some(word => word === p);
    }
    
    // For multi-word patterns, check if the phrase exists with word boundaries
    const regex = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(t);
  }
  if (r.mode === SpamMode.LONE) return t === p;
  return false;
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
      select: { id: true, brand: true, text: true },
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

    for (const rm of batch) {
      const hits: string[] = [];
      for (const r of rules) {
        if (ruleMatchesText(r, rm.brand, rm.text)) hits.push(r.pattern);
      }
      if (hits.length) {
        updates.push({ id: rm.id, hits });
      }
    }

    // 5) Batch update to reduce database connections
    // FIX: Add validation - only update messages that are still READY (prevent race conditions)
    if (updates.length > 0) {
      // Use Promise.all for parallel updates but limit concurrency to prevent connection exhaustion
      const CONCURRENT_UPDATES = 10;
      for (let i = 0; i < updates.length; i += CONCURRENT_UPDATES) {
        const chunk = updates.slice(i, i + CONCURRENT_UPDATES);
        await Promise.all(
          chunk.map(async ({ id, hits }) => {
            try {
              // FIX: Only update if still READY (prevent invalid status transitions)
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
              return result.count > 0; // Return true if updated
            } catch (error) {
              console.error(`Error updating raw message ${id}:`, error);
              return false; // Return false if update failed
            }
          })
        );
        // Count only successful updates
        const successfulUpdates = await Promise.all(
          chunk.map(async ({ id }) => {
            const msg = await prisma.rawMessage.findUnique({
              where: { id },
              select: { status: true }
            });
            return msg?.status === RawStatus.SPAM_REVIEW;
          })
        );
        updatedCount += successfulUpdates.filter(Boolean).length;
      }
    }

    // 6) Calculate remaining items in queue
    const remainingInQueue = Math.max(0, totalReady - updatedCount);

    return NextResponse.json({ 
      success: true, 
      updatedCount,
      totalInQueue: totalReady,
      remainingInQueue,
      processed: batch.length
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