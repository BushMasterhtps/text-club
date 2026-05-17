"use client";

import { useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type { DispositionGroupDetail, RoutingRule } from "@/lib/wod-ivcs/routing-matrix-api-client";
import {
  RoutingMatrixApiError,
  createRoutingRule,
  deactivateRoutingRule,
  duplicateRoutingRule,
  moveRoutingRule,
  updateRoutingRule,
} from "@/lib/wod-ivcs/routing-matrix-api-client";
import type { RoutingRuleInput } from "@/lib/wod-ivcs/routing-matrix-service";
import {
  extractFollowUpQuestionsFromRule,
  followUpQuestionsSummary,
} from "@/lib/wod-ivcs/follow-up-questions";
import {
  dropOffBehaviorLabel,
  labelFor,
  operationalQueueLabel,
} from "@/lib/wod-ivcs/routing-matrix-labels";
import type { BatchSaveResult } from "./routing-rule-form-types";
import { ActiveBadge, YesNoBadge } from "./shared";
import { RoutingRuleEditorPanel } from "./RoutingRuleEditorPanel";

type Props = {
  versionId: string;
  isEditable: boolean;
  rules: RoutingRule[];
  groups: DispositionGroupDetail[];
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
};

function optionLabel(opt: { label: string } | null | undefined) {
  return opt?.label ?? "—";
}

function followUpSummary(rule: RoutingRule) {
  const questions = extractFollowUpQuestionsFromRule({
    metadataJson: rule.metadataJson,
    subDispositionRequired: rule.subDispositionRequired,
    subDispositionQuestion: rule.subDispositionQuestion,
    subDispositionOptions: rule.subDispositionOptions.map((o) => ({
      label: o.label,
      isActive: o.isActive,
    })),
  });
  return followUpQuestionsSummary(questions);
}

export function RoutingMatrixSection({
  versionId,
  isEditable,
  rules,
  groups,
  onRefresh,
  onError,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingRule(null);
  };

  const openCreate = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleSaveSingle = async (input: RoutingRuleInput) => {
    if (editingRule) {
      await updateRoutingRule(editingRule.id, input);
    } else {
      await createRoutingRule(versionId, input);
    }
    await onRefresh();
  };

  const handleSaveBatch = async (inputs: RoutingRuleInput[]): Promise<BatchSaveResult> => {
    const fixTypeLabelById = new Map(
      (groups.find((g) => g.groupKey === "fix_type")?.options ?? []).map((o) => [o.id, o.label])
    );

    const failures: BatchSaveResult["failures"] = [];
    let successCount = 0;

    for (const input of inputs) {
      const label = input.fixTypeOptionId
        ? fixTypeLabelById.get(input.fixTypeOptionId) ?? "Fix type"
        : "Default rule";
      try {
        await createRoutingRule(versionId, input);
        successCount += 1;
      } catch (e) {
        const message =
          e instanceof RoutingMatrixApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not create rule";
        failures.push({ fixTypeLabel: label, message });
      }
    }

    if (successCount > 0) {
      await onRefresh();
    }

    return { successCount, failures };
  };

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Routing Matrix</h3>
            <p className="text-sm text-white/50 mt-1">
              Each row is one path agents follow. More specific rows should appear above general
              defaults.
            </p>
          </div>
          {isEditable && (
            <SmallButton
              onClick={openCreate}
              disabled={editorOpen}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editorOpen
                ? editingRule
                  ? "Editing rule…"
                  : "Adding rule…"
                : "+ Add rule"}
            </SmallButton>
          )}
        </div>

        {!isEditable && (
          <p className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            This is the live published matrix. Create a draft to make changes.
          </p>
        )}

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[1100px] border-collapse">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="py-2 pr-3 font-medium">Root Cause</th>
                <th className="py-2 pr-3 font-medium">Cash Sale Exists?</th>
                <th className="py-2 pr-3 font-medium">Merchant</th>
                <th className="py-2 pr-3 font-medium">Fix Type</th>
                <th className="py-2 pr-3 font-medium">Sub-Disposition</th>
                <th className="py-2 pr-2 font-medium text-center">Re-trigger</th>
                <th className="py-2 pr-2 font-medium text-center">IT</th>
                <th className="py-2 pr-2 font-medium text-center">Repl. order</th>
                <th className="py-2 pr-2 font-medium text-center">Reship</th>
                <th className="py-2 pr-3 font-medium">Queue after agent action</th>
                <th className="py-2 pr-3 font-medium">When dropped from both reports</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rules.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-white/50">
                    No routing rules yet. Add a rule to define agent paths.
                  </td>
                </tr>
              )}
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className={`hover:bg-white/[0.03] ${!rule.isActive ? "opacity-50" : ""} ${
                    editorOpen && editingRule?.id === rule.id
                      ? "bg-sky-500/10 ring-1 ring-inset ring-sky-500/30"
                      : ""
                  }`}
                >
                  <td className="py-2.5 pr-3">{optionLabel(rule.rootCauseOption)}</td>
                  <td className="py-2.5 pr-3">{optionLabel(rule.cashSaleExistsOption)}</td>
                  <td className="py-2.5 pr-3">{optionLabel(rule.merchantOption)}</td>
                  <td className="py-2.5 pr-3">{optionLabel(rule.fixTypeOption)}</td>
                  <td className="py-2.5 pr-3 text-white/70 max-w-[140px]">{followUpSummary(rule)}</td>
                  <td className="py-2.5 pr-2 text-center">
                    <YesNoBadge value={rule.requiresRetriggerConfirmation} />
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    <YesNoBadge value={rule.requiresItEscalation} />
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    <YesNoBadge value={rule.requiresReplacementOrderNumber} />
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    <YesNoBadge value={rule.requiresProcessedReship} />
                  </td>
                  <td className="py-2.5 pr-3">
                    {labelFor(operationalQueueLabel, rule.targetQueue)}
                  </td>
                  <td className="py-2.5 pr-3">
                    {labelFor(dropOffBehaviorLabel, rule.dropOffBehavior)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <ActiveBadge active={rule.isActive} />
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {isEditable ? (
                        <>
                          <ActionBtn
                            disabled={busyId === rule.id || editorOpen}
                            onClick={() => openEdit(rule)}
                          >
                            Edit
                          </ActionBtn>
                          <ActionBtn
                            disabled={busyId === rule.id}
                            onClick={() =>
                              runAction(rule.id, () => duplicateRoutingRule(rule.id))
                            }
                          >
                            Duplicate
                          </ActionBtn>
                          {rule.isActive && (
                            <ActionBtn
                              disabled={busyId === rule.id}
                              onClick={() =>
                                runAction(rule.id, () => deactivateRoutingRule(rule.id))
                              }
                            >
                              Deactivate
                            </ActionBtn>
                          )}
                          <ActionBtn
                            disabled={busyId === rule.id}
                            onClick={() =>
                              runAction(rule.id, () => moveRoutingRule(rule.id, "up"))
                            }
                          >
                            ↑
                          </ActionBtn>
                          <ActionBtn
                            disabled={busyId === rule.id}
                            onClick={() =>
                              runAction(rule.id, () => moveRoutingRule(rule.id, "down"))
                            }
                          >
                            ↓
                          </ActionBtn>
                        </>
                      ) : (
                        <span className="text-xs text-white/40">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RoutingRuleEditorPanel
        open={editorOpen}
        rule={editingRule}
        groups={groups}
        onClose={closeEditor}
        onSaveSingle={handleSaveSingle}
        onSaveBatch={handleSaveBatch}
      />
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
