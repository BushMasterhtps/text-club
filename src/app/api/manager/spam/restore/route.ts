import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// tiny helper to normalize/compare phrases
function norm(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  try {
    const { ids, addToWhitelist, addMatched } = (await req.json()) as {
      ids: string[];
      addToWhitelist?: boolean;
      addMatched?: boolean; // from the checkbox; true = add phrases to “whitelist”
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
    }

    // 1) fetch the rows we’re restoring (so we can see previewMatches)
    const msgs = await prisma.rawMessage.findMany({
      where: { id: { in: ids } },
      select: { id: true, previewMatches: true },
    });

    // 2) optionally create disabled rules from previewMatches (our “whitelist”)
    if (addToWhitelist && addMatched) {
      // collect distinct normalized phrases from previewMatches arrays
      const phrases = new Set<string>();
      for (const m of msgs) {
        const arr = (m.previewMatches ?? []) as unknown[];
        if (Array.isArray(arr)) {
          for (const p of arr) {
            const n = norm(p);
            if (n) phrases.add(n);
          }
        }
      }

      // If your model has a unique on `patternNorm`, use upsert on that.
      // If not, do a findFirst + create (shown below) to avoid the “id is required” TS error.
      for (const p of phrases) {
        const existing = await prisma.spamRule.findFirst({
          where: { patternNorm: p },
          select: { id: true },
        });
        if (!existing) {
          await prisma.spamRule.create({
            data: { pattern: p, patternNorm: p, enabled: false }, // disabled == whitelist
          });
        } else {
          // make sure it’s disabled
          await prisma.spamRule.update({
            where: { id: existing.id },
            data: { enabled: false },
          });
        }
      }
    }

    // 3) restore the rows: set status back to READY and clear previewMatches
    await prisma.rawMessage.updateMany({
      where: { id: { in: ids } },
      data: { status: "READY", previewMatches: [] },
    });

    return NextResponse.json({ success: true, restored: ids.length });
  } catch (err) {
    console.error("restore error:", err);
    return NextResponse.json({ success: false, error: "Restore failed" }, { status: 500 });
  }
}