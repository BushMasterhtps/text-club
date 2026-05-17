import type { WodIvcsSourceReportType } from "@prisma/client";
import { getColumnValue, getFirstColumnByAliases, csvHeaders } from "./csv";
import { isAgingFivePlusFromRow } from "./aging-five-plus";
import { isCityBeautyFromRow } from "./city-beauty";
import { normalizeDocumentNumber, parseAmount } from "./normalize";
import type { AggregatedAgingOrder, AgingLineItem, NormalizedAgingRow } from "./types";

const DOC_ALIASES = ["DocumentNumber", "Document Number", "document_number"];
const PRODUCT_ALIASES = ["Product", "Item", "Product Name", "Item Name"];
const SKU_ALIASES = ["SKU", "Product SKU", "Item SKU"];
const QTY_ALIASES = ["Quantity", "Qty", "QTY"];
const AMOUNT_ALIASES = ["Amount", "Line Amount", "Item Amount"];

export function validateAgingHeaders(headers: string[]): string | null {
  const docCol = getFirstColumnByAliases(headers, DOC_ALIASES);
  if (!docCol) return 'Missing required column: DocumentNumber or Document Number';
  return null;
}

function extractLineItem(row: Record<string, string>): AgingLineItem {
  return {
    productName: getColumnValue(row, PRODUCT_ALIASES),
    sku: getColumnValue(row, SKU_ALIASES),
    quantity: parseAmount(getColumnValue(row, QTY_ALIASES)),
    amount: parseAmount(getColumnValue(row, AMOUNT_ALIASES)),
    raw: { ...row },
  };
}

export function parseAgingRow(
  row: Record<string, string>,
  rowNumber: number,
  brandRules: Parameters<typeof isCityBeautyFromRow>[2]
): { ok: true; data: NormalizedAgingRow } | { ok: false; error: string } {
  const doc = getColumnValue(row, DOC_ALIASES);
  const normalized = normalizeDocumentNumber(doc);
  if (!normalized) {
    return { ok: false, error: `Row ${rowNumber}: missing document number` };
  }

  const { isFivePlus, dateRange, daysOld } = isAgingFivePlusFromRow(row);
  const sourceReportType = "AGING_REPORT" as WodIvcsSourceReportType;

  return {
    ok: true,
    data: {
      documentNumber: doc!,
      documentNumberNormalized: normalized,
      dateRange,
      daysOldInvalidCashSale: daysOld,
      subsidiary: getColumnValue(row, ["Subsidiary"]),
      customerName: getColumnValue(row, ["Customer", "Customer Name", "Name"]),
      customerEmail: getColumnValue(row, ["Email", "E-mail"]),
      agingIsFivePlus: isFivePlus,
      isCityBeauty: isCityBeautyFromRow(sourceReportType, row, brandRules),
      lineItem: extractLineItem(row),
      snapshot: { ...row },
    },
  };
}

export function aggregateAgingRows(
  rows: NormalizedAgingRow[],
  sourceRowNumbers: number[]
): AggregatedAgingOrder[] {
  const map = new Map<string, AggregatedAgingOrder>();

  rows.forEach((row, idx) => {
    const key = row.documentNumberNormalized;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        documentNumber: row.documentNumber,
        documentNumberNormalized: key,
        dateRange: row.dateRange,
        daysOldInvalidCashSale: row.daysOldInvalidCashSale,
        subsidiary: row.subsidiary,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        agingIsFivePlus: row.agingIsFivePlus,
        isCityBeauty: row.isCityBeauty,
        itemSummary: [row.lineItem],
        snapshot: { ...row.snapshot, _aggregatedFromRows: [sourceRowNumbers[idx] ?? idx + 1] },
        sourceRowNumbers: [sourceRowNumbers[idx] ?? idx + 1],
      });
      return;
    }

    existing.itemSummary.push(row.lineItem);
    existing.sourceRowNumbers.push(sourceRowNumbers[idx] ?? idx + 1);
    if (row.agingIsFivePlus) existing.agingIsFivePlus = true;
    if (row.isCityBeauty) existing.isCityBeauty = true;
    if (row.daysOldInvalidCashSale != null) {
      existing.daysOldInvalidCashSale = Math.max(
        existing.daysOldInvalidCashSale ?? 0,
        row.daysOldInvalidCashSale
      );
    }
    if (!existing.customerName && row.customerName) existing.customerName = row.customerName;
    if (!existing.customerEmail && row.customerEmail) existing.customerEmail = row.customerEmail;
    const snap = existing.snapshot as Record<string, unknown>;
    const prev = (snap._aggregatedFromRows as number[]) ?? [];
    snap._aggregatedFromRows = [...prev, sourceRowNumbers[idx] ?? idx + 1];
  });

  return Array.from(map.values());
}

export function parseAndAggregateAgingCsv(
  rows: Record<string, string>[],
  brandRules: Parameters<typeof isCityBeautyFromRow>[2]
): {
  aggregated: AggregatedAgingOrder[];
  errors: Array<{ rowNumber: number; message: string }>;
} {
  const headerError = rows.length > 0 ? validateAgingHeaders(csvHeaders(rows)) : null;
  if (headerError) {
    return { aggregated: [], errors: [{ rowNumber: 0, message: headerError }] };
  }

  const parsedRows: NormalizedAgingRow[] = [];
  const rowNumbers: number[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const result = parseAgingRow(row, rowNumber, brandRules);
    if (result.ok) {
      parsedRows.push(result.data);
      rowNumbers.push(rowNumber);
    } else {
      errors.push({ rowNumber, message: result.error });
    }
  });

  return {
    aggregated: aggregateAgingRows(parsedRows, rowNumbers),
    errors,
  };
}
