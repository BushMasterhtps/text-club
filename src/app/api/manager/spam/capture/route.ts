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

  if (r.mode === SpamMode.CONTAINS) return t.includes(p);
  if (r.mode === SpamMode.LONE) return t === p;
  return false;
}

export async function POST() {
  // 1) load rules once
  const rules = await prisma.spamRule.findMany({
    where: { enabled: true },
    select: { id: true, pattern: true, patternNorm: true, mode: true, brand: true },
  });

  // 2) stream through pending raws in chunks
  const CHUNK = 250;
  let offset = 0;
  let updatedCount = 0;

  while (true) {
    const batch = await prisma.rawMessage.findMany({
      where: { status: { in: [RawStatus.READY, RawStatus.PROMOTED] } },
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