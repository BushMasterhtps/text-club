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
  // 1) load rules once
  const rules = await prisma.spamRule.findMany({
    where: { enabled: true },
    select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
  });

  // 2) Only scan messages from the last 7 days to avoid re-processing old completed messages
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // 3) stream through pending raws in chunks
  const CHUNK = 250;
  let offset = 0;
  let updatedCount = 0;

  while (true) {
    const batch = await prisma.rawMessage.findMany({
      where: { 
        status: { in: [RawStatus.READY, RawStatus.PROMOTED] },
        createdAt: { gte: sevenDaysAgo } // Only recent messages
      },
      select: { id: true, brand: true, text: true },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: CHUNK,
    });
    if (batch.length === 0) break;

    for (const rm of batch) {
      const hits: string[] = [];
      for (const r of rules) {
        if (ruleMatchesText(r, rm.brand, rm.text)) hits.push(r.pattern);
      }
      if (hits.length) {
        await prisma.rawMessage.update({
          where: { id: rm.id },
          data: {
            status: RawStatus.SPAM_REVIEW,
            previewMatches: hits,
          },
        });
        updatedCount++;
      }
    }

    offset += batch.length;
    if (batch.length < CHUNK) break;
  }

  return NextResponse.json({ success: true, updatedCount });
}