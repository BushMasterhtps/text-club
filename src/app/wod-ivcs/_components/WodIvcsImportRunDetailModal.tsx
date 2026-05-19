"use client";

import { useCallback, useEffect, useState } from "react";
import { SmallButton } from "@/app/_components/SmallButton";
import type {
  ImportRunImpactSummary,
  ImportRunQueueSnapshot,
  ImportRunReevaluationSummary,
  ImportRunSummary,
} from "@/lib/wod-ivcs/types";
import type { WodIvcsImportRun, WodIvcsImportRunDetail } from "./wod-ivcs-import-types";

function formatSignedDelta(delta: number): string {
  if (delta > 0) return `(+${delta})`;
  if (delta < 0) return `(${delta})`;
  return "(no change)";
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950 p-3">
      <div className="text-white/50 text-xs uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-white text-lg mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function parseSummaryJson(raw: unknown): ImportRunSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.totalRows !== "number") return null;
  return raw as ImportRunSummary;
}

const QUEUE_ROWS: Array<{ key: keyof ImportRunQueueSnapshot; label: string }> = [
  { key: "needsAction", label: "Needs Action" },
  { key: "assigned", label: "Assigned" },
  { key: "inProgress", label: "In Progress" },
  { key: "awaitingDropOff", label: "Awaiting Drop-Off" },
  { key: "needsReview", label: "Needs Review" },
  { key: "itReview", label: "IT Review" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];

function QueueSnapshotTable({
  before,
  after,
}: {
  before: ImportRunQueueSnapshot;
  after: ImportRunQueueSnapshot;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.04] text-left text-white/50">
          <tr>
            <th className="px-3 py-2">Queue</th>
            <th className="px-3 py-2 text-right">Before</th>
            <th className="px-3 py-2 text-right">After</th>
            <th className="px-3 py-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-white/85">
          {QUEUE_ROWS.map(({ key, label }) => {
            const b = before[key];
            const a = after[key];
            const delta = a - b;
            return (
              <tr key={key} className={key === "needsAction" ? "bg-sky-950/30" : undefined}>
                <td className="px-3 py-2 font-medium">{label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">
                  {delta > 0 ? `+${delta}` : delta}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReevaluationSection({ reeval }: { reeval: ImportRunReevaluationSummary }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: "Awaiting Drop-Off checked", value: reeval.awaitingDropOffChecked },
    { label: "Drop-off confirmed", value: reeval.dropOffConfirmed },
    { label: "Moved to Completed", value: reeval.movedToCompleted },
    { label: "Moved to Archived (drop-off)", value: reeval.movedToArchived },
    { label: "Moved to Needs Review", value: reeval.movedToNeedsReview },
    { label: "No automatic change", value: reeval.noAutomaticChange },
    { label: "Needs Action checked", value: reeval.needsActionChecked },
    {
      label: "Dropped without action (archived)",
      value: reeval.movedNeedsActionToArchived || reeval.droppedWithoutAction,
    },
  ];

  const skipRows: Array<{ label: string; value: number }> = [];
  if (reeval.skippedCityBeauty > 0) {
    skipRows.push({ label: "Skipped (City Beauty, drop-off)", value: reeval.skippedCityBeauty });
  }
  if (reeval.skippedNeedsActionCityBeauty > 0) {
    skipRows.push({
      label: "Skipped (City Beauty, dropped without action)",
      value: reeval.skippedNeedsActionCityBeauty,
    });
  }
  if (reeval.skippedNeedsActionTouchedByAgent > 0) {
    skipRows.push({
      label: "Skipped (touched by agent)",
      value: reeval.skippedNeedsActionTouchedByAgent,
    });
  }
  if (reeval.skippedNeedsActionAssigned > 0) {
    skipRows.push({ label: "Skipped (assigned)", value: reeval.skippedNeedsActionAssigned });
  }
  if (reeval.skippedNeedsActionNotFullyDropped > 0) {
    skipRows.push({
      label: "Skipped (not fully dropped)",
      value: reeval.skippedNeedsActionNotFullyDropped,
    });
  }

  const visible = rows.filter((r) => r.value > 0);
  if (visible.length === 0 && skipRows.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold text-white/90">Queue reevaluation</h4>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-white/80">
        {visible.map((r) => (
          <li
            key={r.label}
            className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 flex justify-between gap-2"
          >
            <span>{r.label}</span>
            <span className="font-semibold text-white tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
      {skipRows.length > 0 && (
        <ul className="text-xs text-white/50 space-y-1">
          {skipRows.map((r) => (
            <li key={r.label}>
              {r.label}: {r.value}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Props = {
  run: WodIvcsImportRun;
  onClose: () => void;
};

export function WodIvcsImportRunDetailModal({ run, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<WodIvcsImportRunDetail | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/manager/wod-ivcs/v2/import/runs/${run.id}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load import details");
      }
      setDetail({
        run: data.run,
        rowStats: data.rowStats ?? [],
        errorSamples: data.errorSamples ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load import details");
    } finally {
      setLoading(false);
    }
  }, [run.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const summary = parseSummaryJson(detail?.run.summaryJson);
  const impact: ImportRunImpactSummary | undefined = summary?.impact;
  const reeval = summary?.reevaluation;

  const sourceLabel =
    run.sourceReportType === "NETSUITE_REPORT" ? "NetSuite" : "Aging";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wod-ivcs-import-detail-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-neutral-900 px-6 py-4">
          <div>
            <h3 id="wod-ivcs-import-detail-title" className="text-lg font-semibold text-white">
              Import impact summary
            </h3>
            <p className="text-sm text-white/60 mt-1">
              {run.fileName} · {sourceLabel}
            </p>
            <p className="text-xs text-white/45 mt-1">
              {new Date(run.createdAt).toLocaleString()}
              {detail?.run.importedBy?.name
                ? ` · Imported by ${detail.run.importedBy.name}`
                : ""}
            </p>
          </div>
          <SmallButton onClick={onClose}>Close</SmallButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-white">
          {loading && <p className="text-sm text-white/70">Loading import details…</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}

          {!loading && !error && summary && (
            <>
              {impact?.narrative ? (
                <p className="text-sm text-white/85 leading-relaxed rounded-lg border border-white/10 bg-neutral-950 p-4">
                  {impact.narrative}
                </p>
              ) : (
                <p className="text-sm text-amber-200/90 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3">
                  Impact summary was not captured for this older import.
                </p>
              )}

              {impact?.queueSnapshots && (
                <section className="rounded-lg border border-sky-500/30 bg-sky-950/30 p-4">
                  <h4 className="text-sm font-semibold text-sky-100 mb-2">Needs Action</h4>
                  <p className="text-xl font-semibold text-white tabular-nums">
                    {impact.queueSnapshots.before.needsAction} →{" "}
                    {impact.queueSnapshots.after.needsAction}{" "}
                    <span className="text-base font-medium text-sky-200/90">
                      {formatSignedDelta(impact.needsActionDelta)}
                    </span>
                  </p>
                  <p className="text-xs text-white/50 mt-2">
                    Counts exclude City Beauty orders (Task Management rules).
                  </p>
                </section>
              )}

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-white/90">File metrics</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <MetricCard label="CSV rows" value={summary.totalRows} />
                  <MetricCard label="Unique orders" value={summary.parsedRows} />
                  <MetricCard label="Created" value={summary.createdOrders} />
                  <MetricCard label="Updated" value={summary.updatedOrders} />
                  {summary.skippedRows > 0 && (
                    <MetricCard label="Rows merged" value={summary.skippedRows} />
                  )}
                  {summary.errorRows > 0 && (
                    <MetricCard label="Row errors" value={summary.errorRows} />
                  )}
                  {summary.droppedOrders > 0 && (
                    <MetricCard label="Marked dropped" value={summary.droppedOrders} />
                  )}
                </div>
              </section>

              {impact &&
                (impact.cityBeautyRowsInFile > 0 ||
                  (impact.fivePlusRowsInFile != null && impact.fivePlusRowsInFile > 0)) && (
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-white/90">Brand & aging flags</h4>
                    <ul className="text-sm text-white/80 space-y-1">
                      {impact.cityBeautyRowsInFile > 0 && (
                        <li>
                          City Beauty orders in file:{" "}
                          <span className="font-semibold text-white">
                            {impact.cityBeautyRowsInFile}
                          </span>{" "}
                          (excluded from active Task Management queues)
                        </li>
                      )}
                      {impact.fivePlusRowsInFile != null && impact.fivePlusRowsInFile > 0 && (
                        <li>
                          5+ day Aging orders:{" "}
                          <span className="font-semibold text-white">
                            {impact.fivePlusRowsInFile}
                          </span>
                        </li>
                      )}
                    </ul>
                  </section>
                )}

              {reeval && <ReevaluationSection reeval={reeval} />}

              {impact?.queueSnapshots && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-white/90">Queue snapshots</h4>
                  <p className="text-xs text-white/50">
                    Stored at import time (before and after). Not live counts.
                  </p>
                  <QueueSnapshotTable
                    before={impact.queueSnapshots.before}
                    after={impact.queueSnapshots.after}
                  />
                </section>
              )}

              {detail && detail.errorSamples.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-white/90">Sample row errors</h4>
                  <ul className="max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-neutral-950 p-3 text-xs text-red-200/90 space-y-1">
                    {detail.errorSamples.map((e) => (
                      <li key={e.rowNumber}>
                        Row {e.rowNumber}: {e.errorMessage}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {!loading && !error && !summary && (
            <p className="text-sm text-white/60">No summary data available for this import run.</p>
          )}
        </div>
      </div>
    </div>
  );
}
