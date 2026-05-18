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

type Props = {
  selectedCount: number;
  currentQueue: WodIvcsQueueKey;
  /** When true, results span multiple queues; bulk actions use operational rules. */
  searchMode?: boolean;
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
};

export function WodIvcsBulkAssignBar({
  selectedCount,
  currentQueue,
  searchMode = false,
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
}: Props) {
  const config = queueConfig(currentQueue);
  const canAssign = searchMode ? true : config.assignable && !config.readOnly;
  const canMutate = searchMode ? true : !config.readOnly;
  const inProgressNote = !searchMode && currentQueue === "IN_PROGRESS";

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-white">
            {selectedCount === 0
              ? "Select orders below to assign or move"
              : `${selectedCount} order${selectedCount === 1 ? "" : "s"} selected`}
          </span>
          <div className="flex flex-wrap gap-2">
            <SmallButton onClick={onRefresh} disabled={busy} className="bg-white/10 hover:bg-white/20">
              Refresh
            </SmallButton>
            {selectedCount > 0 && (
              <SmallButton onClick={onClear} disabled={busy} className="bg-white/10 hover:bg-white/20">
                Clear selection
              </SmallButton>
            )}
          </div>
        </div>

        {inProgressNote && selectedCount > 0 && (
          <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
            Manager override: unassigning moves work back to Needs Action; reassigning moves it
            back to Assigned for the new agent (they must Start work again). Prior agent work
            session is cleared — no completion credit.
            {/* TODO: optional manager reason/note on override */}
          </p>
        )}

        {selectedCount > 0 && canMutate && (
          <BulkActionsForm
            canAssign={canAssign}
            agents={agents}
            agentsLoading={agentsLoading}
            busy={busy}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onMove={onMove}
            inProgressNote={inProgressNote}
          />
        )}

        {selectedCount > 0 && config.readOnly && (
          <p className="text-xs text-white/50">
            This queue is view-only. Select orders in an active queue to assign work.
          </p>
        )}
      </div>

      {message && <InlineMessage tone={message.tone}>{message.text}</InlineMessage>}

      {skipped.length > 0 && (
        <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 max-h-32 overflow-y-auto">
          <p className="font-medium mb-1">Some orders were skipped:</p>
          <ul className="space-y-1 list-disc pl-4">
            {skipped.map((s) => (
              <li key={s.orderId}>
                {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BulkActionsForm({
  canAssign,
  agents,
  agentsLoading,
  busy,
  onAssign,
  onUnassign,
  onMove,
  inProgressNote,
}: {
  canAssign: boolean;
  agents: AssignableAgent[];
  agentsLoading: boolean;
  busy: boolean;
  onAssign: (agentId: string) => void;
  onUnassign: () => void;
  onMove: (targetQueue: WodIvcsQueueKey, agentId?: string) => void;
  inProgressNote: boolean;
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

      <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
        <SmallButton
          onClick={onUnassign}
          disabled={busy}
          className="bg-white/10 hover:bg-white/20 text-red-200"
        >
          Unassign selected
        </SmallButton>

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
      </div>
    </div>
  );
}
