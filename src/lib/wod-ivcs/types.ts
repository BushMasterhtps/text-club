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

export type ImportRunReevaluationSummary = {
  awaitingDropOffChecked: number;
  dropOffConfirmed: number;
  movedToCompleted: number;
  movedToArchived: number;
  movedToNeedsReview: number;
  noAutomaticChange: number;
  skippedCityBeauty: number;
  skippedMissingSubmission: number;
  skippedMissingRule: number;
  skippedNotFullyDropped: number;
  skippedNoRequiredReports: number;
  /** Phase 4C.2b — Needs Action dropped from all participating reports, no agent work. */
  needsActionChecked: number;
  droppedWithoutAction: number;
  movedNeedsActionToArchived: number;
  skippedNeedsActionNotFullyDropped: number;
  skippedNeedsActionTouchedByAgent: number;
  skippedNeedsActionAssigned: number;
  skippedNeedsActionCityBeauty: number;
  skippedNeedsActionNoRequiredReports: number;
};

/** Operational queue counts (Task Management rules: archivedAt null, City Beauty excluded). */
export type ImportRunQueueSnapshot = {
  needsAction: number;
  assigned: number;
  inProgress: number;
  awaitingDropOff: number;
  needsReview: number;
  itReview: number;
  completed: number;
  archived: number;
};

/** Phase 4C.3 — import impact visibility stored in summaryJson. */
export type ImportRunImpactSummary = {
  queueSnapshots: {
    before: ImportRunQueueSnapshot;
    after: ImportRunQueueSnapshot;
  };
  needsActionDelta: number;
  /** Unique City Beauty orders processed in this import file. */
  cityBeautyRowsInFile: number;
  /** Aging imports only — unique orders flagged 5+ days. */
  fivePlusRowsInFile?: number;
  narrative: string;
};

export type ImportRunSummary = {
  /** Raw CSV data rows (before per-document aggregation). */
  totalRows: number;
  createdOrders: number;
  updatedOrders: number;
  /** Unique document numbers processed (after aggregation/dedupe). */
  parsedRows: number;
  /** Extra CSV rows merged into an existing document (e.g. multi-line Aging). */
  skippedRows: number;
  errorRows: number;
  droppedOrders: number;
  presencePresent: number;
  /** Awaiting Drop-Off reevaluation after presence reconcile (Phase 4C.2a). */
  reevaluation?: ImportRunReevaluationSummary;
  /** Phase 4C.3a — queue snapshots and plain-English impact explanation. */
  impact?: ImportRunImpactSummary;
};
