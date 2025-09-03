import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SpamMode, RawStatus } from "@prisma/client";

/** simple normalize: lowercase, strip punctuation, collapse spaces */
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
  // brand-scoped rule? only apply when brand matches (case-insensitive)
  if (r.brand && norm(brand) !== norm(r.brand)) return false;

  const t = norm(text);
  const p = r.patternNorm ? norm(r.patternNorm) : norm(r.pattern);

  if (!p || !t) return false;

  if (r.mode === SpamMode.CONTAINS) return t.includes(p);
  if (r.mode === SpamMode.LONE) return t === p; // exactly the lone token/phrase
  return false;
}

export async function GET() {
  // 1) load enabled rules
  const rules = await prisma.spamRule.findMany({
    where: { enabled: true },
    select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
    orderBy: { updatedAt: "desc" },
  });

  // 2) pull "pending" raws (READY or PROMOTED)
  const raws = await prisma.rawMessage.findMany({
    where: { status: { in: [RawStatus.READY, RawStatus.PROMOTED] } },
    select: { id: true, brand: true, text: true },
    orderBy: { createdAt: "desc" },
    take: 5000, // preview cap; adjust as you like
  });

  let matchedCount = 0;
  const matches: Array<{
    taskId: string;
    brand: string | null;
    text: string | null;
    matchedPatterns: string[];
  }> = [];

  for (const rm of raws) {
    const hits: string[] = [];
    for (const r of rules) {
      if (ruleMatchesText(r, rm.brand, rm.text)) {
        hits.push(r.pattern);
      }
    }
    if (hits.length) {
      matchedCount++;
      matches.push({
        taskId: rm.id, // kept name "taskId" for your existing UI type
        brand: rm.brand,
        text: rm.text,
        matchedPatterns: hits,
      });
    }
  }

  return NextResponse.json({
    success: true,
    totalPending: raws.length,
    rules: rules.map((r) => r.pattern),
    matchedCount,
    matches,
  });
}