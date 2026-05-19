/** Shared types for v2 import + reversal UI. */

export type WodIvcsImportRunImpactCompact = {
  needsActionBefore: number;
  needsActionAfter: number;
  needsActionDelta: number;
  droppedWithoutAction: number;
};

export type WodIvcsImportRun = {
  id: string;
  sourceReportType: string;
  fileName: string;
  status: string;
  totalRows: number;
  parsedRows: number;
  createdOrders: number;
  updatedOrders: number;
  errorRows: number;
  createdAt: string;
  impactCompact?: WodIvcsImportRunImpactCompact | null;
};

export type WodIvcsImportRunDetailRun = WodIvcsImportRun & {
  summaryJson?: unknown;
  skippedRows?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  importedBy?: { id: string; name: string | null; email: string } | null;
};

export type WodIvcsImportRunDetail = {
  run: WodIvcsImportRunDetailRun;
  rowStats: Array<{ status: string; _count: { status: number } }>;
  errorSamples: Array<{ rowNumber: number; errorMessage: string | null }>;
};

export type WodIvcsReversalPreviewOrder = {
  orderId: string;
  documentNumber: string;
  action: string;
  blockedReason?: string;
  details: string;
};

export type WodIvcsReversalPreview = {
  importRunId: string;
  sourceReportType: string;
  canFullyReverse: boolean;
  blockers: Array<{ code: string; message: string }>;
  warnings: string[];
  summary: {
    ordersToArchive: number;
    ordersToRestore: number;
    dropsToUndo: number;
    blockedOrders: number;
    totalAffectedOrders: number;
  };
  ordersToArchive: WodIvcsReversalPreviewOrder[];
  ordersToRestore: WodIvcsReversalPreviewOrder[];
  dropsToUndo: WodIvcsReversalPreviewOrder[];
  blockedOrders: WodIvcsReversalPreviewOrder[];
};

export type WodIvcsImportDryRunData = {
  totalRows: number;
  parsedRows: number;
  wouldCreateOrders: number;
  wouldUpdateOrders: number;
  cityBeautyCount: number;
  fivePlusCount: number;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
};
