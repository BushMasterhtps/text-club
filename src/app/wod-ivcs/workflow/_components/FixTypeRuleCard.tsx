"use client";

import {
  dropOffBehaviorLabel,
  labelFor,
  operationalQueueLabel,
} from "@/lib/wod-ivcs/routing-matrix-labels";
import { selectClass, textareaClass } from "./shared";
import type { FixTypeRuleSettings } from "./routing-rule-form-types";
import { FollowUpQuestionsBuilder } from "./FollowUpQuestionsBuilder";

type Props = {
  fixTypeLabel: string;
  settings: FixTypeRuleSettings;
  onChange: (settings: FixTypeRuleSettings) => void;
  onRemove?: () => void;
};

export function FixTypeRuleCard({ fixTypeLabel, settings, onChange, onRemove }: Props) {
  const set = <K extends keyof FixTypeRuleSettings>(key: K, value: FixTypeRuleSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <div className="flex flex-wrap justify-between items-start gap-2 border-b border-white/10 pb-3">
        <h5 className="text-base font-medium text-white">{fixTypeLabel}</h5>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Remove from batch
          </button>
        )}
      </div>

      <FollowUpQuestionsBuilder
        enabled={settings.followUpQuestionsRequired}
        questions={settings.followUpQuestions}
        onEnabledChange={(enabled) => set("followUpQuestionsRequired", enabled)}
        onQuestionsChange={(questions) => set("followUpQuestions", questions)}
      />

      <div className="space-y-3 pt-2 border-t border-white/10">
        <p className="text-xs font-semibold text-sky-300/90 uppercase tracking-wide">
          Required confirmations / fields
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Toggle
            label="Re-trigger cash sale confirmation required?"
            checked={settings.requiresRetriggerConfirmation}
            onChange={(v) => set("requiresRetriggerConfirmation", v)}
          />
          <Toggle
            label="IT escalation required?"
            checked={settings.requiresItEscalation}
            onChange={(v) => set("requiresItEscalation", v)}
          />
          <Toggle
            label="Replacement order number required?"
            checked={settings.requiresReplacementOrderNumber}
            onChange={(v) => set("requiresReplacementOrderNumber", v)}
          />
          <Toggle
            label="Processed reship confirmation required?"
            checked={settings.requiresProcessedReship}
            onChange={(v) => set("requiresProcessedReship", v)}
          />
        </div>
        {settings.requiresItEscalation && (
          <label className="block space-y-1.5">
            <span className="text-sm text-white/70">IT escalation prompt</span>
            <textarea
              className={textareaClass}
              rows={2}
              value={settings.itEscalationPrompt}
              onChange={(e) => set("itEscalationPrompt", e.target.value)}
            />
          </label>
        )}
      </div>

      <div className="space-y-3 pt-2 border-t border-white/10">
        <p className="text-xs font-semibold text-sky-300/90 uppercase tracking-wide">
          Routing result
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-white/70">Queue after agent action</span>
            <select
              className={selectClass}
              value={settings.targetQueue}
              onChange={(e) => set("targetQueue", e.target.value)}
            >
              {Object.keys(operationalQueueLabel).map((k) => (
                <option key={k} value={k}>
                  {labelFor(operationalQueueLabel, k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-white/70">When dropped from both reports</span>
            <select
              className={selectClass}
              value={settings.dropOffBehavior}
              onChange={(e) => set("dropOffBehavior", e.target.value)}
            >
              {Object.keys(dropOffBehaviorLabel).map((k) => (
                <option key={k} value={k}>
                  {labelFor(dropOffBehaviorLabel, k)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="pt-2 border-t border-white/10">
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={settings.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Rule is active
        </label>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-white/80">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
