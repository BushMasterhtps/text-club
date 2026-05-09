import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiAuthDeniedResponse, requireStaffApiAuth } from "@/lib/auth";
import {
  alphanumericFacetKey,
  clusterByFacetKey,
  clusterEmailBrandTokensFromRawCells,
} from "@/lib/knowledge-facet-normalize";
import { emailMacroBrandMatchesTokensOrLegacySql } from "@/lib/knowledge-email-brand-sql";

const EMAIL_TYPE = "email-macros";
const QA_TYPE = "product-inquiry-qa";

/** One dropdown row: display label + all raw DB values that match (case/trim variants). */
type KnowledgeFacetOption = { label: string; values: string[] };

/**
 * Merge facet strings that only differ by surrounding whitespace or ASCII case.
 * Preserves each distinct raw DB value in `values` for OR filtering.
 * (Used where we intentionally do not apply alphanumeric folding — e.g. QA brand, case type.)
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
 * GET /api/knowledge/facets?type=email-macros&brandValues=[...] → case types scoped to rows matching those brand tokens (comma-split) or legacy full-cell match
 * GET /api/knowledge/facets?type=product-inquiry-qa&brand=...  (single raw brand — legacy)
 * GET /api/knowledge/facets?type=product-inquiry-qa&brandValues=encodeURIComponent(JSON.stringify([...]))
 *
 * Display-only normalization: DB rows are not updated. Email brand facets use atomic tokens from comma-split cells.
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
      const brandGroups = await prisma.emailMacro.groupBy({
        by: ["brand"],
        where: {
          AND: [{ brand: { not: null } }, { NOT: { brand: "" } }],
        },
      });
      const rawBrandCells = brandGroups.map((g) => g.brand).filter((b): b is string => b != null && b !== "");
      const brandOptions = clusterEmailBrandTokensFromRawCells(rawBrandCells);

      let caseTypeOptions: KnowledgeFacetOption[];
      if (brandValuesFromParam.length > 0) {
        const caseTypeRows = await prisma.$queryRaw<Array<{ caseType: string }>>`
          SELECT DISTINCT e."caseType" AS "caseType"
          FROM "EmailMacro" e
          WHERE e."caseType" IS NOT NULL
            AND trim(e."caseType") <> ''
            AND ${emailMacroBrandMatchesTokensOrLegacySql("e", brandValuesFromParam)}
        `;
        caseTypeOptions = clusterStringFacetValues(
          caseTypeRows.map((r) => r.caseType).filter((c) => c != null && c.trim() !== "")
        );
      } else {
        const caseGroups = await prisma.emailMacro.groupBy({
          by: ["caseType"],
          where: {
            AND: [{ caseType: { not: null } }, { NOT: { caseType: "" } }],
          },
        });
        caseTypeOptions = clusterStringFacetValues(
          caseGroups.map((g) => g.caseType).filter((c): c is string => c != null && c !== "")
        );
      }

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
        const rawProducts = productGroups.map((g) => g.product).filter((p) => p != null && p !== "");
        // Phase 1: conservative alphanumeric fold for clustering; values[] stays raw for productIn browse.
        productOptions = clusterByFacetKey(rawProducts, alphanumericFacetKey);
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
