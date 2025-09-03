// src/app/api/manager/spam/archive/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/manager/spam/archive?take=50&offset=0&q=optional
 * Returns paged archive rows. We normalize a single `archivedAt` date so the UI
 * doesn't have to guess between `firstSeen`/`lastSeen`.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const take = Math.min(200, Math.max(1, Number(url.searchParams.get("take") ?? 50)));
    const offset = Math.max(
      0,
      Number(url.searchParams.get("offset") ?? url.searchParams.get("skip") ?? 0)
    );
    const q = (url.searchParams.get("q") ?? "").trim();

    const where: any = {};
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.spamArchive.findMany({
        where,
        orderBy: [
          { lastSeen: "desc" },
          { firstSeen: "desc" },
          { id: "desc" },
        ],
        skip: offset,
        take,
        select: {
          id: true,
          brand: true,
          text: true,
          firstSeen: true,
          lastSeen: true,
        },
      }),
      prisma.spamArchive.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      brand: r.brand,
      text: r.text,
      archivedAt: r.lastSeen ?? r.firstSeen ?? null, // <<< single field the UI uses
    }));

    return NextResponse.json({
      success: true,
      items,
      total,
      pageSize: take,
      offset,
    });
  } catch (err: any) {
    console.error("GET /api/manager/spam/archive failed:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load spam archive" },
      { status: 500 }
    );
  }
}