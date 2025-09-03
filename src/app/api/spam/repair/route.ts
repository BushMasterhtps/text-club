// src/app/api/spam/repair/route.ts
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
    const rules = await prisma.spamRule.findMany({
      select: { id: true, pattern: true, patternNorm: true, enabled: true },
      orderBy: { createdAt: "asc" },
    });

    let updated = 0;

    for (const r of rules) {
      // If pattern looks like "phrase,Mode,Brand,Enabled" take only the first cell.
      const firstCell = r.pattern.split(",")[0]?.trim() ?? "";
      const cleaned = firstCell.replace(/^"+|"+$/g, ""); // strip surrounding quotes
      const norm = normText(cleaned);

      // Skip if nothing to change
      if (cleaned === r.pattern && norm === (r.patternNorm ?? "")) continue;

      await prisma.spamRule.update({
        where: { id: r.id },
        data: { pattern: cleaned, patternNorm: norm },
      });
      updated++;
    }

    return NextResponse.json({ success: true, scanned: rules.length, updated });
  } catch (err) {
    console.error("repair error:", err);
    return NextResponse.json({ success: false, error: "repair failed" }, { status: 500 });
  }
}