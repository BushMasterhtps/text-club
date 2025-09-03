import { NextResponse } from "next/server";
import { PrismaClient, RawStatus } from "@prisma/client";
import crypto from "crypto";

export const dynamic = "force-dynamic";
const prisma = new PrismaClient();

function makeTextHash(text?: string | null, brand?: string | null) {
  const norm = (text ?? "").trim().toLowerCase();
  const brandNorm = (brand ?? "").trim().toLowerCase();
  return crypto.createHash("sha256").update(`${brandNorm}::${norm}`).digest("hex");
}

export async function POST() {
  const BATCH = 500;
  let totalProcessed = 0;
  let inserted = 0;

  try {
    // Count candidates
    const total = await prisma.rawMessage.count({
      where: { status: RawStatus.SPAM_ARCHIVED },
    });

    for (let skip = 0; skip < total; skip += BATCH) {
      const rows = await prisma.rawMessage.findMany({
        where: { status: RawStatus.SPAM_ARCHIVED },
        select: { brand: true, text: true },
        orderBy: { createdAt: "asc" },
        take: BATCH,
        skip,
      });

      const ops = rows.map((r) => {
        const textHash = makeTextHash(r.text, r.brand);
        return prisma.spamArchive.upsert({
          where: { textHash },
          update: {},
          create: { textHash, text: r.text ?? null, brand: r.brand ?? null },
        });
      });

      const result = await prisma.$transaction(ops);
      totalProcessed += rows.length;
      inserted += result.length; // upserts count here; duplicates were “update:{}”
    }

    return NextResponse.json({
      success: true,
      totalCandidates: total,
      processed: totalProcessed,
      upsertsAttempted: inserted,
    });
  } catch (err: any) {
    console.error("Archive backfill failed:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "Archive backfill failed" },
      { status: 500 }
    );
  }
}