"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { formatImportRunImpactCompactLine } from "@/lib/wod-ivcs/import-impact-service";
import { WodIvcsImportRunDetailModal } from "./WodIvcsImportRunDetailModal";
import { WodIvcsReversalPreviewModal } from "./WodIvcsReversalPreviewModal";
import type { WodIvcsImportRun, WodIvcsReversalPreview } from "./wod-ivcs-import-types";

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-green-500/20 text-green-300",
    REVERSED: "bg-purple-500/20 text-purple-300",
    PARTIALLY_REVERSED: "bg-amber-500/20 text-amber-300",
    FAILED: "bg-red-500/20 text-red-300",
    PROCESSING: "bg-sky-500/20 text-sky-300",
    PENDING: "bg-gray-500/20 text-gray-300",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${styles[status] ?? "bg-gray-500/20 text-gray-300"}`}
    >
      {status}
    </span>
  );
}

export function WodIvcsImportHistoryPanel() {
  const [runs, setRuns] = useState<WodIvcsImportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRun, setDetailRun] = useState<WodIvcsImportRun | null>(null);
  const [reversalRun, setReversalRun] = useState<WodIvcsImportRun | null>(null);
  const [reversalPreview, setReversalPreview] = useState<WodIvcsReversalPreview | null>(null);
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalConfirming, setReversalConfirming] = useState(false);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/wod-ivcs/v2/import/runs?take=20", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setRuns(data.runs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const openReversalPreview = async (run: WodIvcsImportRun) => {
    setReversalRun(run);
    setReversalPreview(null);
    setReversalError("");
    setReversalReason("");
    setReversalLoading(true);
    try {
      const res = await fetch(
        `/api/manager/wod-ivcs/v2/import/runs/${run.id}/reverse/preview`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load reversal preview");
      }
      setReversalPreview(data);
    } catch (e) {
      setReversalError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setReversalLoading(false);
    }
  };

  const closeReversalModal = () => {
    setReversalRun(null);
    setReversalPreview(null);
    setReversalError("");
    setReversalReason("");
  };

  const confirmReversal = async () => {
    if (!reversalRun) return;
    setReversalConfirming(true);
    setReversalError("");
    try {
      const res = await fetch(`/api/manager/wod-ivcs/v2/import/runs/${reversalRun.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reversalReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Reversal failed");
      }
      closeReversalModal();
      await loadRuns();
    } catch (e) {
      setReversalError(e instanceof Error ? e.message : "Reversal failed");
    } finally {
      setReversalConfirming(false);
    }
  };

  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Import history & reversal</h3>
            <p className="text-sm text-white/50 mt-1">
              Review import impact summaries and reverse a specific run if needed.
            </p>
          </div>
          <SmallButton onClick={loadRuns} disabled={loading} className="bg-white/10 hover:bg-white/20">
            {loading ? "Refreshing…" : "Refresh"}
          </SmallButton>
        </div>

        <div className="overflow-x-auto text-sm rounded-lg border border-white/10">
          <table className="w-full">
            <thead className="bg-white/[0.04] text-white/50 text-left">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created/Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {!loading && runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-white/50">
                    No imports yet
                  </td>
                </tr>
              )}
              {loading && runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-white/50">
                    Loading import history…
                  </td>
                </tr>
              )}
              {runs.map((r) => {
                const impactLine =
                  r.impactCompact != null
                    ? formatImportRunImpactCompactLine(r.impactCompact)
                    : null;
                return (
                  <tr key={r.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 align-top">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 align-top">
                      {r.sourceReportType === "NETSUITE_REPORT" ? "NetSuite" : "Aging"}
                    </td>
                    <td className="px-3 py-2 align-top max-w-[220px]">
                      <div className="truncate" title={r.fileName}>
                        {r.fileName}
                      </div>
                      {impactLine && (
                        <p className="text-xs text-sky-200/80 mt-1 leading-snug">{impactLine}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <RunStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      {r.createdOrders}/{r.updatedOrders} ({r.errorRows} err)
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1.5 items-end">
                        <SmallButton
                          onClick={() => setDetailRun(r)}
                          className="bg-white/10 hover:bg-white/20 text-xs"
                        >
                          View details
                        </SmallButton>
                        {r.status === "COMPLETED" && (
                          <SmallButton
                            onClick={() => openReversalPreview(r)}
                            className="bg-red-600/80 hover:bg-red-700 text-xs"
                          >
                            Reverse
                          </SmallButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {detailRun && (
        <WodIvcsImportRunDetailModal run={detailRun} onClose={() => setDetailRun(null)} />
      )}

      {reversalRun && (
        <WodIvcsReversalPreviewModal
          run={reversalRun}
          preview={reversalPreview}
          loading={reversalLoading}
          error={reversalError}
          reason={reversalReason}
          onReasonChange={setReversalReason}
          onClose={closeReversalModal}
          onConfirm={confirmReversal}
          confirming={reversalConfirming}
        />
      )}
    </>
  );
}
