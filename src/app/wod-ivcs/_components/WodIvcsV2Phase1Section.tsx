"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

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

export function WodIvcsV2Phase1Section() {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [presenceEvents, setPresenceEvents] = useState<
    Array<{ sourceReportType: string; presenceState: string; observedAt: string }>
  >([]);

  const refresh = useCallback(async () => {
    const [runsRes, ordersRes] = await Promise.all([
      fetch("/api/manager/wod-ivcs/v2/import/runs?take=20"),
      fetch("/api/manager/wod-ivcs/v2/orders?take=50"),
    ]);
    const runsData = await runsRes.json();
    const ordersData = await ordersRes.json();
    if (runsData.success) setRuns(runsData.runs);
    if (ordersData.success) setOrders(ordersData.orders);
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

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-sky-500/10 border border-sky-500/30">
        <p className="text-sm text-sky-200">
          WOD/IVCS v2 (Phase 1) — import and read-only order view. Agent workflow and reversal
          come in later phases.
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
                <th className="py-1">Created/Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-white/50">
                    No imports yet
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.sourceReportType === "NETSUITE_REPORT" ? "NetSuite" : "Aging"}</td>
                  <td className="max-w-[200px] truncate">{r.fileName}</td>
                  <td>{r.status}</td>
                  <td>
                    {r.createdOrders}/{r.updatedOrders} ({r.errorRows} err)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
