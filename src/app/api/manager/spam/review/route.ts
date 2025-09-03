// src/app/api/manager/spam/review/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const takeParam = parseInt(url.searchParams.get("take") || "50", 10);
    const skipParam = parseInt(url.searchParams.get("skip") || "0", 10);
    const q = (url.searchParams.get("q") || "").trim();

    const take = Math.min(Math.max(isNaN(takeParam) ? 50 : takeParam, 1), 200);
    const skip = Math.max(isNaN(skipParam) ? 0 : skipParam, 0);

    const where: any = { status: "SPAM_REVIEW" };
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { text:  { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.rawMessage.count({ where }),
      prisma.rawMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
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

    const items = rows.map((r) => ({
      id: r.id,
      brand: r.brand ?? null,
      text: r.text ?? null,
      createdAt: (r.createdAt ?? new Date()).toISOString(),
      previewMatches: normalizeMatches(r.previewMatches),
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