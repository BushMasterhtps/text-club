"use client";

import { useEffect, useState } from "react";
import { SmallButton } from "@/app/_components/SmallButton";
import { queueLabelForKey } from "./wod-ivcs-queue-config";
import { PresenceBadge } from "./WodIvcsQueueUiBits";

type PresenceEvent = {
  sourceReportType: string;
  presenceState: string;
  observedAt: string;
};

type ImportRunRef = {
  id: string;
  fileName: string;
  createdAt: string;
};

type OrderDetail = {
  id: string;
  documentNumber: string;
  operationalQueue: string;
  operationalStatus: string;
  customerName: string | null;
  customerEmail: string | null;
  presenceNetSuite: string;
  presenceAging: string;
  isCityBeauty: boolean;
  itemSummaryJson: unknown;
  latestNetSuiteSnapshotJson: unknown;
  latestAgingSnapshotJson: unknown;
  assignedTo: { id: string; name: string | null; email: string } | null;
  createdByImportRun: ImportRunRef | null;
  updatedByImportRun: ImportRunRef | null;
  cases: Array<{ sourceReportType: string; presenceState: string; lastSeenAt: string | null }>;
};

type Props = {
  orderId: string;
  onClose: () => void;
};

export function WodIvcsOrderInspectorModal({ orderId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [presenceEvents, setPresenceEvents] = useState<PresenceEvent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setOrder(null);
      setPresenceEvents([]);
      try {
        const [orderRes, eventsRes] = await Promise.all([
          fetch(`/api/manager/wod-ivcs/v2/orders/${orderId}`, { cache: "no-store" }),
          fetch(`/api/manager/wod-ivcs/v2/orders/${orderId}/presence-events`, { cache: "no-store" }),
        ]);
        const orderData = await orderRes.json();
        const eventsData = await eventsRes.json();
        if (cancelled) return;
        if (!orderRes.ok || !orderData.success) {
          throw new Error(orderData.error || "Failed to load order");
        }
        setOrder(orderData.order);
        if (eventsData.success) setPresenceEvents(eventsData.events);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load order");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wod-ivcs-order-inspector-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-neutral-900 px-6 py-4">
          <h2
            id="wod-ivcs-order-inspector-title"
            className="text-xl font-semibold text-white font-mono truncate"
          >
            {order?.documentNumber ?? "Order inspector"}
          </h2>
          <SmallButton onClick={onClose}>Close</SmallButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-white">
          {loading && <p className="text-white/70 text-sm">Loading order details…</p>}
          {error && <p className="text-red-300 text-sm">{error}</p>}

          {order && !loading && (
            <div className="space-y-4 text-sm text-white/90">
              <div className="flex gap-2 flex-wrap">
                <PresenceBadge label="NetSuite" state={order.presenceNetSuite} />
                <PresenceBadge label="Aging" state={order.presenceAging} />
              </div>

              <div className="grid gap-2 text-white/80 sm:grid-cols-2">
                <p>
                  <span className="text-white/50">Queue:</span>{" "}
                  {queueLabelForKey(order.operationalQueue)}
                </p>
                <p>
                  <span className="text-white/50">Status:</span> {order.operationalStatus}
                </p>
                <p>
                  <span className="text-white/50">Customer:</span> {order.customerName ?? "—"}
                </p>
                <p>
                  <span className="text-white/50">Email:</span> {order.customerEmail ?? "—"}
                </p>
                <p>
                  <span className="text-white/50">Assignee:</span>{" "}
                  {order.assignedTo
                    ? order.assignedTo.name || order.assignedTo.email
                    : "Unassigned"}
                </p>
                {order.isCityBeauty && (
                  <p className="text-amber-300/90 sm:col-span-2">City Beauty order</p>
                )}
              </div>

              <div>
                <p className="font-medium text-white mb-2">Import provenance</p>
                <ul className="space-y-2 text-white/70">
                  {order.createdByImportRun && (
                    <li>
                      Created by: {order.createdByImportRun.fileName} (
                      {new Date(order.createdByImportRun.createdAt).toLocaleString()})
                    </li>
                  )}
                  {order.updatedByImportRun && (
                    <li>
                      Last updated by import: {order.updatedByImportRun.fileName} (
                      {new Date(order.updatedByImportRun.createdAt).toLocaleString()})
                    </li>
                  )}
                  {!order.createdByImportRun && !order.updatedByImportRun && (
                    <li className="text-white/50">No import run references on record</li>
                  )}
                </ul>
              </div>

              {order.cases.length > 0 && (
                <div>
                  <p className="font-medium text-white mb-2">Report cases</p>
                  <ul className="space-y-1 text-white/60">
                    {order.cases.map((c, i) => (
                      <li key={i}>
                        {c.sourceReportType} — {c.presenceState}
                        {c.lastSeenAt && (
                          <span className="text-white/40">
                            {" "}
                            · last seen {new Date(c.lastSeenAt).toLocaleString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(order.itemSummaryJson) && (
                <div>
                  <p className="font-medium text-white mb-1">Item summary</p>
                  <ul className="list-disc pl-4 text-white/70">
                    {(order.itemSummaryJson as Array<{ productName?: string }>).map((item, i) => (
                      <li key={i}>{item.productName ?? "Item"}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="font-medium text-white mb-1">Presence history</p>
                <ul className="space-y-1 text-white/60 max-h-40 overflow-y-auto">
                  {presenceEvents.length === 0 && (
                    <li className="text-white/40">No presence events recorded</li>
                  )}
                  {presenceEvents.map((e, i) => (
                    <li key={i}>
                      {e.sourceReportType} → {e.presenceState} @{" "}
                      {new Date(e.observedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>

              <details>
                <summary className="cursor-pointer text-white/70">NetSuite snapshot</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-950 p-3 text-xs text-white/80">
                  {JSON.stringify(order.latestNetSuiteSnapshotJson, null, 2)}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer text-white/70">Aging snapshot</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-950 p-3 text-xs text-white/80">
                  {JSON.stringify(order.latestAgingSnapshotJson, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
