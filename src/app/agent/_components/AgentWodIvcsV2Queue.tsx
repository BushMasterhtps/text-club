"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AgentWodIvcsApiError,
  fetchAgentWodIvcsActiveWorkflow,
  fetchAgentWodIvcsOrder,
  fetchAgentWodIvcsOrders,
  startAgentWodIvcsOrder,
  type AgentWodIvcsOrderDetail,
  type AgentWodIvcsOrderListItem,
} from "@/lib/wod-ivcs/agent-api-client";
import type { AgentWorkflowSubmitResult } from "@/lib/wod-ivcs/agent-api-client";
import type { AgentActiveWorkflow } from "@/lib/wod-ivcs/agent-workflow-form-utils";
import { labelFor, operationalQueueLabel } from "@/lib/wod-ivcs/routing-matrix-labels";
import { AgentWodIvcsGuidedWorkflowForm } from "./AgentWodIvcsGuidedWorkflowForm";
import { AgentWodIvcsOrderSummary } from "./AgentWodIvcsOrderSummary";

type QueueFilter = "all" | "ASSIGNED" | "IN_PROGRESS";

type Props = {
  /** Keeps parent WOD/IVCS tab badge in sync with v2 open orders. */
  onOpenCountChange?: (count: number) => void;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function queueBadgeClass(queue: string): string {
  if (queue === "ASSIGNED") return "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40";
  if (queue === "IN_PROGRESS") return "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40";
  return "bg-white/10 text-white/70 ring-1 ring-white/15";
}

function presenceBadgeClass(state: string): string {
  if (state === "PRESENT") return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
  if (state === "DROPPED") return "bg-rose-500/15 text-rose-200 ring-rose-500/30";
  return "bg-white/10 text-white/60 ring-white/15";
}

function PresenceBadge({ label, state }: { label: string; state: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${presenceBadgeClass(state)}`}
    >
      {label}: {state === "PRESENT" ? "On report" : state === "DROPPED" ? "Dropped" : "Unknown"}
    </span>
  );
}

function isOrderLocked(order: { operationalQueue: string }): boolean {
  return order.operationalQueue === "ASSIGNED";
}

function isActiveAgentQueue(queue: string): boolean {
  return queue === "ASSIGNED" || queue === "IN_PROGRESS";
}

function workflowSubmitSuccessMessage(targetQueue: string): string {
  const queueLabel = labelFor(operationalQueueLabel, targetQueue);
  switch (targetQueue) {
    case "AWAITING_DROP_OFF":
      return "Workflow submitted. Order moved to Awaiting Drop-Off.";
    case "NEEDS_REVIEW":
    case "IT_REVIEW":
      return "Workflow submitted. Order routed for review.";
    case "COMPLETED":
    case "ARCHIVED":
      return "Workflow submitted. Order completed.";
    default:
      return `Workflow submitted. Order routed to ${queueLabel}.`;
  }
}

/** Shown on ASSIGNED cards/panels — no document # or customer data before Start. */
const LOCKED_ORDER_TITLE = "Assigned WOD/IVCS task";

export default function AgentWodIvcsV2Queue({ onOpenCountChange }: Props) {
  const [orders, setOrders] = useState<AgentWodIvcsOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentWodIvcsOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle"
  );
  const [activeWorkflow, setActiveWorkflow] = useState<AgentActiveWorkflow | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const { total, orders: rows } = await fetchAgentWodIvcsOrders({ take: 100 });
      setOrders(rows);
      onOpenCountChange?.(total);
    } catch (e) {
      const msg = e instanceof AgentWodIvcsApiError ? e.message : "Failed to load orders";
      setListError(msg);
      setOrders([]);
      onOpenCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [onOpenCountChange]);

  const loadDetail = useCallback(async (orderId: string) => {
    setDetailLoading(true);
    setActionError("");
    try {
      const { order } = await fetchAgentWodIvcsOrder(orderId);
      setDetail(order);
      setSelectedOrderId(orderId);
    } catch (e) {
      const msg = e instanceof AgentWodIvcsApiError ? e.message : "Failed to load order";
      setActionError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setWorkflowStatus("loading");
      try {
        const { active } = await fetchAgentWodIvcsActiveWorkflow();
        if (!cancelled) {
          setActiveWorkflow(active);
          setWorkflowStatus("loaded");
        }
      } catch {
        if (!cancelled) {
          setActiveWorkflow(null);
          setWorkflowStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (queueFilter === "all") return orders;
    return orders.filter((o) => o.operationalQueue === queueFilter);
  }, [orders, queueFilter]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      ASSIGNED: orders.filter((o) => o.operationalQueue === "ASSIGNED").length,
      IN_PROGRESS: orders.filter((o) => o.operationalQueue === "IN_PROGRESS").length,
    }),
    [orders]
  );

  const handleStart = async (order: AgentWodIvcsOrderListItem) => {
    setStartingId(order.id);
    setActionError("");
    setSuccessMessage("");
    setSelectedOrderId(order.id);
    setDetail(null);
    setDetailLoading(true);

    try {
      const result = await startAgentWodIvcsOrder(order.id);
      setOrders((prev) => {
        const next = prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                operationalQueue: "IN_PROGRESS",
                workStartedAt: result.order.workStartedAt ?? new Date().toISOString(),
              }
            : o
        );
        onOpenCountChange?.(next.length);
        return next;
      });

      if (queueFilter === "ASSIGNED") {
        setQueueFilter("all");
      }

      await loadDetail(order.id);
      setSuccessMessage("Work started. Order details are now unlocked.");
    } catch (e) {
      setActionError(e instanceof AgentWodIvcsApiError ? e.message : "Failed to start order");
      setDetail(null);
    } finally {
      setStartingId(null);
    }
  };

  const handleSelectOrder = (order: AgentWodIvcsOrderListItem) => {
    setSelectedOrderId(order.id);
    setActionError("");
    if (isOrderLocked(order)) {
      setDetail(null);
      return;
    }
    void loadDetail(order.id);
  };

  const handleWorkflowSubmitted = useCallback(
    (result: AgentWorkflowSubmitResult) => {
      setSuccessMessage(workflowSubmitSuccessMessage(result.targetQueue));
      setActionError("");

      const stillActive = isActiveAgentQueue(result.order.operationalQueue);

      if (!stillActive) {
        setSelectedOrderId(null);
        setDetail(null);
        setOrders((prev) => prev.filter((o) => o.id !== result.order.id));
      }

      void loadOrders();
    },
    [loadOrders]
  );

  const handleWorkflowSubmitStale = useCallback(() => {
    setSelectedOrderId(null);
    setDetail(null);
    void loadOrders();
  }, [loadOrders]);

  const selectedFromList = selectedOrderId
    ? orders.find((o) => o.id === selectedOrderId) ?? null
    : null;
  const panelOrder = detail ?? selectedFromList;
  const panelLocked = panelOrder ? isOrderLocked(panelOrder) : false;
  const panelUnlocked = panelOrder && !panelLocked;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">WOD/IVCS Work Queue</h2>
          <p className="text-sm text-white/55 mt-1 max-w-xl">
            These are WOD/IVCS orders assigned to you by a manager. Start an order to view customer
            details and work the guided workflow.
          </p>
          {workflowStatus === "loaded" && (
            <p className="text-xs text-emerald-300/90 mt-2">Workflow configuration loaded.</p>
          )}
          {workflowStatus === "error" && (
            <p className="text-xs text-amber-300/90 mt-2">
              Workflow configuration could not be loaded. The guided form will be unavailable until
              this is resolved.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          disabled={loading}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {successMessage && (
        <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/35 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      )}

      {listError && (
        <div className="rounded-lg bg-rose-500/15 border border-rose-500/35 px-4 py-3 text-sm text-rose-100">
          {listError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all" as const, label: `All (${counts.all})` },
            { key: "ASSIGNED" as const, label: `Assigned (${counts.ASSIGNED})` },
            { key: "IN_PROGRESS" as const, label: `In Progress (${counts.IN_PROGRESS})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setQueueFilter(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              queueFilter === tab.key
                ? "bg-sky-500/25 text-sky-100 ring-1 ring-sky-500/45"
                : "bg-neutral-800 text-white/70 ring-1 ring-white/10 hover:bg-neutral-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2 space-y-3">
          {loading && orders.length === 0 ? (
            <div className="rounded-xl bg-neutral-900 ring-1 ring-white/10 px-4 py-10 text-center text-white/55">
              Loading your WOD/IVCS orders…
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-xl bg-neutral-900 ring-1 ring-white/10 px-4 py-10 text-center">
              <p className="text-white/80 font-medium">No orders in this view</p>
              <p className="text-sm text-white/50 mt-2">
                When a manager assigns WOD/IVCS orders to you, they will appear here.
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = selectedOrderId === order.id;
              const isStarting = startingId === order.id;
              const locked = isOrderLocked(order);
              return (
                <article
                  key={order.id}
                  className={`rounded-xl bg-neutral-900 ring-1 px-4 py-4 transition-shadow ${
                    isSelected ? "ring-sky-500/50 shadow-lg shadow-sky-950/30" : "ring-white/10"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">
                        {locked ? LOCKED_ORDER_TITLE : order.documentNumber}
                      </p>
                      {locked ? (
                        <p className="text-sm text-white/45 mt-1">
                          Start work to unlock order details
                        </p>
                      ) : (
                        <p className="text-sm text-white/55 mt-0.5 truncate max-w-[240px]">
                          {order.customerName || "No customer name"}
                          {order.customerEmail ? ` · ${order.customerEmail}` : ""}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 shrink-0 ${queueBadgeClass(order.operationalQueue)}`}
                    >
                      {order.operationalQueue === "IN_PROGRESS" ? "In Progress" : "Assigned"}
                    </span>
                  </div>

                  {locked ? (
                    <div
                      className="mt-3 rounded-lg border border-white/10 bg-neutral-950/80 px-3 py-4 select-none"
                      aria-hidden
                    >
                      <div className="space-y-2 blur-[6px] opacity-40 pointer-events-none">
                        <div className="h-3 w-3/4 rounded bg-white/20" />
                        <div className="h-3 w-1/2 rounded bg-white/15" />
                        <div className="flex gap-2 mt-2">
                          <div className="h-5 w-16 rounded-full bg-white/10" />
                          <div className="h-5 w-16 rounded-full bg-white/10" />
                        </div>
                      </div>
                      <p className="text-center text-xs text-white/50 mt-2 relative z-10">
                        Order details hidden until you start
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <PresenceBadge label="NetSuite" state={order.presenceNetSuite} />
                        <PresenceBadge label="Aging" state={order.presenceAging} />
                        {order.agingIsFivePlus && (
                          <span className="inline-flex rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-200 ring-1 ring-orange-500/35">
                            5+ days
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                        <div>
                          <span className="block text-white/35">NetSuite age</span>
                          <span className="text-white/75">
                            {order.netSuiteDaysOld != null ? `${order.netSuiteDaysOld}d` : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-white/35">Work started</span>
                          <span className="text-white/75">{formatDateTime(order.workStartedAt)}</span>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {locked ? (
                      <button
                        type="button"
                        disabled={isStarting}
                        onClick={() => void handleStart(order)}
                        className="flex-1 min-w-[120px] rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 shadow-lg shadow-sky-950/40"
                      >
                        {isStarting ? "Starting…" : "Start work"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectOrder(order)}
                          className="rounded-lg bg-amber-600/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
                        >
                          Continue
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectOrder(order)}
                          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/10 hover:bg-neutral-700"
                        >
                          View
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="xl:col-span-3">
          <div className="rounded-xl bg-neutral-900 ring-1 ring-white/10 p-5 min-h-[320px]">
            {!panelOrder && !detailLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-white/70 font-medium">Select an order</p>
                <p className="text-sm text-white/45 mt-2 max-w-sm">
                  Choose Start on an assigned order, or Continue on an in-progress order.
                </p>
              </div>
            ) : detailLoading ? (
              <div className="py-16 text-center text-white/55">Loading order…</div>
            ) : panelOrder && panelLocked ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/40">WOD/IVCS</p>
                  <h3 className="text-xl font-semibold text-white mt-1">{LOCKED_ORDER_TITLE}</h3>
                  <span
                    className={`inline-flex mt-2 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${queueBadgeClass("ASSIGNED")}`}
                  >
                    Assigned — not started
                  </span>
                </div>

                <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-4 py-4">
                  <p className="text-sm text-sky-100/90 leading-relaxed">
                    Order number, customer, and report details are hidden until you start work.
                    This prevents researching or cherry-picking cases before accepting them.
                  </p>
                </div>

                <div className="rounded-lg border border-dashed border-white/15 bg-neutral-950/80 px-4 py-8 select-none">
                  <div className="space-y-3 blur-md opacity-30 pointer-events-none">
                    <div className="h-4 w-2/3 rounded bg-white/20" />
                    <div className="h-4 w-1/2 rounded bg-white/15" />
                    <div className="h-4 w-3/5 rounded bg-white/10" />
                  </div>
                </div>

                {actionError && (
                  <div className="rounded-lg bg-rose-500/15 border border-rose-500/35 px-3 py-2 text-sm text-rose-100">
                    {actionError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={startingId === panelOrder.id}
                  onClick={() => void handleStart(panelOrder as AgentWodIvcsOrderListItem)}
                  className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 shadow-lg shadow-sky-950/40"
                >
                  {startingId === panelOrder.id ? "Starting…" : "Start work to unlock details"}
                </button>
              </div>
            ) : panelOrder && panelUnlocked ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/40">Order workflow</p>
                  <h3 className="text-xl font-semibold text-white mt-1">{panelOrder.documentNumber}</h3>
                  <p className="text-sm text-white/55 mt-1">
                    {panelOrder.customerName || "No customer name"}
                    {panelOrder.customerEmail ? ` · ${panelOrder.customerEmail}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${queueBadgeClass(panelOrder.operationalQueue)}`}
                  >
                    {panelOrder.operationalQueue === "IN_PROGRESS" ? "In Progress" : "Assigned"}
                  </span>
                  <span className="inline-flex rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-white/70 ring-1 ring-white/10">
                    Status: {panelOrder.operationalStatus}
                  </span>
                </div>

                <AgentWodIvcsOrderSummary
                  order={{
                    documentNumber: panelOrder.documentNumber,
                    customerName: panelOrder.customerName ?? null,
                    customerEmail: panelOrder.customerEmail ?? null,
                    netSuiteDaysOld: panelOrder.netSuiteDaysOld ?? null,
                    agingIsFivePlus: panelOrder.agingIsFivePlus ?? false,
                    latestNetSuiteSnapshotJson:
                      "latestNetSuiteSnapshotJson" in panelOrder
                        ? panelOrder.latestNetSuiteSnapshotJson
                        : null,
                    latestAgingSnapshotJson:
                      "latestAgingSnapshotJson" in panelOrder
                        ? panelOrder.latestAgingSnapshotJson
                        : null,
                  }}
                  presenceNetSuite={panelOrder.presenceNetSuite}
                  presenceAging={panelOrder.presenceAging}
                />

                <div className="rounded-lg bg-neutral-950 ring-1 ring-white/10 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-white/45">Work started</span>
                    <span className="text-white/85">{formatDateTime(panelOrder.workStartedAt)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-white/45">Last updated</span>
                    <span className="text-white/85">{formatDateTime(panelOrder.updatedAt)}</span>
                  </div>
                </div>

                {actionError && (
                  <div className="rounded-lg bg-rose-500/15 border border-rose-500/35 px-3 py-2 text-sm text-rose-100">
                    {actionError}
                  </div>
                )}

                {panelOrder.operationalQueue === "IN_PROGRESS" && activeWorkflow ? (
                  <AgentWodIvcsGuidedWorkflowForm
                    orderId={panelOrder.id}
                    active={activeWorkflow}
                    onSubmitSuccess={handleWorkflowSubmitted}
                    onSubmitStale={handleWorkflowSubmitStale}
                  />
                ) : panelOrder.operationalQueue === "IN_PROGRESS" ? (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-sm text-amber-100/90">
                    Guided workflow form is unavailable because routing configuration could not be
                    loaded. Try refreshing the page.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
