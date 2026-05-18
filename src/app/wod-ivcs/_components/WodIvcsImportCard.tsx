"use client";

import { useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type { WodIvcsImportDryRunData } from "./wod-ivcs-import-types";

type Props = {
  title: string;
  sourceReportType: "NETSUITE_REPORT" | "AGING_REPORT";
  importPath: string;
  onDone: () => void;
};

export function WodIvcsImportCard({ title, sourceReportType, importPath, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "import" | null>(null);
  const [dryRun, setDryRun] = useState<WodIvcsImportDryRunData | null>(null);
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
          <div>
            Would create {dryRun.wouldCreateOrders}, update {dryRun.wouldUpdateOrders}
          </div>
          <div>
            City Beauty: {dryRun.cityBeautyCount}, 5+: {dryRun.fivePlusCount}
          </div>
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
