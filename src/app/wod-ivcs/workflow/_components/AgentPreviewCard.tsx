"use client";

import type { RoutingRule } from "@/lib/wod-ivcs/routing-matrix-api-client";
import {
  dropOffBehaviorLabel,
  labelFor,
  operationalQueueLabel,
} from "@/lib/wod-ivcs/routing-matrix-labels";
import {
  FOLLOW_UP_QUESTION_TYPE_LABEL,
  extractFollowUpQuestionsFromRule,
  formatShowWhenLabel,
} from "@/lib/wod-ivcs/follow-up-questions";
import { selectClass, textareaClass } from "./shared";

type Props = {
  rule: RoutingRule;
  dropOffBehavior: string;
};

export function AgentPreviewCard({ rule, dropOffBehavior }: Props) {
  const followUps = extractFollowUpQuestionsFromRule({
    metadataJson: rule.metadataJson,
    subDispositionRequired: rule.subDispositionRequired,
    subDispositionQuestion: rule.subDispositionQuestion,
    subDispositionOptions: rule.subDispositionOptions.map((o) => ({
      label: o.label,
      isActive: o.isActive,
    })),
  });

  return (
    <div className="rounded-xl border border-sky-500/25 bg-gradient-to-b from-sky-950/40 to-black/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 bg-black/30">
        <p className="text-xs uppercase tracking-wide text-sky-300/80">Agent preview</p>
        <p className="text-sm text-white/60 mt-0.5">
          Mock view of what an agent would see for this routing path
        </p>
      </div>

      <div className="p-4 space-y-4 max-w-xl">
        {rule.rootCauseOption && (
          <PreviewField label="Root Cause" value={rule.rootCauseOption.label} />
        )}
        {rule.cashSaleExistsOption && (
          <PreviewField label="Cash Sale Exists?" value={rule.cashSaleExistsOption.label} />
        )}
        {rule.merchantOption && (
          <PreviewField label="Merchant" value={rule.merchantOption.label} />
        )}
        {rule.fixTypeOption && (
          <PreviewField label="Fix Type" value={rule.fixTypeOption.label} />
        )}

        {followUps.map((q, i) => (
          <div key={q.id} className="space-y-1.5">
            <label className="block text-sm font-medium text-white/90">
              {q.question.trim() || `Follow-up question ${i + 1}`}
              {q.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            {q.showWhen?.questionId && q.showWhen.value && (
              <p className="text-xs text-amber-200/80">
                Shown when: {formatShowWhenLabel(q.showWhen, followUps)}
              </p>
            )}
            {q.type === "text" ? (
              <textarea
                className={`${textareaClass} opacity-80`}
                rows={2}
                disabled
                placeholder="Agent enters notes here…"
              />
            ) : (
              <select className={`${selectClass} opacity-90`} disabled defaultValue="">
                <option value="">
                  {q.type === "multi_select" ? "Select one or more…" : "Select an answer…"}
                </option>
                {q.options
                  .filter((o) => o.label.trim())
                  .map((o) => (
                    <option key={o.id} value={o.label}>
                      {o.label}
                      {o.requiresNotes ? " (notes required if Other)" : ""}
                    </option>
                  ))}
              </select>
            )}
            <p className="text-xs text-white/35">
              {FOLLOW_UP_QUESTION_TYPE_LABEL[q.type]}
            </p>
          </div>
        ))}

        {rule.requiresRetriggerConfirmation && (
          <PreviewCheckbox label="Re-trigger cash sale confirmation" required />
        )}
        {rule.requiresItEscalation && (
          <div className="space-y-1.5">
            <PreviewCheckbox label="IT escalation" required />
            {rule.itEscalationPrompt && (
              <textarea
                className={`${textareaClass} opacity-80`}
                rows={2}
                disabled
                value={rule.itEscalationPrompt}
                readOnly
              />
            )}
          </div>
        )}
        {rule.requiresReplacementOrderNumber && (
          <PreviewField label="Replacement order number" placeholder="Enter order number…" />
        )}
        {rule.requiresProcessedReship && (
          <PreviewCheckbox label="Processed reship confirmation" required />
        )}

        <div className="pt-3 mt-2 border-t border-white/10 space-y-2">
          <p className="text-xs font-semibold text-green-300/90 uppercase tracking-wide">
            After submit
          </p>
          <p className="text-sm text-white/80">
            <span className="text-white/50">Queue after agent action: </span>
            <strong className="text-white">
              {labelFor(operationalQueueLabel, rule.targetQueue)}
            </strong>
          </p>
          <p className="text-sm text-white/80">
            <span className="text-white/50">When dropped from both reports: </span>
            <strong className="text-white">
              {labelFor(dropOffBehaviorLabel, dropOffBehavior)}
            </strong>
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewField({
  label,
  value,
  placeholder,
}: {
  label: string;
  value?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white/90">{label}</span>
      <select className={`${selectClass} opacity-90`} disabled value={value ?? ""}>
        {value ? <option>{value}</option> : <option>{placeholder ?? "—"}</option>}
      </select>
    </label>
  );
}

function PreviewCheckbox({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm text-white/80">
      <input type="checkbox" disabled className="mt-0.5 opacity-70" />
      <span>
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
    </label>
  );
}
