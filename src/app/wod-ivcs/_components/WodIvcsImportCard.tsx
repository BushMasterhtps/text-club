"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import { parseFetchJsonSafely } from "@/lib/safe-fetch-json";
import type { WodIvcsImportDryRunData } from "./wod-ivcs-import-types";

type ImportReevaluationSummary = {
  dropOffConfirmed?: number;
  movedToCompleted?: number;
  movedToArchived?: number;
  movedToNeedsReview?: number;
  noAutomaticChange?: number;
};

type ImportSummary = {
  totalRows?: number;
  parsedRows?: number;
  createdOrders?: number;
  updatedOrders?: number;
  skippedRows?: number;
  errorRows?: number;
  reevaluation?: ImportReevaluationSummary;
};

type Props = {
  title: string;
  sourceReportType: "NETSUITE_REPORT" | "AGING_REPORT";
  importPath: string;
  onDone: () => void;
};

const IMPORT_CLIENT_TIMEOUT_MS = 30 * 60 * 1000;
const IMPORT_LARGE_REPORT_MS = 60 * 1000;
const IMPORT_STILL_PROCESSING_MS = 2 * 60 * 1000;

function formatElapsedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function importRunningHints(elapsedMs: number): string[] {
  const hints: string[] = [];
  if (elapsedMs >= IMPORT_STILL_PROCESSING_MS) {
    hints.push("Still processing. This is normal for large reports.");
  } else if (elapsedMs >= IMPORT_LARGE_REPORT_MS) {
    hints.push("Large reports can take a few minutes.");
  }
  return hints;
}

