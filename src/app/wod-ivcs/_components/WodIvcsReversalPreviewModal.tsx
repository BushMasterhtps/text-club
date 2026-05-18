"use client";

import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type {
  WodIvcsImportRun,
  WodIvcsReversalPreview,
  WodIvcsReversalPreviewOrder,
} from "./wod-ivcs-import-types";

function PreviewOrderList({
  title,
  orders,
  blocked,
}: {
  title: string;
  orders: WodIvcsReversalPreviewOrder[];
  blocked?: boolean;
}) {
  if (orders.length === 0) return null;
  return (
    <div className="text-sm">
      <p className={`font-medium mb-1 ${blocked ? "text-red-300" : "text-white/80"}`}>{title}</p>
      <ul className="max-h-28 overflow-y-auto space-y-1 text-white/60 bg-black/20 rounded p-2">
        {orders.map((o) => (
          <li key={o.orderId}>
            <span className="font-mono">{o.documentNumber}</span> — {o.details}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  run: WodIvcsImportRun;
  preview: WodIvcsReversalPreview | null;
  loading: boolean;
  error: string;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
};

export function WodIvcsReversalPreviewModal({
  run,
  preview,
  loading,
  error,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  confirming,
}: Props) {
  const canConfirm =
    preview &&
    preview.summary.totalAffectedOrders > preview.summary.blockedOrders &&
    reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Reverse import</h3>
            <p className="text-sm text-white/60 mt-1">
              {run.fileName} · {run.sourceReportType === "NETSUITE_REPORT" ? "NetSuite" : "Aging"}
            </p>
          </div>
          <SmallButton onClick={onClose}>Close</SmallButton>
        </div>

        <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded p-3">
          This undoes only the effects of this import run. It does not delete import history rows.
          Orders touched by a later import of the same source are blocked.
        </p>

        {loading && <p className="text-sm text-white/70">Loading preview…</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}

        {preview && !loading && (
          <>
            {preview.blockers.length > 0 && (
              <div className="text-sm text-red-300 space-y-1">
                {preview.blockers.map((b) => (
                  <div key={b.code}>{b.message}</div>
                ))}
              </div>
            )}
            {preview.warnings.map((w, i) => (
              <p key={i} className="text-sm text-yellow-300">
                {w}
              </p>
            ))}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="bg-white/5 rounded p-2">
                <div className="text-white/50">Archive</div>
                <div className="font-semibold">{preview.summary.ordersToArchive}</div>
              </div>
              <div className="bg-white/5 rounded p-2">
                <div className="text-white/50">Restore</div>
                <div className="font-semibold">{preview.summary.ordersToRestore}</div>
              </div>
              <div className="bg-white/5 rounded p-2">
                <div className="text-white/50">Undo drops</div>
                <div className="font-semibold">{preview.summary.dropsToUndo}</div>
              </div>
              <div className="bg-white/5 rounded p-2">
                <div className="text-white/50">Blocked</div>
                <div className="font-semibold text-red-300">{preview.summary.blockedOrders}</div>
              </div>
            </div>

            <PreviewOrderList title="Orders to archive" orders={preview.ordersToArchive} />
            <PreviewOrderList title="Orders to restore" orders={preview.ordersToRestore} />
            <PreviewOrderList title="Drop-offs to undo" orders={preview.dropsToUndo} />
            <PreviewOrderList title="Blocked orders" orders={preview.blockedOrders} blocked />

            <label className="block text-sm">
              <span className="text-white/70">Reversal reason (required)</span>
              <textarea
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded bg-black/30 border border-white/20 p-2 text-white text-sm"
                placeholder="Explain why this import is being reversed (min 10 characters)"
              />
            </label>

            <div className="flex gap-2 justify-end">
              <SmallButton onClick={onClose} className="bg-gray-600 hover:bg-gray-700">
                Cancel
              </SmallButton>
              <SmallButton
                onClick={onConfirm}
                disabled={!canConfirm || confirming}
                className="bg-red-600 hover:bg-red-700"
              >
                {confirming ? "Reversing…" : "Confirm reverse"}
              </SmallButton>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
