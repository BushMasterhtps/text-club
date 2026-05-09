import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";

const EMAIL_TYPE = "email-macros";
const QA_TYPE = "product-inquiry-qa";

/** One dropdown row: display label + all raw DB values that match (case/trim variants). */
type KnowledgeFacetOption = { label: string; values: string[] };

/**
 * Merge facet strings that only differ by surrounding whitespace or ASCII case.
 * Preserves each distinct raw DB value in `values` for OR filtering (comma-separated brands stay one value).
 */
function clusterStringFacetValues(rawValues: (string | null)[]): KnowledgeFacetOption[] {
  const byKey = new Map<string, Set<string>>();
  for (const raw of rawValues) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(raw);
  }
  const out: KnowledgeFacetOption[] = [];
  for (const [, set] of byKey) {
    const values = Array.from(set).sort((a, b) =>
      a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" })
    );
    const label = values[0]!.trim();
    out.push({ label, values });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}

function parseBrandValuesParam(param: string | null): string[] {
  if (!param?.trim()) return [];
  try {
    const parsed = JSON.parse(param.trim()) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return [];
    return parsed.filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * GET /api/knowledge/facets?type=email-macros|product-inquiry-qa
 * GET /api/knowledge/facets?type=email-macros&brandValues=... → caseTypeOptions scoped to rows with brand IN list (raw variants)
 * GET /api/knowledge/facets?type=product-inquiry-qa&brand=...  (single raw brand — legacy)
 * GET /api/knowledge/facets?type=product-inquiry-qa&brandValues=encodeURIComponent(JSON.stringify([...]))
 *
 * Non-empty facet values only; options sorted alphabetically by label.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApiAuth(request);
  if (!auth.allowed) return apiAuthDeniedResponse(auth);

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type")?.trim();
    const brandForProductsLegacy = searchParams.get("brand")?.trim() || "";
    const brandValuesFromParam = parseBrandValuesParam(searchParams.get("brandValues"));

    if (type === EMAIL_TYPE) {
      const emailBrandFilter =
        brandValuesFromParam.length > 0 ? { brand: { in: brandValuesFromParam } } : {};

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
            AND: [
              { caseType: { not: null } },
              { NOT: { caseType: "" } },
              ...(Object.keys(emailBrandFilter).length > 0 ? [emailBrandFilter] : []),
            ],
          },
        }),
      ]);
      const brandOptions = clusterStringFacetValues(
        brandGroups.map((g) => g.brand).filter((b): b is string => b != null && b !== "")
      );
      const caseTypeOptions = clusterStringFacetValues(
        caseGroups.map((g) => g.caseType).filter((c): c is string => c != null && c !== "")
      );

      return NextResponse.json({
        success: true,
        data: { brandOptions, caseTypeOptions },
      });
    }

    if (type === QA_TYPE) {
      const brandGroups = await prisma.productInquiryQA.groupBy({
        by: ["brand"],
        where: {
          NOT: { brand: "" },
        },
      });
      const brandOptions = clusterStringFacetValues(
        brandGroups.map((g) => g.brand).filter((b) => b != null && b !== "")
      );

      const brandFilterList =
        brandValuesFromParam.length > 0
          ? brandValuesFromParam
          : brandForProductsLegacy
            ? [brandForProductsLegacy]
            : [];

      let productOptions: KnowledgeFacetOption[] = [];
      if (brandFilterList.length > 0) {
        const productGroups = await prisma.productInquiryQA.groupBy({
          by: ["product"],
          where: {
            brand: { in: brandFilterList },
            NOT: { product: "" },
          },
        });
        productOptions = clusterStringFacetValues(
          productGroups.map((g) => g.product).filter((p) => p != null && p !== "")
        );
      }

      return NextResponse.json({
        success: true,
        data: { brandOptions, productOptions },
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
