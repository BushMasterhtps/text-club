import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// NOTE: keep your existing normalizer consistent with import/preview
function norm(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const { ids, whitelist = [], disablePhrases = false } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "ids[] required" }, { status: 400 });
    }

    // 1) Restore tasks/messages out of SPAM_REVIEW (your current logic)
    //    If your code already moved RawMessage.status -> READY (or similar),
    //    keep that block. Here’s a generic example:
    await prisma.rawMessage.updateMany({
      where: { id: { in: ids }, status: "SPAM_REVIEW" as any },
      data: { status: "READY" as any },
    });

    // 2) Whitelist (existing behavior): create SpamArchive/label/etc. if you already do this
    //    If your current endpoint previously handled `whitelist`, leave your logic.
    //    (no-op here for brevity)

    // 3) NEW: optionally disable phrases that caused the match
    if (disablePhrases) {
      // We need the brand + previewMatches for the selected rows to target rules precisely.
      const rows = await prisma.rawMessage.findMany({
        where: { id: { in: ids } },
        select: { id: true, brand: true, previewMatches: true },
      });

      // Gather normalized phrases across all selected rows
      const normPhrases = new Set<string>();
      const brandBuckets = new Map<string | null, Set<string>>();

      for (const r of rows) {
        // previewMatches can be string | string[] | null
        const raw = r.previewMatches;
        const phrases: string[] = Array.isArray(raw)
          ? raw as string[]
          : typeof raw === "string" && raw.trim()
          ? [raw.trim()]
          : [];

        if (phrases.length === 0) continue;

        const set = brandBuckets.get(r.brand ?? null) ?? new Set<string>();
        for (const p of phrases) {
          const n = norm(p);
          normPhrases.add(n);
          set.add(n);
        }
        brandBuckets.set(r.brand ?? null, set);
      }

      // Disable rules that match patternNorm IN collected phrases,
      // for BOTH the specific brand and global (brand=null) to be safe.
      if (normPhrases.size > 0) {
        const list = Array.from(normPhrases);

        // Disable global rules
        await prisma.spamRule.updateMany({
          where: {
            enabled: true,
            brand: null,
            patternNorm: { in: list },
          },
          data: { enabled: false },
        });

        // Disable brand-scoped rules per brand we saw in rows
        for (const [brand, set] of brandBuckets.entries()) {
          if (brand == null || set.size === 0) continue;
          await prisma.spamRule.updateMany({
            where: {
              enabled: true,
              brand,
              patternNorm: { in: Array.from(set) },
            },
            data: { enabled: false },
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("restore error", err);
    return NextResponse.json({ success: false, error: err?.message || "Restore failed" }, { status: 500 });
  }
}