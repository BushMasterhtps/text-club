// src/app/api/manager/spam/review/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBatchImprovedSpamScores } from "@/lib/spam-detection";
import { withSelfHealing } from "@/lib/self-healing/wrapper";

export async function GET(req: Request) {
  return await withSelfHealing(async () => {
    try {
    const url = new URL(req.url);
    const takeParam = parseInt(url.searchParams.get("take") || "50", 10);
    const skipParam = parseInt(url.searchParams.get("skip") || "0", 10);
    const q = (url.searchParams.get("q") || "").trim();

    const take = Math.min(Math.max(isNaN(takeParam) ? 50 : takeParam, 1), 200);
    const skip = Math.max(isNaN(skipParam) ? 0 : skipParam, 0);
    
    // Sorting parameters
    const sortBy = url.searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") ?? "desc";

    const where: any = { status: "SPAM_REVIEW" };
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { text:  { contains: q, mode: "insensitive" } },
      ];
    }

    // Build orderBy
    const buildOrderBy = () => {
      const direction = sortOrder === "asc" ? "asc" : "desc";
      
      switch (sortBy) {
        case "brand":
          return { brand: direction };
        case "text":
          return { text: direction };
        case "matched":
          // Sort by previewMatches (spam phrases)
          return { previewMatches: direction };
        case "createdAt":
        default:
          return { createdAt: direction };
      }
    };

    const [total, rows] = await Promise.all([
      prisma.rawMessage.count({ where }),
      prisma.rawMessage.findMany({
        where,
        orderBy: buildOrderBy(),
        skip,
        take,
        select: {
          id: true,
          brand: true,
          text: true,
          createdAt: true,
          previewMatches: true,
        },
      }),
    ]);

    const normalizeMatches = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.filter(Boolean).map(String);
      if (typeof val === "string" && val.trim()) return [val.trim()];
      return [];
    };

    // FIXED: Batch fetch all learning scores in a single query instead of N queries
    // Prepare items for batch processing
    const itemsForBatch = rows.map(r => ({
      text: r.text || '',
      brand: r.brand || undefined
    }));
    
    // Get all learning scores in one batch query (reduces from N queries to 1 query)
    let learningScoresMap: Map<string, { score: number; reasons: string[]; historicalConfidence: number }>;
    try {
      learningScoresMap = await getBatchImprovedSpamScores(itemsForBatch);
    } catch (error) {
      console.error('Error getting batch learning scores for spam review:', error);
      // Fallback: create empty map if batch fails
      learningScoresMap = new Map();
    }
    
    // Process items with batched learning data
    const items = rows.map((r) => {
      // Generate the same key format used by getBatchImprovedSpamScores
      const itemKey = `${(r.text || '').substring(0, 50)}|${r.brand || ''}`;
      const learningResult = learningScoresMap.get(itemKey);
      
      const learningScore = learningResult?.score || 0;
      const learningReasons = learningResult?.reasons || [];

      // Determine spam source
      let spamSource: 'manual' | 'automatic' | 'learning' = 'automatic';
      if (learningScore >= 70) {
        spamSource = 'learning';
      } else if (r.previewMatches && (Array.isArray(r.previewMatches) ? r.previewMatches.length > 0 : r.previewMatches)) {
        spamSource = 'automatic'; // Caught by phrase rules
      }

      return {
        id: r.id,
        brand: r.brand ?? null,
        text: r.text ?? null,
        createdAt: (r.createdAt ?? new Date()).toISOString(),
        previewMatches: normalizeMatches(r.previewMatches),
        learningScore: learningScore > 0 ? learningScore : undefined,
        learningReasons: learningReasons.length > 0 ? learningReasons : undefined,
        spamSource,
      };
    });

    return NextResponse.json({
      items,
      total,
      pageSize: take,
      offset: skip,
    });
    } catch (err) {
      console.error("spam review GET error:", err);
      return NextResponse.json({ error: "Failed to load spam review" }, { status: 500 });
    }
  }, { service: 'database' });
}