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
import {
  DEFAULT_WOD_IVCS_ORDERS_SORT,
  defaultSortDirForField,
  type WodIvcsOrdersSortField,
} from "@/lib/wod-ivcs/orders-list-sort";
import type {
  WodIvcsAgeBucket,
  WodIvcsReportPresenceFilter,
} from "@/lib/wod-ivcs/orders-list-query";
import { PresenceBadge } from "./WodIvcsQueueUiBits";
import { WodIvcsManagerOrderDetailModal } from "./WodIvcsManagerOrderDetailModal";

type ReportPresenceUi = "" | WodIvcsReportPresenceFilter;

type SortState = {
  sortBy: WodIvcsOrdersSortField;
  sortDir: "asc" | "desc";
};

const PAGE_SIZE = 100;

function SortableTh({
  label,
  field,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  field: WodIvcsOrdersSortField;
  sort: SortState;
  onSort: (field: WodIvcsOrdersSortField) => void;
  className?: string;
}) {
  const active = sort.sortBy === field;
  const indicator = active ? (sort.sortDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 font-medium transition-colors ${
          active ? "text-white" : "text-white/60 hover:text-white/85"
        }`}
        title={active ? `Sorted ${sort.sortDir === "asc" ? "ascending" : "descending"}` : `Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={`text-xs ${active ? "text-sky-300" : "text-white/30"}`} aria-hidden>
          {indicator}
        </span>
      </button>
    </th>
  );
}

type Props = {
  queue: WodIvcsOperationalQueueKey;
  globalSearchQuery: string;
  searchNonce: number;
  /** Bumped after import / board refresh so the list reloads with updated counts. */
  refreshKey?: number;
  onMutated: () => void;
};

