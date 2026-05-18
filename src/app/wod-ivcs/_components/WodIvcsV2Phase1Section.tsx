"use client";

import { useCallback, useState } from "react";
import { Card } from "@/app/_components/Card";
import { WodIvcsImportCard } from "./WodIvcsImportCard";
import { WodIvcsOperationalQueueBoard } from "./WodIvcsOperationalQueueBoard";
import { WodIvcsQueueDetailPanel } from "./WodIvcsQueueDetailPanel";
import type { WodIvcsOperationalQueueKey } from "./wod-ivcs-queue-config";

export function WodIvcsV2Phase1Section() {
  const [selectedQueue, setSelectedQueue] = useState<WodIvcsOperationalQueueKey | null>(
    "NEEDS_ACTION"
  );
  const [globalSearchInput, setGlobalSearchInput] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  const submitGlobalSearch = () => {
    const q = globalSearchInput.trim();
    setGlobalSearchQuery(q);
    setSearchNonce((n) => n + 1);
  };

  const clearGlobalSearch = () => {
    setGlobalSearchInput("");
    setGlobalSearchQuery("");
    setSearchNonce((n) => n + 1);
  };

  const refreshQueues = useCallback(() => {
    setQueueRefreshKey((k) => k + 1);
  }, []);

  const onImportDone = useCallback(() => {
    refreshQueues();
  }, [refreshQueues]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Task Management</h2>
        <p className="text-sm text-white/50 mt-1">
          Import today&apos;s reports, then work operational queues and assign orders
        </p>
      </div>

      <Card className="p-4 bg-sky-500/10 border border-sky-500/30">
        <p className="text-sm text-sky-200">
          Import NetSuite and Aging reports below, then use the queue board to assign and move
          orders. Import history, reversal, and deep order inspection are in{" "}
          <span className="font-medium text-sky-100">Import & Diagnostics</span>.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WodIvcsImportCard
          title="NetSuite Report"
          sourceReportType="NETSUITE_REPORT"
          importPath="/api/manager/wod-ivcs/v2/import/netsuite"
          onDone={onImportDone}
        />
        <WodIvcsImportCard
          title="Aging Report"
          sourceReportType="AGING_REPORT"
          importPath="/api/manager/wod-ivcs/v2/import/aging"
          onDone={onImportDone}
        />
      </div>

      <WodIvcsOperationalQueueBoard
        selectedQueue={selectedQueue}
        onSelectQueue={setSelectedQueue}
        globalSearch={globalSearchInput}
        onGlobalSearchChange={setGlobalSearchInput}
        onGlobalSearchSubmit={submitGlobalSearch}
        onGlobalSearchClear={clearGlobalSearch}
        refreshKey={queueRefreshKey}
      />

      {selectedQueue && (
        <WodIvcsQueueDetailPanel
          queue={selectedQueue}
          globalSearchQuery={globalSearchQuery}
          searchNonce={searchNonce}
          onMutated={refreshQueues}
        />
      )}
    </div>
  );
}
