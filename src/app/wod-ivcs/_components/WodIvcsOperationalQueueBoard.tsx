"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type { WodIvcsQueuesSummary } from "@/lib/wod-ivcs/queues-summary-service";
import {
  OPERATIONAL_QUEUE_CARD_CONFIG,
  type WodIvcsOperationalQueueKey,
} from "./wod-ivcs-queue-config";

type Props = {
  selectedQueue: WodIvcsOperationalQueueKey | null;
  onSelectQueue: (queue: WodIvcsOperationalQueueKey) => void;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  onGlobalSearchSubmit: () => void;
  onGlobalSearchClear: () => void;
  refreshKey?: number;
};

function sublabelForQueue(key: WodIvcsOperationalQueueKey, summary: WodIvcsQueuesSummary): string | null {
  if (key === "NEEDS_ACTION" && summary.unassignedNeedsAction > 0) {
    return `${summary.unassignedNeedsAction} unassigned`;
  }
  return null;
}

export function WodIvcsOperationalQueueBoard({
  selectedQueue,
  onSelectQueue,
  globalSearch,
  onGlobalSearchChange,
  onGlobalSearchSubmit,
  onGlobalSearchClear,
  refreshKey = 0,
}: Props) {
  const [summary, setSummary] = useState<WodIvcsQueuesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const searchActive = globalSearch.trim().length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/manager/wod-ivcs/v2/queues/summary", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load queue summary");
      }
      setSummary(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!selectedQueue && summary) {
      onSelectQueue("NEEDS_ACTION");
    }
  }, [selectedQueue, summary, onSelectQueue]);

  const handleQueueClick = (key: WodIvcsOperationalQueueKey) => {
    onGlobalSearchClear();
    onSelectQueue(key);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Operational Queue Board</h3>
          <p className="text-sm text-white/50 mt-0.5">
            Active work queues only — completed and archived history will live in Analytics
          </p>
        </div>
        <SmallButton onClick={load} disabled={loading} className="bg-white/10 hover:bg-white/20">
          {loading ? "Refreshing…" : "Refresh counts"}
        </SmallButton>
      </div>

      <div className="p-3 rounded-lg bg-white/[0.04] border border-white/10 space-y-2">
        <label className="flex flex-col gap-1 text-xs text-white/60">
          Find an order across active queues
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={globalSearch}
              onChange={(e) => onGlobalSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onGlobalSearchSubmit();
              }}
              placeholder="Search order across all queues…"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm placeholder:text-white/30"
            />
            <SmallButton
              onClick={onGlobalSearchSubmit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Search
            </SmallButton>
            {searchActive && (
              <SmallButton
                onClick={onGlobalSearchClear}
                className="bg-white/10 hover:bg-white/20"
              >
                Clear search
              </SmallButton>
            )}
          </div>
        </label>
        {searchActive && (
          <p className="text-xs text-sky-200/80">
            Showing search results across active queues. Clear search to return to the selected
            queue.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
        {OPERATIONAL_QUEUE_CARD_CONFIG.map((card) => {
          const count = summary?.queueCounts[card.key] ?? 0;
          const isSelected = !searchActive && selectedQueue === card.key;
          const sub = summary ? sublabelForQueue(card.key, summary) : null;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => handleQueueClick(card.key)}
              className={`text-left p-4 rounded-xl border transition-all ${card.cardClass} ${
                isSelected ? `ring-2 ${card.ringClass} scale-[1.02]` : ""
              } ${searchActive ? "opacity-75 hover:opacity-100" : ""}`}
            >
              <div className="text-2xl font-bold text-white">{loading ? "…" : count}</div>
              <div className="text-sm font-medium text-white/90 mt-1">{card.label}</div>
              <p className="text-xs text-white/50 mt-1 leading-snug">{card.description}</p>
              {sub && (
                <p className="text-xs text-amber-200/90 mt-2 font-medium">{sub}</p>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
