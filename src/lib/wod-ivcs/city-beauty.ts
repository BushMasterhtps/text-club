import type { PrismaClient, WodIvcsSourceReportType } from "@prisma/client";
import { getColumnValue } from "./csv";

const DEFAULT_RULES: Array<{
  sourceReportType: WodIvcsSourceReportType;
  matchField: string;
  matchValue: string;
}> = [
  { sourceReportType: "NETSUITE_REPORT", matchField: "Brand", matchValue: "City Beauty" },
  { sourceReportType: "AGING_REPORT", matchField: "Subsidiary", matchValue: "City Beauty LLC" },
];

export async function loadBrandRules(prisma: PrismaClient) {
  const rules = await prisma.wodIvcsBrandRule.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
  });
  return rules.length > 0 ? rules : null;
}

export function matchesBrandRule(
  sourceReportType: WodIvcsSourceReportType,
  matchField: string,
  matchValue: string,
  row: Record<string, string>
): boolean {
  const fieldAliases =
    matchField.toLowerCase() === "brand"
      ? ["Brand"]
      : matchField.toLowerCase() === "subsidiary"
        ? ["Subsidiary"]
        : [matchField];

  const cell = getColumnValue(row, fieldAliases);
  if (!cell) return false;
  return cell.trim().toLowerCase() === matchValue.trim().toLowerCase();
}

export function isCityBeautyFromRow(
  sourceReportType: WodIvcsSourceReportType,
  row: Record<string, string>,
  rules: Array<{
    sourceReportType: WodIvcsSourceReportType;
    matchField: string;
    matchValue: string;
    isInclusive: boolean;
  }> | null
): boolean {
  const active = rules?.filter((r) => r.sourceReportType === sourceReportType && r.isInclusive) ??
    DEFAULT_RULES.filter((r) => r.sourceReportType === sourceReportType).map((r) => ({
      ...r,
      isInclusive: true,
    }));

  return active.some((r) => matchesBrandRule(sourceReportType, r.matchField, r.matchValue, row));
}
