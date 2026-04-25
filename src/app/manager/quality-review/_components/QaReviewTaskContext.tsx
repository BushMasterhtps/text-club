"use client";

import React, { useMemo, useState } from "react";
import { buildOrderedMetadataRows } from "@/lib/quality-review-task-display";
import { formatCompletedAt, formatDispositionDisplay } from "./qa-review-formatters";

type Props = {
  taskId: string;
  task: Record<string, unknown>;
  /** `plain`: no outer card (embed inside an existing panel). `card`: default standalone styling. */
  variant?: "card" | "plain";
};

export function QaReviewTaskContext({ taskId, task, variant = "card" }: Props) {
  const [taskMoreFieldsOpen, setTaskMoreFieldsOpen] = useState(false);
  const [taskPrimaryTextExpanded, setTaskPrimaryTextExpanded] = useState(false);

  const taskHeaderSkipKeys = useMemo(() => {
    const s = new Set<string>();
    for (const k of ["brand", "status", "phone", "email"] as const) {
      const v = task[k];
      if (v != null && String(v).trim() !== "") s.add(k);
    }
    return s;
  }, [task]);

  const taskMetadataRows = useMemo(
    () => buildOrderedMetadataRows(task, taskHeaderSkipKeys),
    [task, taskHeaderSkipKeys]
  );

  const shell =
    variant === "plain"
      ? "space-y-6"
      : "rounded-2xl border border-white/12 bg-neutral-950/60 p-6 md:p-7 space-y-6 ring-1 ring-white/5";

  return (
    <div className={shell}>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-white/45 mb-3">Task context</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/80 border-b border-white/10 pb-5">
          <div>
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
              Task id
            </div>
            <div className="font-mono text-xs text-violet-200/90 break-all">{taskId}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
              Completed
            </div>
            <div className="tabular-nums">
              {task.endTime ? formatCompletedAt(String(task.endTime)) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">Type</div>
            <div>{String(task.taskType)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">
              Disposition
            </div>
            <div>{formatDispositionDisplay(task.disposition as string | null)}</div>
          </div>
          {task.brand != null && String(task.brand).trim() !== "" && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">Brand</div>
              <div>{String(task.brand)}</div>
            </div>
          )}
          {task.status != null && String(task.status).trim() !== "" && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">Status</div>
              <div className="font-mono text-xs">{String(task.status)}</div>
            </div>
          )}
          {task.phone != null && String(task.phone).trim() !== "" && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">Phone</div>
              <div>{String(task.phone)}</div>
            </div>
          )}
          {task.email != null && String(task.email).trim() !== "" && (
            <div>
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide mb-1">Email</div>
              <div className="break-all">{String(task.email)}</div>
            </div>
          )}
        </div>

        {(() => {
          const assigned = task.assignedTo as
            | { name?: string | null; email?: string | null }
            | null
            | undefined;
          const completedBy = task.completedByUser as
            | { name?: string | null; email?: string | null }
            | null
            | undefined;
          if (!assigned && !completedBy) return null;
          return (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">People</div>
              {assigned ? (
                <div className="text-sm text-white/80">
                  <span className="text-white/45">Assigned to: </span>
                  {assigned.name || assigned.email || "—"}
                  {assigned.email && assigned.name ? (
                    <span className="text-white/50"> ({assigned.email})</span>
                  ) : null}
                </div>
              ) : null}
              {completedBy ? (
                <div className="text-sm text-white/80">
                  <span className="text-white/45">Completed by: </span>
                  {completedBy.name || completedBy.email || "—"}
                  {completedBy.email && completedBy.name ? (
                    <span className="text-white/50"> ({completedBy.email})</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })()}

        {(() => {
          const raw = task.rawMessage as Record<string, unknown> | null | undefined;
          if (!raw || typeof raw !== "object") return null;
          const bits = ["brand", "phone", "email", "text"] as const;
          const hasAny = bits.some((k) => {
            const v = raw[k];
            return v != null && String(v).trim() !== "";
          });
          if (!hasAny) return null;
          return (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/40">
                Source message
              </div>
              <dl className="grid gap-2 text-sm text-white/80">
                {raw.brand != null && String(raw.brand).trim() !== "" ? (
                  <div className="flex gap-2">
                    <dt className="text-white/45 w-24 shrink-0">Brand</dt>
                    <dd className="min-w-0">{String(raw.brand)}</dd>
                  </div>
                ) : null}
                {raw.phone != null && String(raw.phone).trim() !== "" ? (
                  <div className="flex gap-2">
                    <dt className="text-white/45 w-24 shrink-0">Phone</dt>
                    <dd className="min-w-0">{String(raw.phone)}</dd>
                  </div>
                ) : null}
                {raw.email != null && String(raw.email).trim() !== "" ? (
                  <div className="flex gap-2">
                    <dt className="text-white/45 w-24 shrink-0">Email</dt>
                    <dd className="min-w-0 break-all">{String(raw.email)}</dd>
                  </div>
                ) : null}
                {raw.text != null && String(raw.text).trim() !== "" ? (
                  <div className="pt-1">
                    <dt className="text-white/45 text-xs mb-1">Raw message text</dt>
                    <dd className="text-xs text-white/70 whitespace-pre-wrap max-h-40 overflow-y-auto rounded-lg bg-black/30 p-2 border border-white/5">
                      {String(raw.text)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          );
        })()}
      </div>

      {(() => {
        const taskText = String(task.text ?? "").trim();
        const raw = task.rawMessage as Record<string, unknown> | null | undefined;
        const rawText =
          raw && typeof raw === "object" && raw.text != null ? String(raw.text).trim() : "";
        const body = taskText || rawText;
        if (!body) {
          return (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
              No primary task text on this record. Check full task details below if fields exist on
              other columns.
            </div>
          );
        }
        const label = taskText ? "Primary task text" : "Source message text (task.text empty)";
        return (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-[11px] font-medium text-white/40 uppercase tracking-wide">{label}</div>
              <button
                type="button"
                onClick={() => setTaskPrimaryTextExpanded((e) => !e)}
                className="text-[11px] font-medium text-violet-300/90 hover:text-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded px-1"
              >
                {taskPrimaryTextExpanded ? "More compact" : "Expand text area"}
              </button>
            </div>
            <div
              className={`text-sm text-white/85 whitespace-pre-wrap rounded-xl bg-black/35 p-4 border border-white/8 leading-relaxed overflow-y-auto transition-[max-height] duration-200 ${
                taskPrimaryTextExpanded ? "max-h-[min(75vh,36rem)]" : "max-h-52"
              }`}
            >
              {body}
            </div>
          </div>
        );
      })()}

      {taskMetadataRows.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setTaskMoreFieldsOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-white/90 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500/40"
            aria-expanded={taskMoreFieldsOpen}
          >
            <span>
              Full task details
              <span className="text-white/40 font-normal ml-2">({taskMetadataRows.length} fields)</span>
            </span>
            <span className="text-white/45 text-xs shrink-0" aria-hidden>
              {taskMoreFieldsOpen ? "▲" : "▼"}
            </span>
          </button>
          {taskMoreFieldsOpen && (
            <div className="border-t border-white/10 px-4 py-3 max-h-[min(55vh,28rem)] overflow-y-auto">
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
                {taskMetadataRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-0.5 border-b border-white/5 pb-2 sm:border-0 sm:pb-0"
                  >
                    <dt className="text-[11px] text-white/45">{row.label}</dt>
                    <dd className="text-white/85 break-words">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
