"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { parseFetchJsonSafely } from "@/lib/safe-fetch-json";
import type { WodIvcsImportDryRunData } from "./wod-ivcs-import-types";

type ImportSummary = {
  totalRows?: number;
  parsedRows?: number;
  createdOrders?: number;
  updatedOrders?: number;
  skippedRows?: number;
  errorRows?: number;
};

type Props = {
  title: string;
  sourceReportType: "NETSUITE_REPORT" | "AGING_REPORT";
  importPath: string;
  onDone: () => void;
};

function formatImportResultMessage(summary: ImportSummary): string {
  const totalRows = summary.totalRows ?? 0;
  const uniqueOrders = summary.parsedRows ?? 0;
  const created = summary.createdOrders ?? 0;
  const updated = summary.updatedOrders ?? 0;
  const merged = summary.skippedRows ?? 0;
  const errors = summary.errorRows ?? 0;

  const parts = [
    "Import complete.",
    `${totalRows} row${totalRows === 1 ? "" : "s"} parsed`,
    `${uniqueOrders} unique order${uniqueOrders === 1 ? "" : "s"} processed`,
    `${created} created`,
    `${updated} updated`,
  ];
  if (merged > 0) {
    parts.push(`${merged} duplicate row${merged === 1 ? "" : "s"} merged into existing orders`);
  }
  if (errors > 0) {
    parts.push(`${errors} row error${errors === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export function WodIvcsImportCard({ title, sourceReportType, importPath, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "import" | null>(null);
  const [dryRun, setDryRun] = useState<WodIvcsImportDryRunData | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [importMsgTone, setImportMsgTone] = useState<"success" | "error">("success");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      const parsed = await parseFetchJsonSafely(res);
      const data = parsed.data as { success?: boolean; error?: string; data?: WodIvcsImportDryRunData };
      if (!res.ok || !data.success) throw new Error(data.error || "Dry-run failed");
      if (mountedRef.current) setDryRun(data.data ?? null);
    } catch (e) {
      if (mountedRef.current) {
        setImportMsgTone("error");
        setImportMsg(e instanceof Error ? e.message : "Dry-run failed");
      }
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  };

  const runImport = async () => {
    if (!file || busy !== null) return;
    setBusy("import");
    setImportMsg("");
    let succeeded = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30 * 60 * 1000);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(importPath, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const parsed = await parseFetchJsonSafely(res);
      const data = parsed.data as {
        success?: boolean;
        error?: string;
        summary?: ImportSummary;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Import failed");
      }

      const summary = data.summary ?? {};
      succeeded = true;
      if (mountedRef.current) {
        setImportMsgTone("success");
        setImportMsg(formatImportResultMessage(summary));
      }
    } catch (e) {
      if (mountedRef.current) {
        setImportMsgTone("error");
        const msg =
          e instanceof Error && e.name === "AbortError"
            ? "Import timed out on the client. Check Import & Diagnostics — the server may still have finished."
            : e instanceof Error
              ? e.message
              : "Import failed";
        setImportMsg(msg);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (mountedRef.current) setBusy(null);
      if (succeeded) {
        try {
          onDone();
        } catch {
          /* parent refresh must not block import UI reset */
        }
      }
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
        <SmallButton onClick={() => void runDryRun()} disabled={!file || busy !== null}>
          {busy === "dry" ? "Validating…" : "Dry-run"}
        </SmallButton>
        <SmallButton
          onClick={() => void runImport()}
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
      {importMsg && (
        <p
          className={`text-sm ${importMsgTone === "success" ? "text-green-300/90" : "text-red-300"}`}
        >
          {importMsg}
        </p>
      )}
    </Card>
  );
}
