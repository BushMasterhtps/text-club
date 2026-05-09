import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";
import { decodeKnowledgeCursor, encodeKnowledgeCursor } from "@/lib/knowledge-cursor";

const ORDER_EMAIL: Prisma.EmailMacroOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];
const ORDER_TEXT: Prisma.TextClubMacroOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];
const ORDER_QA: Prisma.ProductInquiryQAOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

const EMAIL = "email-macros";
const TEXT = "text-club-macros";
const QA = "product-inquiry-qa";

function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 40;
  return Math.min(100, Math.floor(n));
}

/**
 * GET /api/knowledge/browse?type=email-macros|text-club-macros|product-inquiry-qa
 * &limit=40&cursor=...
 * Email: &brand=&caseType=&q=
 * Text: &q=
 * QA: &brand=&product=&q=
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type")?.trim();
    const limit = clampLimit(searchParams.get("limit"));
    const cursor = decodeKnowledgeCursor(searchParams.get("cursor"));

    if (type === EMAIL) {
      const brand = searchParams.get("brand")?.trim() || "";
      const caseType = searchParams.get("caseType")?.trim() || "";
      const q = searchParams.get("q")?.trim() || "";

      const parts: Prisma.EmailMacroWhereInput[] = [];
      if (brand) parts.push({ brand });
      if (caseType) parts.push({ caseType });
      if (q) {
        parts.push({
          OR: [
            { macroName: { contains: q, mode: "insensitive" } },
            { macro: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        });
      }
      if (cursor) {
        parts.push({
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
          ],
        });
      }
      const where: Prisma.EmailMacroWhereInput = parts.length ? { AND: parts } : {};

      const rows = await prisma.emailMacro.findMany({
        where,
        orderBy: ORDER_EMAIL,
        take: limit + 1,
        select: {
          id: true,
          macroName: true,
          macro: true,
          caseType: true,
          brand: true,
          description: true,
          createdAt: true,
        },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? encodeKnowledgeCursor({ createdAt: page[page.length - 1]!.createdAt, id: page[page.length - 1]!.id })
          : null;

      return NextResponse.json({
        success: true,
        data: { items: page, nextCursor, hasMore },
      });
    }

    if (type === TEXT) {
      const q = searchParams.get("q")?.trim() || "";
      const parts: Prisma.TextClubMacroWhereInput[] = [];
      if (q) {
        parts.push({
          OR: [
            { macroName: { contains: q, mode: "insensitive" } },
            { macroDetails: { contains: q, mode: "insensitive" } },
          ],
        });
      }
      if (cursor) {
        parts.push({
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
          ],
        });
      }
      const where: Prisma.TextClubMacroWhereInput = parts.length ? { AND: parts } : {};

      const rows = await prisma.textClubMacro.findMany({
        where,
        orderBy: ORDER_TEXT,
        take: limit + 1,
        select: {
          id: true,
          macroName: true,
          macroDetails: true,
          createdAt: true,
        },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? encodeKnowledgeCursor({ createdAt: page[page.length - 1]!.createdAt, id: page[page.length - 1]!.id })
          : null;

      return NextResponse.json({
        success: true,
        data: { items: page, nextCursor, hasMore },
      });
    }

    if (type === QA) {
      const brand = searchParams.get("brand")?.trim() || "";
      const product = searchParams.get("product")?.trim() || "";
      const q = searchParams.get("q")?.trim() || "";

      const parts: Prisma.ProductInquiryQAWhereInput[] = [];
      if (brand) parts.push({ brand });
      if (product) parts.push({ product });
      if (q) {
        parts.push({
          OR: [
            { brand: { contains: q, mode: "insensitive" } },
            { product: { contains: q, mode: "insensitive" } },
            { question: { contains: q, mode: "insensitive" } },
            { answer: { contains: q, mode: "insensitive" } },
          ],
        });
      }
      if (cursor) {
        parts.push({
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
          ],
        });
      }
      const where: Prisma.ProductInquiryQAWhereInput = parts.length ? { AND: parts } : {};

      const rows = await prisma.productInquiryQA.findMany({
        where,
        orderBy: ORDER_QA,
        take: limit + 1,
        select: {
          id: true,
          brand: true,
          product: true,
          question: true,
          answer: true,
          createdAt: true,
        },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? encodeKnowledgeCursor({ createdAt: page[page.length - 1]!.createdAt, id: page[page.length - 1]!.id })
          : null;

      return NextResponse.json({
        success: true,
        data: { items: page, nextCursor, hasMore },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Invalid type. Use type=${EMAIL}, type=${TEXT}, or type=${QA}.`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET /api/knowledge/browse failed:", error);
    return NextResponse.json({ success: false, error: "Failed to browse knowledge base" }, { status: 500 });
  }
}