function ImportRunningProgressPanel({ elapsedMs }: { elapsedMs: number }) {
  const hints = importRunningHints(elapsedMs);

  return (
    <div
      className="rounded-lg border border-sky-500/30 bg-sky-950/40 p-4 space-y-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-sky-100">Import in progress</p>
        <p className="text-sm text-sky-200/90 tabular-nums">Elapsed: {formatElapsedDuration(elapsedMs)}</p>
      </div>

      <p className="text-sm text-white/85 leading-relaxed">
        Import is still running. Please do not refresh or re-import this file.
      </p>

      {hints.map((hint) => (
        <p key={hint} className="text-sm text-amber-200/90">
          {hint}
        </p>
      ))}

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuetext="Import in progress"
      >
        <div className="h-full w-1/4 rounded-full bg-sky-500 wod-ivcs-import-progress-indeterminate" />
      </div>

      <style jsx>{`
        @keyframes wodIvcsImportIndeterminate {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(500%);
          }
        }
        .wod-ivcs-import-progress-indeterminate {
          animation: wodIvcsImportIndeterminate 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

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

  const reeval = summary.reevaluation;
  if (reeval && (reeval.dropOffConfirmed ?? 0) > 0) {
    const reevalParts: string[] = [];
    const confirmed = reeval.dropOffConfirmed ?? 0;
    reevalParts.push(`${confirmed} drop-off confirmed`);
    const completed = reeval.movedToCompleted ?? 0;
    const archived = reeval.movedToArchived ?? 0;
    const needsReview = reeval.movedToNeedsReview ?? 0;
    if (completed > 0) reevalParts.push(`${completed} completed`);
    if (archived > 0) reevalParts.push(`${archived} archived`);
    if (needsReview > 0) reevalParts.push(`${needsReview} needs review`);
    if ((reeval.noAutomaticChange ?? 0) > 0) {
      reevalParts.push(`${reeval.noAutomaticChange} unchanged (no auto change)`);
    }
    parts.push(`Drop-off reevaluation: ${reevalParts.join(" · ")}`);
  }

  return parts.join(" · ");
}

function parseImportApiResponse(parsed: {
  ok: boolean;
  status: number;
  data: unknown | null;
}): { success: boolean; error?: string; summary?: ImportSummary } {
  if (parsed.data === null || typeof parsed.data !== "object") {
    return {
      success: false,
      error: parsed.ok
        ? "Import finished but the response was empty or invalid. Check Import & Diagnostics."
        : `Import failed (HTTP ${parsed.status}). Check Import & Diagnostics.`,
    };
  }
  const data = parsed.data as {
    success?: boolean;
    error?: string;
    summary?: ImportSummary;
  };
  if (!data.success) {
    return { success: false, error: data.error || "Import failed" };
  }
  return { success: true, summary: data.summary };
}

export function WodIvcsImportCard({ title, sourceReportType, importPath, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "import" | null>(null);
  const [dryRun, setDryRun] = useState<WodIvcsImportDryRunData | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [importMsgTone, setImportMsgTone] = useState<"success" | "error" | "warning">("success");
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null);
  const [importElapsedMs, setImportElapsedMs] = useState(0);
  const mountedRef = useRef(true);
  const importRunIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearBusy = useCallback(() => {
    setBusy(null);
    setImportStartedAt(null);
    setImportElapsedMs(0);
  }, []);

  useEffect(() => {
    if (busy !== "import" || importStartedAt === null) {
      setImportElapsedMs(0);
      return;
    }

    const tick = () => setImportElapsedMs(Date.now() - importStartedAt);
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [busy, importStartedAt]);

  const refreshAfterImport = useCallback(() => {
    try {
      onDone();
    } catch {
      if (mountedRef.current) {
        setImportMsgTone("warning");
        setImportMsg((prev) =>
          prev
            ? `${prev} Queue refresh failed — use Refresh on the board.`
            : "Import finished, but queue refresh failed — use Refresh on the board."
        );
      }
    }
  }, [onDone]);

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
      clearBusy();
    }
  };

  const runImport = async () => {
    if (!file || busy !== null) return;

    const runId = ++importRunIdRef.current;
    setBusy("import");
    setImportStartedAt(Date.now());
    setImportElapsedMs(0);
    setImportMsg("");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), IMPORT_CLIENT_TIMEOUT_MS);

    let successMessage: string | null = null;

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(importPath, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const parsed = await parseFetchJsonSafely(res);
      const outcome = parseImportApiResponse(parsed);

      if (!outcome.success) {
        throw new Error(outcome.error || "Import failed");
      }

      successMessage = formatImportResultMessage(outcome.summary ?? {});
    } catch (e) {
      if (importRunIdRef.current !== runId) return;

      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Import timed out on the client. Check Import & Diagnostics — the server may still have finished."
          : e instanceof Error
            ? e.message
            : "Import failed";

      if (mountedRef.current) {
        setImportMsgTone("error");
        setImportMsg(msg);
      }
      return;
    } finally {
      window.clearTimeout(timeoutId);
      if (importRunIdRef.current === runId) {
        clearBusy();
      }
    }

    if (importRunIdRef.current !== runId) return;

    if (mountedRef.current) {
      setImportMsgTone("success");
      setImportMsg(successMessage ?? "Import complete.");
    }

    window.setTimeout(() => {
      if (importRunIdRef.current === runId) {
        refreshAfterImport();
      }
    }, 0);
  };

  const msgColorClass =
    importMsgTone === "success"
      ? "text-green-300/90"
      : importMsgTone === "warning"
        ? "text-amber-300/90"
        : "text-red-300";

  return (
    <Card className="p-4 space-y-3">
      <h4 className="font-semibold text-white">{title}</h4>
      <input
        type="file"
        accept=".csv"
        disabled={busy !== null}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setDryRun(null);
          setImportMsg("");
        }}
        className="w-full text-sm text-white/80 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-sky-600 file:text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
      {busy === "import" && importStartedAt !== null && (
        <ImportRunningProgressPanel elapsedMs={importElapsedMs} />
      )}
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
      {importMsg && <p className={`text-sm ${msgColorClass}`}>{importMsg}</p>}
    </Card>
  );
}
