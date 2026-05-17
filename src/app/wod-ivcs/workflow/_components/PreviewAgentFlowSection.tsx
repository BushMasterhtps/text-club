"use client";

import { useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import {
  previewAgentFlow,
  type RoutingRule,
} from "@/lib/wod-ivcs/routing-matrix-api-client";
import {
  agentFlowStepLabel,
  dropOffBehaviorLabel,
  labelFor,
  operationalQueueLabel,
} from "@/lib/wod-ivcs/routing-matrix-labels";
import {
  FOLLOW_UP_QUESTION_TYPE_LABEL,
  extractFollowUpQuestionsFromRule,
  formatShowWhenLabel,
} from "@/lib/wod-ivcs/follow-up-questions";
import { AgentPreviewCard } from "./AgentPreviewCard";
import { selectClass } from "./shared";

type Props = {
  versionId: string;
  rules: RoutingRule[];
  onError: (msg: string) => void;
};

export function PreviewAgentFlowSection({ versionId, rules, onError }: Props) {
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAgentFlow>> | null>(
    null
  );

  const activeRules = rules.filter((r) => r.isActive);

  const runPreview = async () => {
    if (!selectedRuleId) {
      onError("Select a routing rule to preview.");
      return;
    }
    setLoading(true);
    try {
      const result = await previewAgentFlow(versionId, { routingRuleId: selectedRuleId });
      setPreview(result);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  const rule = preview?.routingRule;
  const sim = preview?.simulation;
  const matched = sim?.matchedRule;

  const steps: Array<{ label: string; value?: string }> = [];
  if (rule) {
    if (rule.rootCauseOption) {
      steps.push({ label: "Root Cause", value: rule.rootCauseOption.label });
    }
    if (rule.cashSaleExistsOption) {
      steps.push({ label: "Cash Sale Exists?", value: rule.cashSaleExistsOption.label });
    }
    if (rule.merchantOption) {
      steps.push({ label: "Merchant", value: rule.merchantOption.label });
    }
    if (rule.fixTypeOption) {
      steps.push({ label: "Fix Type", value: rule.fixTypeOption.label });
    }
    const followUps = extractFollowUpQuestionsFromRule({
      metadataJson: rule.metadataJson,
      subDispositionRequired: rule.subDispositionRequired,
      subDispositionQuestion: rule.subDispositionQuestion,
      subDispositionOptions: rule.subDispositionOptions.map((o) => ({
        label: o.label,
        isActive: o.isActive,
      })),
    });

    for (const q of followUps) {
      const typeLabel = FOLLOW_UP_QUESTION_TYPE_LABEL[q.type];
      const choices =
        q.type === "text"
          ? undefined
          : q.options.map((o) => o.label).filter(Boolean).join(", ");
      let detail = typeLabel;
      if (choices) detail += ` — ${choices}`;
      if (q.showWhen?.questionId && q.showWhen.value) {
        detail += ` (Only shown when: ${formatShowWhenLabel(q.showWhen, followUps)})`;
      }
      const notesOptions = q.options.filter((o) => o.requiresNotes).map((o) => o.label);
      if (notesOptions.length > 0) {
        detail += ` — Require notes if Other is selected: ${notesOptions.join(", ")}`;
      }
      steps.push({
        label: q.question.trim() || "Follow-up question",
        value: detail,
      });
    }
    if (rule.requiresRetriggerConfirmation) {
      steps.push({ label: "Re-trigger cash sale confirmation", value: "Required" });
    }
    if (rule.requiresItEscalation) {
      steps.push({
        label: "IT escalation",
        value: rule.itEscalationPrompt || "Required",
      });
    }
    if (rule.requiresReplacementOrderNumber) {
      steps.push({ label: "Replacement order number", value: "Required" });
    }
    if (rule.requiresProcessedReship) {
      steps.push({ label: "Processed reship confirmation", value: "Required" });
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Preview Agent Flow</h3>
        <p className="text-sm text-white/50 mt-1">
          See the steps an agent would follow for a selected routing path.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[240px] space-y-1">
          <span className="text-xs text-white/60">Routing rule</span>
          <select
            className={selectClass}
            value={selectedRuleId}
            onChange={(e) => setSelectedRuleId(e.target.value)}
          >
            <option value="">Select a rule…</option>
            {activeRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label ?? "Unnamed rule"}
              </option>
            ))}
          </select>
        </label>
        <SmallButton
          onClick={runPreview}
          disabled={loading || !selectedRuleId}
          className="bg-sky-600 hover:bg-sky-700"
        >
          {loading ? "Loading…" : "Preview"}
        </SmallButton>
      </div>

      {preview && rule && (
        <AgentPreviewCard rule={rule} dropOffBehavior={preview.dropOffBehavior} />
      )}

      {preview && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">
            Step overview
          </p>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-600/30 text-sky-300 text-sm flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{step.label}</p>
                  {step.value && (
                    <p className="text-sm text-white/60 mt-0.5">→ {step.value}</p>
                  )}
                </div>
              </li>
            ))}
            <li className="flex gap-3 pt-2 border-t border-white/10">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-600/30 text-green-300 text-sm flex items-center justify-center">
                ✓
              </span>
              <div>
                <p className="text-sm font-medium text-white">Submit → result</p>
                <p className="text-sm text-white/60 mt-1">
                  Queue after agent action:{" "}
                  <strong className="text-white">
                    {labelFor(
                      operationalQueueLabel,
                      matched?.targetQueue ?? rule?.targetQueue
                    )}
                  </strong>
                </p>
                <p className="text-sm text-white/60">
                  When dropped from both reports:{" "}
                  <strong className="text-white">
                    {labelFor(
                      dropOffBehaviorLabel,
                      preview.dropOffBehavior
                    )}
                  </strong>
                </p>
              </div>
            </li>
          </ol>

          {sim?.visibleSteps && sim.visibleSteps.length > 0 && (
            <details className="text-xs text-white/40">
              <summary className="cursor-pointer hover:text-white/60">
                Technical step order (optional detail)
              </summary>
              <p className="mt-2 font-mono">
                {sim.visibleSteps
                  .map((s) => labelFor(agentFlowStepLabel, s))
                  .join(" → ")}
              </p>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
