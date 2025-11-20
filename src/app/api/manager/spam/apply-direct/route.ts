// src/app/api/manager/spam/apply-direct/route.ts
// Direct database update endpoint for spam review queue
// This bypasses API timeouts by using efficient bulk database operations

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Work around stale Prisma type hints
const db = prisma as any;

// Stable hash (brand + normalized text) for archive dedupe
function makeTextHash(text?: string | null, brand?: string | null) {
  const norm = (text ?? "").trim().toLowerCase();
  const brandNorm = (brand ?? "").trim().toLowerCase();
  return crypto.createHash("sha256").update(`${brandNorm}::${norm}`).digest("hex");
}

/**
 * POST body:
 * {
 *   q?: string;  // optional filter (brand/text contains, case-insensitive)
 * }
 *
 * Returns: { success: true, archivedCount, processingTimeMs }
 * 
 * This endpoint directly updates the database using efficient bulk operations
 * to avoid Netlify timeout issues.
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const body = await req.json().catch(() => ({}));
    const q = (body?.q || "").trim();

    // Build WHERE clause
    const where: any = { status: "SPAM_REVIEW" };

    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ];
    }

    // Step 1: Get all SPAM_REVIEW items (we only need id, brand, text for archiving)
    const spamReviewItems = await prisma.rawMessage.findMany({
      where,
      select: { id: true, brand: true, text: true },
    });

    if (spamReviewItems.length === 0) {
      return NextResponse.json({ 
        success: true, 
        archivedCount: 0, 
        processingTimeMs: Date.now() - startTime 
      });
    }

    console.log(`Processing ${spamReviewItems.length} spam items via direct database update...`);

    // Step 2: Prepare SpamArchive entries
    const archiveEntries = spamReviewItems.map((item) => ({
      textHash: makeTextHash(item.text, item.brand),
      text: item.text ?? null,
      brand: item.brand ?? null,
    }));

    // Step 3: Upsert into SpamArchive
    // Use createMany with skipDuplicates for new entries, then update existing ones
    try {
      // Create new entries (duplicates will be skipped)
      await db.spamArchive.createMany({
        data: archiveEntries,
        skipDuplicates: true,
      });
    } catch (error) {
      console.error("Error creating spam archive entries:", error);
      // Continue anyway - some entries may already exist
    }

    // Step 4: Update existing archive entries' lastSeen and hitCount
    // Use a single efficient raw SQL query to update all matching entries at once
    const textHashes = archiveEntries.map(e => e.textHash);
    if (textHashes.length > 0) {
      try {
        // Update all matching entries in one query using IN clause
        await prisma.$executeRaw`
          UPDATE "SpamArchive"
          SET "lastSeen" = CURRENT_TIMESTAMP,
              "hitCount" = "hitCount" + 1
          WHERE "textHash" = ANY(${textHashes}::text[])
        `;
      } catch (error) {
        console.error("Error updating spam archive entries:", error);
        // Continue - this is not critical
      }
    }

    // Step 5: Update all SPAM_REVIEW items to SPAM_ARCHIVED in one efficient query
    // This is the key optimization - updateMany is very efficient
    const updateResult = await prisma.rawMessage.updateMany({
      where,
      data: { status: "SPAM_ARCHIVED" as any },
    });

    const processingTime = Date.now() - startTime;
    console.log(`Direct spam archive completed in ${processingTime}ms for ${updateResult.count} items`);
    
    return NextResponse.json({
      success: true,
      archivedCount: updateResult.count,
      processingTimeMs: processingTime,
      message: `Successfully archived ${updateResult.count} spam items`,
    });
  } catch (err) {
    console.error("Direct spam apply error:", err);
    return NextResponse.json(
      { 
        success: false, 
        error: err instanceof Error ? err.message : "Failed to apply reviewer decisions",
        details: err instanceof Error ? err.stack : undefined
      },
      { status: 500 }
    );
  }
}

