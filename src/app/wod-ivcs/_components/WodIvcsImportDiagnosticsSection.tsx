"use client";

import { WodIvcsImportHistoryPanel } from "./WodIvcsImportHistoryPanel";
import { WodIvcsOrderInspectorPanel } from "./WodIvcsOrderInspectorPanel";

export function WodIvcsImportDiagnosticsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import & Diagnostics</h2>
        <p className="text-sm text-white/50 mt-1">
          Review import runs, reverse a specific file, and inspect orders across all queues
        </p>
      </div>

      <WodIvcsImportHistoryPanel />
      <WodIvcsOrderInspectorPanel />
    </div>
  );
}
