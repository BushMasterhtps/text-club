// src/app/api/spam/reset/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// same normalization we use everywhere
function normText(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * POST /api/spam/reset
 * Backfills SpamRule.patternNorm = normalized(SpamRule.pattern)
 */
export async function POST() {
  try {
    const rules = await prisma.spamRule.findMany({
      select: { id: true, pattern: true, patternNorm: true, enabled: true },
      orderBy: { createdAt: "asc" },
    });

    let updated = 0;
    let skipped = 0;
    const conflicts: Array<{ id: string; pattern: string; norm: string }> = [];

    for (const r of rules) {
      const norm = normText(r.pattern);
      if (r.patternNorm === norm) {
        skipped++;
        continue;
      }

      try {
        await prisma.spamRule.update({
          where: { id: r.id },
          data: { patternNorm: norm },
        });
        updated++;
      } catch {
        // uniqueness conflict (two different patterns normalize to same norm)
        conflicts.push({ id: r.id, pattern: r.pattern, norm });
      }
    }

    return NextResponse.json({
      success: true,
      total: rules.length,
      updated,
      skipped,
      conflicts,
    });
  } catch (err) {
    console.error("spam reset backfill error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to backfill patternNorm" },
      { status: 500 }
    );
  }
}

/** GET /api/spam/reset — quick read to see current rules */
export async function GET() {
  const rules = await prisma.spamRule.findMany({
    select: { id: true, pattern: true, patternNorm: true, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, count: rules.length, rules });
}