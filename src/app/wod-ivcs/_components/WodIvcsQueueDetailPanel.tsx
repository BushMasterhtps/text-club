"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { useRangeSelection } from "@/hooks/useRangeSelection";
import { WodIvcsBulkAssignBar } from "./WodIvcsBulkAssignBar";
import {
  ageLabel,
  ageTone,
  formatRelativeTime,
  queueConfig,
  queueLabelForKey,
  type AssignableAgent,
  type OrderMutationSkip,
  type WodIvcsOrderListItem,
  type WodIvcsOperationalQueueKey,
  type WodIvcsQueueKey,
} from "./wod-ivcs-queue-config";
import { PresenceBadge } from "./WodIvcsQueueUiBits";

type ReportSourceFilter = "" | "on_netsuite" | "on_aging";

type Props = {
  queue: WodIvcsOperationalQueueKey;
  globalSearchQuery: string;
  searchNonce: number;
  onMutated: () => void;
};

export function WodIvcsQueueDetailPanel({
  queue,
  globalSearchQuery,
  searchNonce,
  onMutated,
}: Props) {
  const isGlobalSearch = globalSearchQuery.length > 0;
  const config = queueConfig(queue);
  const [orders, setOrders] = useState<WodIvcsOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [fivePlus, setFivePlus] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [reportSource, setReportSource] = useState<ReportSourceFilter>("");

  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [skipped, setSkipped] = useState<OrderMutationSkip[]>([]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const {
    selected,
    selectedCount,
    toggleSelection,
    clearSelection,
    isSelected,
    setSelected,
  } = useRangeSelection(orders, (o) => o.id);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch("/api/manager/agents?filter=WOD_IVCS", { cache: "no-store" });
      const json = await res.json();
      if (json.success && Array.isArray(json.agents)) {
        setAgents(
          json.agents.map((a: { id: string; name: string | null; email: string; isLive?: boolean }) => ({
            id: a.id,
            name: a.name,
            email: a.email,
            isLive: a.isLive,
          }))
        );
      }
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        take: "200",
        sortBy: "netSuiteDaysOld",
        sortDir: "desc",
      });

      if (isGlobalSearch) {
        params.set("q", globalSearchQuery);
        params.set("operationalQueuesOnly", "true");
      } else {
        params.set("queue", queue);
        if (search.trim()) params.set("q", search.trim());
      }

      if (fivePlus) params.set("fivePlus", "true");
      if (unassignedOnly) params.set("unassignedOnly", "true");
      if (reportSource) params.set("reportPresence", reportSource);

      const res = await fetch(`/api/manager/wod-ivcs/v2/orders?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load orders");
      }
      setOrders(json.orders);
      setTotal(json.total);
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Failed to load orders",
      });
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    queue,
    search,
    fivePlus,
    unassignedOnly,
    reportSource,
    isGlobalSearch,
    globalSearchQuery,
  ]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    clearSelection();
    loadOrders();
  }, [queue, loadOrders, clearSelection, searchNonce]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    setDetailOrder(null);
    try {
      const res = await fetch(`/api/manager/wod-ivcs/v2/orders/${id}`);
      const json = await res.json();
      if (json.success) setDetailOrder(json.order);
    } finally {
      setDetailLoading(false);
    }
  };

  const afterMutation = (text: string, skipList: OrderMutationSkip[]) => {
    setMessage({ tone: skipList.length > 0 && !text.includes("Assigned") ? "info" : "success", text });
    setSkipped(skipList);
    clearSelection();
    loadOrders();
    onMutated();
  };

  const handleAssign = async (agentId: string) => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setSkipped([]);
    try {
      const res = await fetch("/api/manager/wod-ivcs/v2/orders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedIds, agentId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Assign failed");
      }
      const agent = agents.find((a) => a.id === agentId);
      const name = agent?.name || agent?.email || "agent";
      afterMutation(
        `Assigned ${json.assigned} order${json.assigned === 1 ? "" : "s"} to ${name}.`,
        json.skipped ?? []
      );
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Assign failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUnassign = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setSkipped([]);
    try {
      const res = await fetch("/api/manager/wod-ivcs/v2/orders/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Unassign failed");
      }
      afterMutation(
        `Unassigned ${json.unassigned} order${json.unassigned === 1 ? "" : "s"}.`,
        json.skipped ?? []
      );
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Unassign failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (targetQueue: WodIvcsQueueKey, moveAgentId?: string) => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setSkipped([]);
    try {
      const body: { orderIds: string[]; targetQueue: string; agentId?: string; note?: string } = {
        orderIds: selectedIds,
        targetQueue,
      };
      if (moveAgentId) body.agentId = moveAgentId;

      const res = await fetch("/api/manager/wod-ivcs/v2/orders/move-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Move failed");
      }
      afterMutation(
        `Moved ${json.moved} order${json.moved === 1 ? "" : "s"} to ${queueConfig(targetQueue).label}.`,
        json.skipped ?? []
      );
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Move failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectAllPage = () => {
    const allSelected = orders.length > 0 && orders.every((o) => isSelected(o.id));
    if (allSelected) {
      clearSelection();
    } else {
      setSelected(new Set(orders.map((o) => o.id)));
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">
          {isGlobalSearch ? "Search results across active queues" : config.label}
        </h3>
        <p className="text-sm text-white/50">
          {isGlobalSearch ? (
            <>
              Matching “{globalSearchQuery}” · {total} order{total === 1 ? "" : "s"}
            </>
          ) : (
            <>{total} order{total === 1 ? "" : "s"}</>
          )}
          {loading ? " · Loading…" : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/10">
        {!isGlobalSearch && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-white/60 flex-1 min-w-[200px]">
            Filter this queue
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Document #, customer, email…"
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm placeholder:text-white/30"
            />
          </label>
          <SmallButton onClick={loadOrders} disabled={loading || busy} className="bg-blue-600 hover:bg-blue-700">
            Apply filters
          </SmallButton>
        </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-white/70">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fivePlus}
              onChange={(e) => setFivePlus(e.target.checked)}
              className="accent-red-500"
            />
            5+ day / urgent
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
              className="accent-sky-500"
            />
            Unassigned only
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-white/60 max-w-xs">
          Report Source
          <select
            value={reportSource}
            onChange={(e) => setReportSource(e.target.value as ReportSourceFilter)}
            className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
          >
            <option value="">All Orders</option>
            <option value="on_netsuite">NetSuite Report</option>
            <option value="on_aging">Aging Report</option>
          </select>
          <span className="text-white/40 font-normal">
            Filter by which morning report the order appeared on.
          </span>
        </label>
      </div>

      <WodIvcsBulkAssignBar
        selectedCount={selectedCount}
        currentQueue={queue}
        searchMode={isGlobalSearch}
        agents={agents}
        agentsLoading={agentsLoading}
        busy={busy}
        message={message}
        skipped={skipped}
        onAssign={handleAssign}
        onUnassign={handleUnassign}
        onMove={handleMove}
        onClear={clearSelection}
        onRefresh={loadOrders}
      />

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-white/60 text-left">
            <tr>
              <th className="px-3 py-2 w-10">
                {(!config.readOnly || isGlobalSearch) && orders.length > 0 && (
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={orders.length > 0 && orders.every((o) => isSelected(o.id))}
                    onChange={toggleSelectAllPage}
                    disabled={busy}
                    aria-label="Select all on page"
                  />
                )}
              </th>
              {isGlobalSearch && <th className="px-3 py-2">Queue</th>}
              <th className="px-3 py-2">Document #</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Reports</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={isGlobalSearch ? 10 : 9} className="px-3 py-8 text-center text-white/50">
                  Loading orders…
                </td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={isGlobalSearch ? 10 : 9} className="px-3 py-8 text-center text-white/50">
                  {isGlobalSearch
                    ? "No matching orders in active queues."
                    : "No orders in this queue match your filters."}
                </td>
              </tr>
            )}
            {!loading &&
              orders.map((order, index) => {
                const rowConfig = queueConfig(order.operationalQueue as WodIvcsQueueKey);
                const rowReadOnly = isGlobalSearch ? rowConfig.readOnly : config.readOnly;
                const rowAssignable = isGlobalSearch ? rowConfig.assignable : !config.readOnly;

                return (
                <tr key={order.id} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    {rowAssignable && (
                      <input
                        type="checkbox"
                        className="accent-sky-500"
                        checked={isSelected(order.id)}
                        onChange={() => {}}
                        onClick={(e) => toggleSelection(order.id, index, e)}
                        disabled={busy}
                      />
                    )}
                  </td>
                  {isGlobalSearch && (
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white/80">
                        {queueLabelForKey(order.operationalQueue)}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2 font-mono text-white">{order.documentNumber}</td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <div className="truncate text-white/90">{order.customerName || "—"}</div>
                    {order.customerEmail && (
                      <div className="truncate text-xs text-white/40">{order.customerEmail}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {order.isCityBeauty ? "City Beauty" : "—"}
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <PresenceBadge label="NS" state={order.presenceNetSuite} />
                    <PresenceBadge label="AG" state={order.presenceAging} />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${ageTone(order)}`}
                    >
                      {ageLabel(order)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white/80">
                    {order.assignedTo ? (
                      <span title={order.assignedTo.email}>
                        {order.assignedTo.name || order.assignedTo.email}
                      </span>
                    ) : (
                      <span className="text-amber-300/80">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white/50 text-xs">
                    {formatRelativeTime(order.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <SmallButton
                      onClick={() => openDetail(order.id)}
                      className="bg-white/10 hover:bg-white/20 text-xs"
                    >
                      View
                    </SmallButton>
                  </td>
                </tr>
              );
              })}
          </tbody>
        </table>
      </div>

      {detailId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <Card className="w-full max-w-md h-full overflow-y-auto p-6 m-0 rounded-none border-l border-white/10">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-lg font-semibold text-white">Order details</h4>
              <SmallButton onClick={() => setDetailId(null)}>Close</SmallButton>
            </div>
            {detailLoading && <p className="text-white/50">Loading…</p>}
            {detailOrder && (
              <div className="space-y-3 text-sm text-white/80">
                <p>
                  <span className="text-white/50">Document:</span>{" "}
                  <span className="font-mono text-white">
                    {String(detailOrder.documentNumber ?? "")}
                  </span>
                </p>
                <p>
                  <span className="text-white/50">Customer:</span>{" "}
                  {String(detailOrder.customerName ?? "—")}
                </p>
                <p>
                  <span className="text-white/50">Email:</span>{" "}
                  {String(detailOrder.customerEmail ?? "—")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <PresenceBadge
                    label="NetSuite"
                    state={String(detailOrder.presenceNetSuite ?? "UNKNOWN")}
                  />
                  <PresenceBadge
                    label="Aging"
                    state={String(detailOrder.presenceAging ?? "UNKNOWN")}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </Card>
  );
}
