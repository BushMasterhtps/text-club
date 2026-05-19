"use client";

import { useEffect } from "react";
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
      <p className={`font-medium mb-2 ${blocked ? "text-red-300" : "text-white/90"}`}>{title}</p>
      <ul className="max-h-32 overflow-y-auto space-y-1.5 rounded-lg border border-white/10 bg-neutral-950 p-3 text-white/80">
        {orders.map((o) => (
          <li key={o.orderId} className="leading-snug">
            <span className="font-mono text-white">{o.documentNumber}</span>
            <span className="text-white/50"> — </span>
            {o.details}
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wod-ivcs-reversal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-neutral-900 px-6 py-4">
          <div>
            <h3 id="wod-ivcs-reversal-title" className="text-lg font-semibold text-white">
              Reverse import
            </h3>
            <p className="text-sm text-white/60 mt-1">
              {run.fileName} · {run.sourceReportType === "NETSUITE_REPORT" ? "NetSuite" : "Aging"}
            </p>
          </div>
          <SmallButton onClick={onClose}>Close</SmallButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-white">
          <p className="text-sm text-amber-100 bg-amber-950/80 border border-amber-500/40 rounded-lg p-3 leading-relaxed">
            This undoes only the effects of this import run. It does not delete import history rows.
            Orders touched by a later import of the same source are blocked.
          </p>

          {loading && <p className="text-sm text-white/70">Loading preview…</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}

          {preview && !loading && (
            <>
              {preview.blockers.length > 0 && (
                <div className="text-sm text-red-300 space-y-1 rounded-lg border border-red-500/30 bg-red-950/50 p-3">
                  {preview.blockers.map((b) => (
                    <div key={b.code}>{b.message}</div>
                  ))}
                </div>
              )}
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-200/90">
                  {w}
                </p>
              ))}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-neutral-950 p-3">
                  <div className="text-white/50 text-xs uppercase tracking-wide">Archive</div>
                  <div className="font-semibold text-white text-lg mt-1">
                    {preview.summary.ordersToArchive}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-neutral-950 p-3">
                  <div className="text-white/50 text-xs uppercase tracking-wide">Restore</div>
                  <div className="font-semibold text-white text-lg mt-1">
                    {preview.summary.ordersToRestore}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-neutral-950 p-3">
                  <div className="text-white/50 text-xs uppercase tracking-wide">Undo drops</div>
                  <div className="font-semibold text-white text-lg mt-1">
                    {preview.summary.dropsToUndo}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-neutral-950 p-3">
                  <div className="text-white/50 text-xs uppercase tracking-wide">Blocked</div>
                  <div className="font-semibold text-red-300 text-lg mt-1">
                    {preview.summary.blockedOrders}
                  </div>
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
                  className="mt-1 w-full rounded-lg bg-neutral-950 border border-white/20 p-3 text-white text-sm placeholder:text-white/30"
                  placeholder="Explain why this import is being reversed (min 10 characters)"
                />
              </label>

              <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
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
        </div>
      </div>
    </div>
  );
}