export function WodIvcsQueueDetailPanel({
  queue,
  globalSearchQuery,
  searchNonce,
  refreshKey = 0,
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
  const [ageBucket, setAgeBucket] = useState<WodIvcsAgeBucket>("all");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [assignedAgentFilter, setAssignedAgentFilter] = useState("");
  const [reportPresence, setReportPresence] = useState<ReportPresenceUi>("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(DEFAULT_WOD_IVCS_ORDERS_SORT);

  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [skipped, setSkipped] = useState<OrderMutationSkip[]>([]);

  const [detailId, setDetailId] = useState<string | null>(null);

  /** Same rows that render a checkbox — indices must match useRangeSelection's items array. */
  const selectableOrders = useMemo(() => {
    return orders.filter((order) => {
      const rowConfig = queueConfig(order.operationalQueue as WodIvcsQueueKey);
      return isGlobalSearch ? rowConfig.assignable : !config.readOnly;
    });
  }, [orders, isGlobalSearch, config.readOnly]);

  const selectableIndexById = useMemo(() => {
    const map = new Map<string, number>();
    selectableOrders.forEach((order, index) => map.set(order.id, index));
    return map;
  }, [selectableOrders]);

  const {
    selected,
    selectedCount,
    toggleSelection,
    clearSelection,
    selectAll: selectAllOnPage,
    isSelected,
  } = useRangeSelection(selectableOrders, (o) => o.id);

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
      const skip = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(skip),
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
      });

      if (isGlobalSearch) {
        params.set("q", globalSearchQuery);
        params.set("operationalQueuesOnly", "true");
      } else {
        params.set("queue", queue);
        if (search.trim()) params.set("q", search.trim());
      }

      if (ageBucket !== "all") params.set("ageBucket", ageBucket);
      if (assignedAgentFilter === "__unassigned__") {
        params.set("unassignedOnly", "true");
      } else if (assignedAgentFilter) {
        params.set("assignedToId", assignedAgentFilter);
      } else if (unassignedOnly) {
        params.set("unassignedOnly", "true");
      }
      if (reportPresence) params.set("reportPresence", reportPresence);
      if (orderDateFrom) params.set("orderDateFrom", orderDateFrom);
      if (orderDateTo) params.set("orderDateTo", orderDateTo);

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
    ageBucket,
    unassignedOnly,
    assignedAgentFilter,
    reportPresence,
    orderDateFrom,
    orderDateTo,
    isGlobalSearch,
    globalSearchQuery,
    page,
    sort.sortBy,
    sort.sortDir,
  ]);

  const handleSort = (field: WodIvcsOrdersSortField) => {
    setSort((prev) => {
      if (prev.sortBy === field) {
        return { sortBy: field, sortDir: prev.sortDir === "asc" ? "desc" : "asc" };
      }
      return { sortBy: field, sortDir: defaultSortDirForField(field) };
    });
    setPage(1);
    clearSelection();
  };

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const applyFilters = () => {
    clearSelection();
    if (page === 1) void loadOrders();
    else setPage(1);
  };

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [
    queue,
    ageBucket,
    unassignedOnly,
    assignedAgentFilter,
    reportPresence,
    orderDateFrom,
    orderDateTo,
    searchNonce,
  ]);

  useEffect(() => {
    clearSelection();
    loadOrders();
  }, [queue, loadOrders, clearSelection, searchNonce, page, refreshKey]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const openDetail = (id: string) => {
    setDetailId(id);
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
    const allSelected =
      selectableOrders.length > 0 && selectableOrders.every((o) => isSelected(o.id));
    if (allSelected) {
      clearSelection();
    } else {
      selectAllOnPage();
    }
  };

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;
  const tableColSpan = isGlobalSearch ? 11 : 10;

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
          <SmallButton
            onClick={applyFilters}
            disabled={loading || busy}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Apply filters
          </SmallButton>
        </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[140px]">
            Age
            <select
              value={ageBucket}
              onChange={(e) => setAgeBucket(e.target.value as WodIvcsAgeBucket)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
            >
              <option value="all">All ages</option>
              <option value="0_1">0–1 days</option>
              <option value="2_4">2–4 days</option>
              <option value="5_plus">5+ days / urgent</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[180px] flex-1 max-w-xs">
            Report presence
            <select
              value={reportPresence}
              onChange={(e) => setReportPresence(e.target.value as ReportPresenceUi)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
            >
              <option value="">All orders</option>
              <option value="on_netsuite">On NetSuite</option>
              <option value="on_aging">On Aging</option>
              <option value="both">On both reports</option>
              <option value="netsuite_only">NetSuite only</option>
              <option value="aging_only">Aging only</option>
              <option value="dropped_netsuite">Dropped from NetSuite</option>
              <option value="dropped_aging">Dropped from Aging</option>
              <option value="unknown_netsuite">Unknown NetSuite</option>
              <option value="unknown_aging">Unknown Aging</option>
            </select>
          </label>

          {queue !== "NEEDS_ACTION" && (
            <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[160px] max-w-xs">
              Assigned agent
              <select
                value={assignedAgentFilter}
                onChange={(e) => setAssignedAgentFilter(e.target.value)}
                disabled={agentsLoading}
                className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
              >
                <option value="">All agents</option>
                <option value="__unassigned__">Unassigned only</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.email}
                    {a.isLive === false ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/70 pb-2 shrink-0">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
              className="accent-sky-500"
            />
            Unassigned only
          </label>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[140px]">
            Date from
            <input
              type="date"
              value={orderDateFrom}
              onChange={(e) => setOrderDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[140px]">
            Date to
            <input
              type="date"
              value={orderDateTo}
              onChange={(e) => setOrderDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm [color-scheme:dark]"
            />
          </label>
          <p className="text-xs text-white/40 pb-2 max-w-md">
            Filters by NetSuite report order date. Combine with Apply filters after changing search
            text.
          </p>
        </div>
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
                {(!config.readOnly || isGlobalSearch) && selectableOrders.length > 0 && (
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={
                      selectableOrders.length > 0 &&
                      selectableOrders.every((o) => isSelected(o.id))
                    }
                    onChange={toggleSelectAllPage}
                    disabled={busy}
                    aria-label="Select all on page"
                  />
                )}
              </th>
              {isGlobalSearch && (
                <SortableTh
                  label="Queue"
                  field="operationalQueue"
                  sort={sort}
                  onSort={handleSort}
                />
              )}
              <SortableTh label="Document #" field="documentNumber" sort={sort} onSort={handleSort} />
              <SortableTh label="Customer" field="customerName" sort={sort} onSort={handleSort} />
              <th className="px-3 py-2 text-white/60 font-medium">Brand</th>
              <SortableTh label="NS" field="presenceNetSuite" sort={sort} onSort={handleSort} />
              <SortableTh label="Aging" field="presenceAging" sort={sort} onSort={handleSort} />
              <SortableTh label="Age" field="netSuiteDaysOld" sort={sort} onSort={handleSort} />
              <SortableTh label="Assignee" field="assignedToName" sort={sort} onSort={handleSort} />
              <SortableTh label="Updated" field="updatedAt" sort={sort} onSort={handleSort} />
              <th className="px-3 py-2 text-white/60 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-8 text-center text-white/50">
                  Loading orders…
                </td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={tableColSpan} className="px-3 py-8 text-center text-white/50">
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
                        onClick={(e) =>
                          toggleSelection(order.id, selectableIndexById.get(order.id)!, e)
                        }
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
                  <td className="px-3 py-2 whitespace-nowrap">
                    <PresenceBadge label="NS" state={order.presenceNetSuite} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
        <span>
          Showing {pageStart}–{pageEnd} of {total}
          {total > PAGE_SIZE ? ` · Page ${page} of ${totalPages}` : ""}
        </span>
        <div className="flex gap-2">
          <SmallButton
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || busy || !canGoPrev}
            className="bg-white/10 hover:bg-white/20"
          >
            Previous
          </SmallButton>
          <SmallButton
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || busy || !canGoNext}
            className="bg-white/10 hover:bg-white/20"
          >
            Next
          </SmallButton>
        </div>
      </div>

      {detailId && (
        <WodIvcsManagerOrderDetailModal
          orderId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </Card>
  );
}
