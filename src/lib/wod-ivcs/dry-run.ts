import type { PrismaClient, WodIvcsSourceReportType } from "@prisma/client";
import { loadBrandRules } from "./city-beauty";
import { parseCsvText } from "./csv";
import { parseAndAggregateAgingCsv } from "./parse-aging";
import { parseNetSuiteCsv } from "./parse-netsuite";
import type { DryRunResult } from "./types";

async function existingDocSet(
  prisma: PrismaClient,
  normalized: string[]
): Promise<Set<string>> {
  if (normalized.length === 0) return new Set();
  const found = await prisma.wodIvcsOrder.findMany({
    where: { documentNumberNormalized: { in: normalized } },
    select: { documentNumberNormalized: true },
  });
  return new Set(found.map((o) => o.documentNumberNormalized));
}

export async function runDryRun(
  prisma: PrismaClient,
  sourceReportType: WodIvcsSourceReportType,
  fileName: string,
  csvText: string
): Promise<DryRunResult> {
  const brandRules = await loadBrandRules(prisma);
  const rawRows = parseCsvText(csvText);
  const warnings: string[] = [];

  if (sourceReportType === "NETSUITE_REPORT") {
    const { parsed, errors } = parseNetSuiteCsv(rawRows, brandRules);
    const docs = parsed.map((p) => p.documentNumberNormalized);
    const existing = await existingDocSet(prisma, docs);
    const wouldCreate = docs.filter((d) => !existing.has(d)).length;
    const wouldUpdate = docs.filter((d) => existing.has(d)).length;
    const dupInFile = docs.filter((d, i) => docs.indexOf(d) !== i);

    return {
      sourceReportType,
      fileName,
      totalRows: rawRows.length,
      parsedRows: parsed.length,
      errors,
      warnings,
      wouldCreateOrders: wouldCreate,
      wouldUpdateOrders: wouldUpdate,
      cityBeautyCount: parsed.filter((p) => p.isCityBeauty).length,
      fivePlusCount: 0,
      duplicateDocumentNumbers: [...new Set(dupInFile)],
      sampleNormalizedRows: parsed.slice(0, 5).map((p) => p.snapshot),
    };
  }

  const { aggregated, errors } = parseAndAggregateAgingCsv(rawRows, brandRules);
  const docs = aggregated.map((a) => a.documentNumberNormalized);
  const existing = await existingDocSet(prisma, docs);
  const wouldCreate = docs.filter((d) => !existing.has(d)).length;
  const wouldUpdate = docs.filter((d) => existing.has(d)).length;

  if (rawRows.length > aggregated.length) {
    warnings.push(
      `Aggregated ${rawRows.length} row(s) into ${aggregated.length} order(s) by document number`
    );
  }

  return {
    sourceReportType,
    fileName,
    totalRows: rawRows.length,
    parsedRows: aggregated.length,
    errors,
    warnings,
    wouldCreateOrders: wouldCreate,
    wouldUpdateOrders: wouldUpdate,
    cityBeautyCount: aggregated.filter((a) => a.isCityBeauty).length,
    fivePlusCount: aggregated.filter((a) => a.agingIsFivePlus).length,
    duplicateDocumentNumbers: [],
    sampleNormalizedRows: aggregated.slice(0, 5).map((a) => ({
      documentNumber: a.documentNumber,
      itemSummary: a.itemSummary,
      agingIsFivePlus: a.agingIsFivePlus,
      isCityBeauty: a.isCityBeauty,
    })),
  };
}
