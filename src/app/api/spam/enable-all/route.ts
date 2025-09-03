// src/app/api/spam/enable-all/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normText(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST() {
  try {
    const all = await prisma.spamRule.findMany({
      select: { id: true, pattern: true, patternNorm: true, enabled: true },
    });

    let enabledCount = 0;
    let normFixed = 0;

    for (const r of all) {
      const shouldNorm = !r.patternNorm || r.patternNorm.trim() === "";
      const data: { enabled?: boolean; patternNorm?: string } = {};

      // force-enable everything
      if (!r.enabled) {
        data.enabled = true;
        enabledCount++;
      }
      // backfill/repair normalization
      if (shouldNorm) {
        data.patternNorm = normText(r.pattern);
        normFixed++;
      }

      if (Object.keys(data).length) {
        await prisma.spamRule.update({ where: { id: r.id }, data });
      }
    }

    const enabledNow = await prisma.spamRule.count({ where: { enabled: true } });

    return NextResponse.json({
      success: true,
      scanned: all.length,
      enabledNow,
      enabledChanged: enabledCount,
      normalizedFixed: normFixed,
    });
  } catch (err) {
    console.error("enable-all error:", err);
    return NextResponse.json({ success: false, error: "enable-all failed" }, { status: 500 });
  }
}