"use client";

import { useState } from "react";
import { SmallButton } from "@/app/_components/SmallButton";
import {
  MOVE_QUEUE_OPTIONS,
  queueConfig,
  type AssignableAgent,
  type OrderMutationSkip,
  type WodIvcsQueueKey,
} from "./wod-ivcs-queue-config";
import { InlineMessage } from "./WodIvcsQueueUiBits";
import {
  BULK_SKIPPED_LIST_MAX_VISIBLE,
  skippedOrderDisplayLabel,
  type SelectedOrderLabel,
} from "./wod-ivcs-bulk-mutation-messages";

const SHIFT_CLICK_TIP =
  "Tip: Shift-click checkboxes to select a range on the current page.";

const IN_PROGRESS_MOVE_DISABLED_COPY =
  "Move is disabled for In Progress work. Use Assign or Unassign to override active work.";

const SEARCH_MODE_SKIP_COPY =
  "Search results may include multiple queues. Some selected orders may be skipped depending on their current queue.";

type Props = {
  selectedCount: number;
  currentQueue: WodIvcsQueueKey;
  /** When true, results span multiple queues; bulk actions use operational rules. */
  searchMode?: boolean;
  /** Snapshot of row labels at mutation time (survives selection clear). */
  skippedOrderLabels: Map<string, SelectedOrderLabel>;
  agents: AssignableAgent[];
  agentsLoading: boolean;
  busy: boolean;
  message: { tone: "success" | "error" | "info"; text: string } | null;
  skipped: OrderMutationSkip[];
  onAssign: (agentId: string) => void;
  onUnassign: () => void;
  onMove: (targetQueue: WodIvcsQueueKey, agentId?: string) => void;
  onClear: () => void;
  onRefresh: () => void;
  onDismissFeedback?: () => void;
};

