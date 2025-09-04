// src/app/api/manager/spam/review/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getImprovedSpamScore } from "@/lib/spam-detection";

const prisma = new PrismaClient();

export async function GET(req: Request) {
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

    const items = await Promise.all(rows.map(async (r) => {
      let learningScore = 0;
      let learningReasons: string[] = [];
      
      // Get learning system score for this item
      try {
        if (r.text) {
          const learningResult = await getImprovedSpamScore(r.text, r.brand || undefined);
          learningScore = learningResult.score;
          learningReasons = learningResult.reasons;
        }
      } catch (error) {
        console.error('Error getting learning score for spam review item:', error);
      }

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
    }));

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
}