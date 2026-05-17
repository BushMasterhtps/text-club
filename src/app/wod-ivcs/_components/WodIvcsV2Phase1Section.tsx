"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type { WodIvcsQueuesSummary } from "@/lib/wod-ivcs/queues-summary-service";

type DryRunData = {
  totalRows: number;
  parsedRows: number;
  wouldCreateOrders: number;
  wouldUpdateOrders: number;
  cityBeautyCount: number;
  fivePlusCount: number;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
};

type ImportRun = {
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

type OrderRow = {
  id: string;
  documentNumber: string;
  operationalQueue: string;
  presenceNetSuite: string;
  presenceAging: string;
  isCityBeauty: boolean;
  agingIsFivePlus: boolean;
  netSuiteDaysOld: number | null;
  itemSummaryJson: unknown;
  customerName: string | null;
};

type OrderDetail = OrderRow & {
  customerEmail: string | null;
  latestNetSuiteSnapshotJson: unknown;
  latestAgingSnapshotJson: unknown;
  cases: Array<{ sourceReportType: string; presenceState: string }>;
};

type ReversalPreviewOrder = {
  orderId: string;
  documentNumber: string;
  action: string;
  blockedReason?: string;
  details: string;
};

type ReversalPreview = {
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
  ordersToArchive: ReversalPreviewOrder[];
  ordersToRestore: ReversalPreviewOrder[];
  dropsToUndo: ReversalPreviewOrder[];
  blockedOrders: ReversalPreviewOrder[];
};

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

function PresenceBadge({ label, state }: { label: string; state: string }) {
  const color =
    state === "PRESENT"
      ? "bg-green-500/20 text-green-300"
      : state === "DROPPED"
        ? "bg-orange-500/20 text-orange-300"
        : "bg-gray-500/20 text-gray-300";
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${color}`}>
      {label}: {state}
    </span>
  );
}

function ImportCard({
  title,
  sourceReportType,
  importPath,
  onDone,
}: {
  title: string;
  sourceReportType: "NETSUITE_REPORT" | "AGING_REPORT";
  importPath: string;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "import" | null>(null);
  const [dryRun, setDryRun] = useState<DryRunData | null>(null);
  const [importMsg, setImportMsg] = useState("");

  const runDryRun = async () => {
    if (!file) return;
    setBusy("dry");
    setDryRun(null);
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sourceReportType", sourceReportType);
      const res = await fetch("/api/manager/wod-ivcs/v2/import/dry-run", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Dry-run failed");
      setDryRun(data.data);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Dry-run failed");
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy("import");
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(importPath, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Import failed");
      setImportMsg(
        `Import complete: ${data.summary.createdOrders} created, ${data.summary.updatedOrders} updated, ${data.summary.errorRows} errors`
      );
      onDone();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h4 className="font-semibold text-white">{title}</h4>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setDryRun(null);
          setImportMsg("");
        }}
        className="w-full text-sm text-white/80 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-sky-600 file:text-white"
      />
      <div className="flex gap-2 flex-wrap">
        <SmallButton onClick={runDryRun} disabled={!file || busy !== null}>
          {busy === "dry" ? "Validating…" : "Dry-run"}
        </SmallButton>
        <SmallButton
          onClick={runImport}
          disabled={!file || busy !== null}
          className="bg-green-600 hover:bg-green-700"
        >
          {busy === "import" ? "Importing…" : "Import"}
        </SmallButton>
      </div>
      {dryRun && (
        <div className="text-xs text-white/70 space-y-1 bg-white/5 p-3 rounded">
          <div>Rows: {dryRun.totalRows} → parsed {dryRun.parsedRows}</div>
          <div>Would create {dryRun.wouldCreateOrders}, update {dryRun.wouldUpdateOrders}</div>
          <div>City Beauty: {dryRun.cityBeautyCount}, 5+: {dryRun.fivePlusCount}</div>
          {dryRun.errors.length > 0 && (
            <div className="text-red-300">Errors: {dryRun.errors.length}</div>
          )}
          {dryRun.warnings.map((w, i) => (
            <div key={i} className="text-yellow-300">
              {w}
            </div>
          ))}
        </div>
      )}
      {importMsg && <p className="text-sm text-white/80">{importMsg}</p>}
    </Card>
  );
}

function ReversalPreviewModal({
  run,
  preview,
  loading,
  error,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  confirming,
}: {
  run: ImportRun;
  preview: ReversalPreview | null;
  loading: boolean;
  error: string;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
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
                <div className="font-semibold text-red-300">
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

function PreviewOrderList({
  title,
  orders,
  blocked,
}: {
  title: string;
  orders: ReversalPreviewOrder[];
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

export function WodIvcsV2Phase1Section() {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [presenceEvents, setPresenceEvents] = useState<
    Array<{ sourceReportType: string; presenceState: string; observedAt: string }>
  >([]);
  const [reversalRun, setReversalRun] = useState<ImportRun | null>(null);
  const [reversalPreview, setReversalPreview] = useState<ReversalPreview | null>(null);
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalConfirming, setReversalConfirming] = useState(false);
  const [queuePreview, setQueuePreview] = useState<WodIvcsQueuesSummary | null>(null);

  const refresh = useCallback(async () => {
    const [runsRes, ordersRes] = await Promise.all([
      fetch("/api/manager/wod-ivcs/v2/import/runs?take=20"),
      fetch("/api/manager/wod-ivcs/v2/orders?take=50"),
    ]);
    const runsData = await runsRes.json();
    const ordersData = await ordersRes.json();
    if (runsData.success) setRuns(runsData.runs);
    if (ordersData.success) setOrders(ordersData.orders);

    try {
      const summaryRes = await fetch("/api/manager/wod-ivcs/v2/queues/summary", { cache: "no-store" });
      const summaryJson = await summaryRes.json();
      if (summaryJson.success) setQueuePreview(summaryJson.data);
    } catch {
      /* preview is optional */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openOrder = async (id: string) => {
    const [orderRes, eventsRes] = await Promise.all([
      fetch(`/api/manager/wod-ivcs/v2/orders/${id}`),
      fetch(`/api/manager/wod-ivcs/v2/orders/${id}/presence-events`),
    ]);
    const orderData = await orderRes.json();
    const eventsData = await eventsRes.json();
    if (orderData.success) setSelectedOrder(orderData.order);
    if (eventsData.success) setPresenceEvents(eventsData.events);
  };

  const openReversalPreview = async (run: ImportRun) => {
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
      await refresh();
    } catch (e) {
      setReversalError(e instanceof Error ? e.message : "Reversal failed");
    } finally {
      setReversalConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Task Management</h2>
        <p className="text-sm text-white/50 mt-1">
          Imports and queue work — operational assignment arrives in Phase 3E-3
        </p>
      </div>

      {queuePreview && (
        <Card className="p-4 border border-white/10">
          <h3 className="font-semibold text-white/90 mb-3">Operational queues (preview)</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/25">
              Needs Action: {queuePreview.unassignedNeedsAction} unassigned
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-200 border border-sky-500/25">
              Assigned: {queuePreview.assigned}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-200 border border-blue-500/25">
              In Progress: {queuePreview.inProgress}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-violet-500/15 text-violet-200 border border-violet-500/25">
              Awaiting Drop-Off: {queuePreview.awaitingDropOff}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-3">
            Full queue board and assignment UI coming in Phase 3E-3. See Overview for complete
            breakdown.
          </p>
        </Card>
      )}

      <Card className="p-4 bg-sky-500/10 border border-sky-500/30">
        <p className="text-sm text-sky-200">
          Import NetSuite and Aging reports below. Use Reverse on a completed import to undo that file
          only (replaces legacy Clear All).
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ImportCard
          title="NetSuite Report"
          sourceReportType="NETSUITE_REPORT"
          importPath="/api/manager/wod-ivcs/v2/import/netsuite"
          onDone={refresh}
        />
        <ImportCard
          title="Aging Report"
          sourceReportType="AGING_REPORT"
          importPath="/api/manager/wod-ivcs/v2/import/aging"
          onDone={refresh}
        />
      </div>

      {/* TODO(Phase 3E-3): Move import history to Overview / Import & Diagnostics */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Import history</h3>
          <SmallButton onClick={refresh}>Refresh</SmallButton>
        </div>
        <div className="overflow-x-auto text-sm">
          <table className="w-full">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-1 pr-2">When</th>
                <th className="py-1 pr-2">Source</th>
                <th className="py-1 pr-2">File</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Created/Updated</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-white/50">
                    No imports yet
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.sourceReportType === "NETSUITE_REPORT" ? "NetSuite" : "Aging"}</td>
                  <td className="max-w-[200px] truncate">{r.fileName}</td>
                  <td>
                    <RunStatusBadge status={r.status} />
                  </td>
                  <td>
                    {r.createdOrders}/{r.updatedOrders} ({r.errorRows} err)
                  </td>
                  <td>
                    {r.status === "COMPLETED" && (
                      <SmallButton
                        onClick={() => openReversalPreview(r)}
                        className="bg-red-600/80 hover:bg-red-700 text-xs"
                      >
                        Reverse
                      </SmallButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* TODO(Phase 3E-3): Move read-only order inspector to Import & Diagnostics */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Orders (read-only)</h3>
          <SmallButton onClick={refresh}>Refresh</SmallButton>
        </div>
        <div className="overflow-x-auto text-sm">
          <table className="w-full">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-1">Document #</th>
                <th className="py-1">Queue</th>
                <th className="py-1">Presence</th>
                <th className="py-1">City Beauty</th>
                <th className="py-1">5+</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-white/5">
                  <td className="py-2 font-mono">{o.documentNumber}</td>
                  <td>{o.operationalQueue}</td>
                  <td className="space-x-1">
                    <PresenceBadge label="NS" state={o.presenceNetSuite} />
                    <PresenceBadge label="AG" state={o.presenceAging} />
                  </td>
                  <td>{o.isCityBeauty ? "Yes" : "—"}</td>
                  <td>{o.agingIsFivePlus ? "Yes" : "—"}</td>
                  <td>
                    <SmallButton onClick={() => openOrder(o.id)}>Detail</SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {reversalRun && (
        <ReversalPreviewModal
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

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <Card className="w-full max-w-lg h-full overflow-y-auto p-6 m-0 rounded-none">
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-semibold">{selectedOrder.documentNumber}</h3>
              <SmallButton onClick={() => setSelectedOrder(null)}>Close</SmallButton>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <PresenceBadge label="NetSuite" state={selectedOrder.presenceNetSuite} />
                <PresenceBadge label="Aging" state={selectedOrder.presenceAging} />
              </div>
              <p>Customer: {selectedOrder.customerName ?? "—"}</p>
              <p>Email: {selectedOrder.customerEmail ?? "—"}</p>
              <p>Queue: {selectedOrder.operationalQueue}</p>
              {Array.isArray(selectedOrder.itemSummaryJson) && (
                <div>
                  <p className="font-medium mb-1">Item summary</p>
                  <ul className="list-disc pl-4 text-white/70">
                    {(selectedOrder.itemSummaryJson as Array<{ productName?: string }>).map(
                      (item, i) => (
                        <li key={i}>{item.productName ?? "Item"}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
              <div>
                <p className="font-medium mb-1">Presence history</p>
                <ul className="space-y-1 text-white/60 max-h-40 overflow-y-auto">
                  {presenceEvents.map((e, i) => (
                    <li key={i}>
                      {e.sourceReportType} → {e.presenceState} @{" "}
                      {new Date(e.observedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
              <details>
                <summary className="cursor-pointer text-white/60">NetSuite snapshot</summary>
                <pre className="text-xs mt-2 overflow-auto bg-black/30 p-2 rounded">
                  {JSON.stringify(selectedOrder.latestNetSuiteSnapshotJson, null, 2)}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer text-white/60">Aging snapshot</summary>
                <pre className="text-xs mt-2 overflow-auto bg-black/30 p-2 rounded">
                  {JSON.stringify(selectedOrder.latestAgingSnapshotJson, null, 2)}
                </pre>
              </details>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
