/** Shared types for v2 import + reversal UI. */

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
