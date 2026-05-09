import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";
import { decodeKnowledgeCursor, encodeKnowledgeCursor } from "@/lib/knowledge-cursor";
import { emailMacroBrandMatchesTokensOrLegacySql } from "@/lib/knowledge-email-brand-sql";

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

/** URL param: encodeURIComponent(JSON.stringify(string[])) */
function parseJsonStringArray(param: string | null): string[] | null {
  if (!param?.trim()) return null;
  try {
    const parsed = JSON.parse(param.trim()) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return null;
    const out = parsed.filter((s: string) => s.length > 0);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
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
      const brandIn = parseJsonStringArray(searchParams.get("brandIn"));
      const brandSingle = searchParams.get("brand")?.trim() || "";
      const caseTypeIn = parseJsonStringArray(searchParams.get("caseTypeIn"));
      const caseTypeSingle = searchParams.get("caseType")?.trim() || "";
      const q = searchParams.get("q")?.trim() || "";

      type EmailBrowseRow = {
        id: string;
        macroName: string;
        macro: string;
        caseType: string | null;
        brand: string | null;
        description: string | null;
        createdAt: Date;
      };

      /** brandIn: atomic tokens (comma-split match) or legacy full raw cell; see knowledge-email-brand-sql.ts */
      const useBrandTokenSql = brandIn && brandIn.length > 0;

      let rows: EmailBrowseRow[];

      if (useBrandTokenSql) {
        const conditions: Prisma.Sql[] = [emailMacroBrandMatchesTokensOrLegacySql("e", brandIn)];
        if (caseTypeIn?.length) {
          conditions.push(
            Prisma.sql`e."caseType" IN (${Prisma.join(caseTypeIn.map((c) => Prisma.sql`${c}`))})`
          );
        } else if (caseTypeSingle) {
          conditions.push(Prisma.sql`e."caseType" = ${caseTypeSingle}`);
        }
        if (q) {
          const p = `%${q}%`;
          conditions.push(
            Prisma.sql`(e."macroName" ILIKE ${p} OR e.macro ILIKE ${p} OR e.description ILIKE ${p} OR e."caseType" ILIKE ${p} OR e.brand ILIKE ${p})`
          );
        }
        if (cursor) {
          conditions.push(
            Prisma.sql`(e."createdAt" < ${cursor.createdAt} OR (e."createdAt" = ${cursor.createdAt} AND e.id < ${cursor.id}))`
          );
        }
        const whereClause = Prisma.join(conditions, " AND ");
        rows = await prisma.$queryRaw<EmailBrowseRow[]>`
          SELECT e.id, e."macroName", e.macro, e."caseType", e.brand, e.description, e."createdAt"
          FROM "EmailMacro" e
          WHERE ${whereClause}
          ORDER BY e."createdAt" DESC, e.id DESC
          LIMIT ${limit + 1}
        `;
      } else {
        const parts: Prisma.EmailMacroWhereInput[] = [];
        if (brandSingle) parts.push({ brand: brandSingle });
        if (caseTypeIn) parts.push({ caseType: { in: caseTypeIn } });
        else if (caseTypeSingle) parts.push({ caseType: caseTypeSingle });
        if (q) {
          parts.push({
            OR: [
              { macroName: { contains: q, mode: "insensitive" } },
              { macro: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { caseType: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
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

        rows = await prisma.emailMacro.findMany({
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
      }

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
      const brandIn = parseJsonStringArray(searchParams.get("brandIn"));
      const brandSingle = searchParams.get("brand")?.trim() || "";
      const productIn = parseJsonStringArray(searchParams.get("productIn"));
      const productSingle = searchParams.get("product")?.trim() || "";
      const q = searchParams.get("q")?.trim() || "";

      const parts: Prisma.ProductInquiryQAWhereInput[] = [];
      if (brandIn) parts.push({ brand: { in: brandIn } });
      else if (brandSingle) parts.push({ brand: brandSingle });
      if (productIn) parts.push({ product: { in: productIn } });
      else if (productSingle) parts.push({ product: productSingle });
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
