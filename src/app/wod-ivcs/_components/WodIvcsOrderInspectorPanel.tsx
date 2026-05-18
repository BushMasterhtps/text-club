"use client";

import { useCallback, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import {
  ageLabel,
  ageTone,
  formatRelativeTime,
  queueLabelForKey,
  type WodIvcsOrderListItem,
} from "./wod-ivcs-queue-config";
import { PresenceBadge } from "./WodIvcsQueueUiBits";
import { WodIvcsOrderInspectorModal } from "./WodIvcsOrderInspectorModal";

export function WodIvcsOrderInspectorPanel() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orders, setOrders] = useState<WodIvcsOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setMessage("Enter a document number, customer name, or email to search.");
      setOrders([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        q: trimmed,
        take: "100",
        sortBy: "updatedAt",
        sortDir: "desc",
        includeCityBeauty: "true",
      });
      const res = await fetch(`/api/manager/wod-ivcs/v2/orders?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Search failed");
      }
      setOrders(json.orders);
      setTotal(json.total);
      if (json.orders.length === 0) {
        setMessage("No orders matched your search.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Search failed");
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const submitSearch = () => {
    setSearchQuery(searchInput.trim());
    runSearch(searchInput);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setOrders([]);
    setTotal(0);
    setMessage(null);
  };

  return (
    <>
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Order inspector</h3>
          <p className="text-sm text-white/50 mt-1">
            Search any order across all queues, including Completed and Archived. Read-only — use
            Task Management to assign or move orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-white/60 flex-1 min-w-[220px]">
            Search
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              placeholder="Document #, customer, email…"
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm placeholder:text-white/30"
            />
          </label>
          <SmallButton
            onClick={submitSearch}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Searching…" : "Search"}
          </SmallButton>
          {(searchQuery || orders.length > 0) && (
            <SmallButton onClick={clearSearch} className="bg-white/10 hover:bg-white/20">
              Clear
            </SmallButton>
          )}
        </div>

        {message && (
          <p className={`text-sm ${orders.length > 0 ? "text-white/60" : "text-amber-200/90"}`}>
            {message}
          </p>
        )}
        {searchQuery && orders.length > 0 && (
          <p className="text-xs text-white/50">
            Showing {orders.length} of {total} match{total === 1 ? "" : "es"} for “{searchQuery}”
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-white/60 text-left">
              <tr>
                <th className="px-3 py-2">Document #</th>
                <th className="px-3 py-2">Queue</th>
                <th className="px-3 py-2">Reports</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-white/50">
                    Searching…
                  </td>
                </tr>
              )}
              {!loading && searchQuery && orders.length === 0 && !message && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-white/50">
                    No matching orders.
                  </td>
                </tr>
              )}
              {!loading &&
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 font-mono text-white">{order.documentNumber}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white/80">
                        {queueLabelForKey(order.operationalQueue)}
                      </span>
                    </td>
                    <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                      <PresenceBadge label="NS" state={order.presenceNetSuite} />
                      <PresenceBadge label="AG" state={order.presenceAging} />
                    </td>
                    <td className="px-3 py-2 text-white/70">
                      {order.isCityBeauty ? "City Beauty" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${ageTone(order)}`}
                      >
                        {ageLabel(order)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/50 text-xs">
                      {formatRelativeTime(order.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <SmallButton
                        onClick={() => setInspectId(order.id)}
                        className="bg-white/10 hover:bg-white/20 text-xs"
                      >
                        Inspect
                      </SmallButton>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {inspectId && (
        <WodIvcsOrderInspectorModal orderId={inspectId} onClose={() => setInspectId(null)} />
      )}
    </>
  );
}
