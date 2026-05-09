import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";

const EMAIL_TYPE = "email-macros";
const QA_TYPE = "product-inquiry-qa";

function sortAlphaUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/**
 * GET /api/knowledge/facets?type=email-macros|product-inquiry-qa
 * GET /api/knowledge/facets?type=product-inquiry-qa&brand=...  → products for that brand only
 *
 * Non-empty, non-null facet values only; sorted alphabetically.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type")?.trim();
    const brandForProducts = searchParams.get("brand")?.trim() || "";

    if (type === EMAIL_TYPE) {
      const [brandGroups, caseGroups] = await Promise.all([
        prisma.emailMacro.groupBy({
          by: ["brand"],
          where: {
            AND: [{ brand: { not: null } }, { NOT: { brand: "" } }],
          },
        }),
        prisma.emailMacro.groupBy({
          by: ["caseType"],
          where: {
            AND: [{ caseType: { not: null } }, { NOT: { caseType: "" } }],
          },
        }),
      ]);
      const brands = sortAlphaUnique(brandGroups.map((g) => g.brand).filter(Boolean) as string[]);
      const caseTypes = sortAlphaUnique(caseGroups.map((g) => g.caseType).filter(Boolean) as string[]);

      return NextResponse.json({
        success: true,
        data: { brands, caseTypes },
      });
    }

    if (type === QA_TYPE) {
      const brandGroups = await prisma.productInquiryQA.groupBy({
        by: ["brand"],
        where: {
          AND: [{ brand: { not: null } }, { NOT: { brand: "" } }],
        },
      });
      const brands = sortAlphaUnique(brandGroups.map((g) => g.brand).filter(Boolean) as string[]);

      let products: string[] = [];
      if (brandForProducts) {
        const productGroups = await prisma.productInquiryQA.groupBy({
          by: ["product"],
          where: {
            brand: brandForProducts,
            AND: [{ product: { not: null } }, { NOT: { product: "" } }],
          },
        });
        products = sortAlphaUnique(productGroups.map((g) => g.product).filter(Boolean) as string[]);
      }

      return NextResponse.json({
        success: true,
        data: { brands, products },
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid or unsupported type. Use ${EMAIL_TYPE} or ${QA_TYPE}.` },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET /api/knowledge/facets failed:", error);
    return NextResponse.json({ success: false, error: "Failed to load facets" }, { status: 500 });
  }
}