function BulkSkippedList({
  skipped,
  labelByOrderId,
}: {
  skipped: OrderMutationSkip[];
  labelByOrderId: Map<string, SelectedOrderLabel>;
}) {
  const visible = skipped.slice(0, BULK_SKIPPED_LIST_MAX_VISIBLE);
  const remaining = skipped.length - visible.length;

  return (
    <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 max-h-40 overflow-y-auto">
      <p className="font-medium mb-1.5">
        Skipped ({skipped.length})
      </p>
      <ul className="space-y-1.5">
        {visible.map((s) => (
          <li key={s.orderId} className="leading-snug">
            <span className="font-mono text-amber-100/95">{skippedOrderDisplayLabel(s, labelByOrderId)}</span>
            <span className="text-amber-200/75"> — {s.reason}</span>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="mt-2 text-amber-200/70">+ {remaining} more skipped</p>
      )}
    </div>
  );
}

export function WodIvcsBulkAssignBar({
  selectedCount,
  currentQueue,
  searchMode = false,
  skippedOrderLabels,
  agents,
  agentsLoading,
  busy,
  message,
  skipped,
  onAssign,
  onUnassign,
  onMove,
  onClear,
  onRefresh,
  onDismissFeedback,
}: Props) {
  const config = queueConfig(currentQueue);
  const hasFeedback = Boolean(message) || skipped.length > 0;
  const canAssign = searchMode ? true : config.assignable && !config.readOnly;
  const canMutate = searchMode ? true : !config.readOnly;
  const inProgressNote = !searchMode && currentQueue === "IN_PROGRESS";
  const hideUnassign = !searchMode && currentQueue === "NEEDS_ACTION";
  const disableMove = !searchMode && currentQueue === "IN_PROGRESS";
  const canUnassign = canMutate && !hideUnassign;
  const canMove = canMutate && !disableMove;

  return (
    <div className="space-y-3">
      {hasFeedback && (
        <div className="space-y-2">
          {message && (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <InlineMessage tone={message.tone}>{message.text}</InlineMessage>
              {onDismissFeedback && (
                <SmallButton
                  onClick={onDismissFeedback}
                  disabled={busy}
                  className="bg-white/10 hover:bg-white/20 shrink-0"
                >
                  Dismiss
                </SmallButton>
              )}
            </div>
          )}
          {skipped.length > 0 && (
            <BulkSkippedList skipped={skipped} labelByOrderId={skippedOrderLabels} />
          )}
        </div>
      )}

      <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
        {selectedCount > 0 ? (
          <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-semibold text-white">
                {selectedCount} order{selectedCount === 1 ? "" : "s"} selected
              </span>
              <span className="text-xs text-white/55">{SHIFT_CLICK_TIP}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-white/70">Select orders below to assign or move</p>
            <p className="text-xs text-white/45">{SHIFT_CLICK_TIP}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <SmallButton onClick={onRefresh} disabled={busy} className="bg-white/10 hover:bg-white/20">
            Refresh
          </SmallButton>
          {selectedCount > 0 && (
            <SmallButton onClick={onClear} disabled={busy} className="bg-white/10 hover:bg-white/20">
              Clear selection
            </SmallButton>
          )}
        </div>

        {inProgressNote && selectedCount > 0 && (
          <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
            Manager override: unassigning moves work back to Needs Action; reassigning moves it
            back to Assigned for the new agent (they must Start work again). Prior agent work
            session is cleared — no completion credit.
            {/* TODO: optional manager reason/note on override */}
          </p>
        )}

        {searchMode && selectedCount > 0 && (
          <p className="text-xs text-white/50">{SEARCH_MODE_SKIP_COPY}</p>
        )}

        {selectedCount > 0 && canMutate && (
          <BulkActionsForm
            canAssign={canAssign}
            canUnassign={canUnassign}
            canMove={canMove}
            moveDisabledCopy={disableMove ? IN_PROGRESS_MOVE_DISABLED_COPY : undefined}
            agents={agents}
            agentsLoading={agentsLoading}
            busy={busy}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onMove={onMove}
          />
        )}

        {selectedCount > 0 && config.readOnly && (
          <p className="text-xs text-white/50">
            This queue is view-only. Select orders in an active queue to assign work.
          </p>
        )}
      </div>
    </div>
  );
}

function BulkActionsForm({
  canAssign,
  canUnassign,
  canMove,
  moveDisabledCopy,
  agents,
  agentsLoading,
  busy,
  onAssign,
  onUnassign,
  onMove,
}: {
  canAssign: boolean;
  canUnassign: boolean;
  canMove: boolean;
  moveDisabledCopy?: string;
  agents: AssignableAgent[];
  agentsLoading: boolean;
  busy: boolean;
  onAssign: (agentId: string) => void;
  onUnassign: () => void;
  onMove: (targetQueue: WodIvcsQueueKey, agentId?: string) => void;
}) {
  const [agentId, setAgentId] = useState("");
  const [moveTarget, setMoveTarget] = useState<WodIvcsQueueKey>("NEEDS_REVIEW");

  return (
    <div className="flex flex-col gap-3">
      {canAssign && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[200px] flex-1">
            Assign to agent
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={agentsLoading || busy}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                  {a.isLive === false ? " (paused)" : ""}
                </option>
              ))}
            </select>
          </label>
          <SmallButton
            onClick={() => agentId && onAssign(agentId)}
            disabled={!agentId || busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Assign selected
          </SmallButton>
        </div>
      )}

      {(canUnassign || canMove || moveDisabledCopy) && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-end gap-2">
            {canUnassign && (
              <SmallButton
                onClick={onUnassign}
                disabled={busy}
                className="bg-white/10 hover:bg-white/20 text-red-200"
              >
                Unassign selected
              </SmallButton>
            )}

            {canMove && (
              <>
                <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[180px]">
                  Move to queue
                  <select
                    value={moveTarget}
                    onChange={(e) => setMoveTarget(e.target.value as WodIvcsQueueKey)}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
                  >
                    {MOVE_QUEUE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                {moveTarget === "ASSIGNED" && (
                  <label className="flex flex-col gap-1 text-xs text-white/60 min-w-[180px]">
                    Agent for Assigned
                    <select
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value)}
                      disabled={agentsLoading || busy}
                      className="px-3 py-2 rounded-lg bg-neutral-800 border border-white/15 text-white text-sm"
                    >
                      <option value="">Select agent…</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.email}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <SmallButton
                  onClick={() =>
                    onMove(moveTarget, moveTarget === "ASSIGNED" ? agentId || undefined : undefined)
                  }
                  disabled={busy || (moveTarget === "ASSIGNED" && !agentId)}
                  className="bg-violet-600/80 hover:bg-violet-600 text-white"
                >
                  Move selected
                </SmallButton>
              </>
            )}
          </div>

          {moveDisabledCopy && (
            <p className="text-xs text-white/50">{moveDisabledCopy}</p>
          )}
        </div>
      )}
    </div>
  );
}
