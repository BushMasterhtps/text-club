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

    // Execute upserts in smaller batches to prevent timeouts
    const BATCH = 50; // Reduced from 500 to prevent timeouts
    for (const group of chunk(upserts, BATCH)) {
      await prisma.$transaction(group);
    }

    // Flip statuses to SPAM_ARCHIVED in one go
    await prisma.rawMessage.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: "SPAM_ARCHIVED" as any }, // cast avoids enum typing issue
    });

    return NextResponse.json({
      success: true,
      archivedCount: rows.length,
      affectedIds: rows.map((r) => r.id),
    });
  } catch (err) {
    console.error("apply reviewer decisions error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to apply reviewer decisions" },
      { status: 500 }
    );
  }
}