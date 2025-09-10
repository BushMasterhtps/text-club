// src/app/api/manager/spam/apply/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

// NOTE: Work around stale Prisma type hints in some editors by casting to `any`.
// Runtime is fine because Prisma generated client DOES have `spamArchive`.
// When your editor picks up the new types, you can remove the `as any` casts.
const db = prisma as any;

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
 * POST body:
 * {
 *   ids?: string[];        // archive only these ids
 *   archiveAll?: boolean;  // archive all SPAM_REVIEW rows (ignores ids)
 *   q?: string;            // optional filter (brand/text contains, case-insensitive)
 * }
 *
 * Returns: { success: true, archivedCount, affectedIds: string[] }
 */
export async function POST(req: Request) {
  // CACHE BUST: Force new deployment to clear Netlify cache
  const startTime = Date.now();
  
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : undefined;
    const archiveAll = !!body?.archiveAll;
    const q = (body?.q || "").trim();

    // Build WHERE (use string literals to avoid enum typing issue in stale editors)
    const where: any = { status: "SPAM_REVIEW" };

    if (!archiveAll) {
      if (ids?.length) {
        where.id = { in: ids };
      } else {
        return NextResponse.json(
          { success: false, error: "Provide ids[] or set archiveAll: true" },
          { status: 400 }
        );
      }
    }

    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ];
    }

    // Pull candidates
    const rows = await prisma.rawMessage.findMany({
      where,
      select: { id: true, brand: true, text: true },
      orderBy: { createdAt: "desc" },
    });

    if (rows.length === 0) {
      return NextResponse.json({ success: true, archivedCount: 0, affectedIds: [] });
    }

    // Upserts into SpamArchive (dedupe on textHash)
    const upserts = rows.map((r) => {
      const textHash = makeTextHash(r.text, r.brand);
      // `db.spamArchive` is valid at runtime; cast avoids editor false negative.
      return db.spamArchive.upsert({
        where: { textHash },
        update: {},
        create: {
          textHash,
          text: r.text ?? null,
          brand: r.brand ?? null,
        },
      });
    });

    // Process in very small batches to prevent timeouts
    const BATCH_SIZE = 10; // Much smaller batches for serverless functions
    const totalBatches = Math.ceil(upserts.length / BATCH_SIZE);
    
    console.log(`Processing ${rows.length} spam items in ${totalBatches} batches of ${BATCH_SIZE}`);
    
    // Process upserts in small batches
    for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
      const batch = upserts.slice(i, i + BATCH_SIZE);
      try {
        await prisma.$transaction(batch);
        console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches}`);
      } catch (error) {
        console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
        // Continue with next batch instead of failing completely
      }
    }

    // Update statuses in small batches as well
    const statusUpdateBatches = chunk(rows.map((r) => r.id), BATCH_SIZE);
    for (const idBatch of statusUpdateBatches) {
      try {
        await prisma.rawMessage.updateMany({
          where: { id: { in: idBatch } },
          data: { status: "SPAM_ARCHIVED" as any },
        });
      } catch (error) {
        console.error(`Error updating status for batch:`, error);
        // Continue with next batch
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`Spam apply completed in ${processingTime}ms for ${rows.length} items`);
    
    return NextResponse.json({
      success: true,
      version: "2.1", // Force cache invalidation
      archivedCount: rows.length,
      affectedIds: rows.map((r) => r.id),
      processingTimeMs: processingTime,
    });
  } catch (err) {
    console.error("apply reviewer decisions error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to apply reviewer decisions" },
      { status: 500 }
    );
  }
}