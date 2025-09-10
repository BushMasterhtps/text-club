// src/app/api/manager/spam/apply-background/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

// Stable hash (brand + normalized text) for archive dedupe
function makeTextHash(text?: string | null, brand?: string | null) {
  const norm = (text ?? "").trim().toLowerCase();
  const brandNorm = (brand ?? "").trim().toLowerCase();
  return crypto.createHash("sha256").update(`${brandNorm}::${norm}`).digest("hex");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Background processing for spam archiving
 * Processes items in very small batches to avoid timeouts
 * 
 * POST body:
 * {
 *   batchSize?: number;     // items per batch (default: 5)
 *   maxBatches?: number;    // max batches to process (default: 10)
 *   q?: string;             // optional filter
 * }
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body?.batchSize || 5, 10); // Cap at 10 for safety
    const maxBatches = body?.maxBatches || 10;
    const q = (body?.q || "").trim();

    // Build WHERE clause
    const where: any = { status: "SPAM_REVIEW" };
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ];
    }

    // Get a limited number of items to process
    const rows = await prisma.rawMessage.findMany({
      where,
      select: { id: true, brand: true, text: true },
      orderBy: { createdAt: "desc" },
      take: batchSize * maxBatches, // Limit total items
    });

    if (rows.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No spam items to process",
        processedCount: 0,
        remainingCount: 0
      });
    }

    console.log(`Processing ${rows.length} spam items in batches of ${batchSize}`);

    let processedCount = 0;
    const batches = chunk(rows, batchSize);

    // Process each batch
    for (let i = 0; i < Math.min(batches.length, maxBatches); i++) {
      const batch = batches[i];
      
      try {
        // Create upserts for this batch
        const upserts = batch.map((r) => {
          const textHash = makeTextHash(r.text, r.brand);
          return prisma.spamArchive.upsert({
            where: { textHash },
            update: {},
            create: {
              textHash,
              text: r.text ?? null,
              brand: r.brand ?? null,
            },
          });
        });

        // Execute upserts
        await prisma.$transaction(upserts);

        // Update statuses
        await prisma.rawMessage.updateMany({
          where: { id: { in: batch.map((r) => r.id) } },
          data: { status: "SPAM_ARCHIVED" as any },
        });

        processedCount += batch.length;
        console.log(`Processed batch ${i + 1}/${Math.min(batches.length, maxBatches)}: ${batch.length} items`);

      } catch (error) {
        console.error(`Error processing batch ${i + 1}:`, error);
        // Continue with next batch
      }
    }

    // Check remaining count
    const remainingCount = await prisma.rawMessage.count({
      where: { status: "SPAM_REVIEW" }
    });

    const processingTime = Date.now() - startTime;
    console.log(`Background spam processing completed: ${processedCount} processed, ${remainingCount} remaining in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      processedCount,
      remainingCount,
      processingTimeMs: processingTime,
      hasMore: remainingCount > 0,
      message: remainingCount > 0 
        ? `Processed ${processedCount} items. ${remainingCount} remaining. Run again to continue.`
        : `Successfully processed all ${processedCount} spam items.`
    });

  } catch (err) {
    console.error("Background spam processing error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to process spam items" },
      { status: 500 }
    );
  }
}
