import type { WodIvcsSourceReportType } from "@prisma/client";
import { getColumnValue, getFirstColumnByAliases, csvHeaders } from "./csv";
import { isCityBeautyFromRow } from "./city-beauty";
import {
  computeNetSuiteDaysOld,
  normalizeDocumentNumber,
  parseAmount,
  parseFlexibleDate,
} from "./normalize";
import type { NormalizedNetSuiteRow } from "./types";

const DOC_ALIASES = ["Document Number", "DocumentNumber", "document_number"];
const DATE_ALIASES = ["Date"];
const BRAND_ALIASES = ["Brand"];
const NAME_ALIASES = ["Name", "Customer", "Customer Name"];
const EMAIL_ALIASES = ["Email", "E-mail"];
const AMOUNT_ALIASES = ["Amount", "Web total Difference", "Web Total"];

export function validateNetSuiteHeaders(headers: string[]): string | null {
  const docCol = getFirstColumnByAliases(headers, DOC_ALIASES);
  if (!docCol) return 'Missing required column: Document Number or DocumentNumber';
  const dateCol = getFirstColumnByAliases(headers, DATE_ALIASES);
  if (!dateCol) return 'Missing required column: Date';
  return null;
}

export function parseNetSuiteRow(
  row: Record<string, string>,
  rowNumber: number,
  brandRules: Parameters<typeof isCityBeautyFromRow>[2]
): { ok: true; data: NormalizedNetSuiteRow } | { ok: false; error: string } {
  const doc = getColumnValue(row, DOC_ALIASES);
  const normalized = normalizeDocumentNumber(doc);
  if (!normalized) {
    return { ok: false, error: `Row ${rowNumber}: missing document number` };
  }

  const headers = Object.keys(row);
  const dateHeader = getFirstColumnByAliases(headers, DATE_ALIASES);
  const dateRaw = dateHeader ? row[dateHeader] : null;
  const orderDate = parseFlexibleDate(dateRaw);
  const asOf = new Date();

  const sourceReportType = "NETSUITE_REPORT" as WodIvcsSourceReportType;

  const data: NormalizedNetSuiteRow = {
    documentNumber: doc!,
    documentNumberNormalized: normalized,
    orderDateFromNetSuiteReport: orderDate,
    netSuiteDaysOld: computeNetSuiteDaysOld(orderDate, asOf),
    brand: getColumnValue(row, BRAND_ALIASES),
    customerName: getColumnValue(row, NAME_ALIASES),
    customerEmail: getColumnValue(row, EMAIL_ALIASES),
    amount: parseAmount(getColumnValue(row, AMOUNT_ALIASES)),
    isCityBeauty: isCityBeautyFromRow(sourceReportType, row, brandRules),
    snapshot: { ...row },
  };

  return { ok: true, data };
}

export function parseNetSuiteCsv(
  rows: Record<string, string>[],
  brandRules: Parameters<typeof isCityBeautyFromRow>[2]
): {
  parsed: NormalizedNetSuiteRow[];
  errors: Array<{ rowNumber: number; message: string }>;
} {
  const headerError = rows.length > 0 ? validateNetSuiteHeaders(csvHeaders(rows)) : null;
  if (headerError) {
    return { parsed: [], errors: [{ rowNumber: 0, message: headerError }] };
  }

  const parsed: NormalizedNetSuiteRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const result = parseNetSuiteRow(row, rowNumber, brandRules);
    if (result.ok) parsed.push(result.data);
    else errors.push({ rowNumber, message: result.error });
  });

  return { parsed, errors };
}
