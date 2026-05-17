import type { WodIvcsSourceReportType } from "@prisma/client";

export type NormalizedNetSuiteRow = {
  documentNumber: string;
  documentNumberNormalized: string;
  orderDateFromNetSuiteReport: Date | null;
  netSuiteDaysOld: number | null;
  brand: string | null;
  customerName: string | null;
  customerEmail: string | null;
  amount: number | null;
  isCityBeauty: boolean;
  snapshot: Record<string, unknown>;
};

export type AgingLineItem = {
  productName?: string | null;
  sku?: string | null;
  quantity?: number | null;
  amount?: number | null;
  raw?: Record<string, unknown>;
};

export type NormalizedAgingRow = {
  documentNumber: string;
  documentNumberNormalized: string;
  dateRange: string | null;
  daysOldInvalidCashSale: number | null;
  subsidiary: string | null;
  customerName: string | null;
  customerEmail: string | null;
  agingIsFivePlus: boolean;
  isCityBeauty: boolean;
  lineItem: AgingLineItem;
  snapshot: Record<string, unknown>;
};

export type AggregatedAgingOrder = {
  documentNumber: string;
  documentNumberNormalized: string;
  dateRange: string | null;
  daysOldInvalidCashSale: number | null;
  subsidiary: string | null;
  customerName: string | null;
  customerEmail: string | null;
  agingIsFivePlus: boolean;
  isCityBeauty: boolean;
  itemSummary: AgingLineItem[];
  snapshot: Record<string, unknown>;
  sourceRowNumbers: number[];
};

export type DryRunResult = {
  sourceReportType: WodIvcsSourceReportType;
  fileName: string;
  totalRows: number;
  parsedRows: number;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
  wouldCreateOrders: number;
  wouldUpdateOrders: number;
  cityBeautyCount: number;
  fivePlusCount: number;
  duplicateDocumentNumbers: string[];
  sampleNormalizedRows: Record<string, unknown>[];
};

export type ImportRunSummary = {
  createdOrders: number;
  updatedOrders: number;
  parsedRows: number;
  skippedRows: number;
  errorRows: number;
  droppedOrders: number;
  presencePresent: number;
};
