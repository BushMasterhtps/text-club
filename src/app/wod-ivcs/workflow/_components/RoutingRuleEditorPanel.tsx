"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";
import type { DispositionGroupDetail, RoutingRule } from "@/lib/wod-ivcs/routing-matrix-api-client";
import type { RoutingRuleInput } from "@/lib/wod-ivcs/routing-matrix-service";
import {
  dropOffBehaviorLabel,
  labelFor,
  operationalQueueLabel,
} from "@/lib/wod-ivcs/routing-matrix-labels";
import { FixTypeRuleCard } from "./FixTypeRuleCard";
import {
  type BatchSaveFailure,
  type BatchSaveResult,
  type FixTypeRuleSettings,
  type SharedPathForm,
  defaultFixTypeSettings,
  emptyForm,
  fromRule,
  toInput,
  toRoutingRuleInput,
  validateFixTypeSettings,
} from "./routing-rule-form-types";
import { FollowUpQuestionsBuilder } from "./FollowUpQuestionsBuilder";
import { selectClass, textareaClass } from "./shared";

type Props = {
  open: boolean;
  rule: RoutingRule | null;
  groups: DispositionGroupDetail[];
  onClose: () => void;
  onSaveSingle: (input: RoutingRuleInput) => Promise<void>;
  onSaveBatch: (inputs: RoutingRuleInput[]) => Promise<BatchSaveResult>;
};

function optionsFor(groups: DispositionGroupDetail[], groupKey: string) {
  const g = groups.find((x) => x.groupKey === groupKey);
  return (g?.options ?? []).filter((o) => o.isActive);
}

export function RoutingRuleEditorPanel({
  open,
  rule,
  groups,
  onClose,
  onSaveSingle,
  onSaveBatch,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [sharedPath, setSharedPath] = useState<SharedPathForm>({
    rootCauseOptionId: "",
    cashSaleExistsOptionId: "",
    merchantOptionId: "",
  });
  const [selectedFixTypeIds, setSelectedFixTypeIds] = useState<string[]>([]);
  const [fixTypeSettingsById, setFixTypeSettingsById] = useState<
    Record<string, FixTypeRuleSettings>
  >({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [batchFailures, setBatchFailures] = useState<BatchSaveFailure[]>([]);

  const isEdit = Boolean(rule);
  const fixTypeOptions = useMemo(() => optionsFor(groups, "fix_type"), [groups]);
  const fixTypeLabelById = useMemo(
    () => new Map(fixTypeOptions.map((o) => [o.id, o.label])),
    [fixTypeOptions]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setBatchFailures([]);
    if (rule) {
      const loaded = fromRule(rule);
      setForm(loaded);
      setSharedPath({
        rootCauseOptionId: loaded.rootCauseOptionId,
        cashSaleExistsOptionId: loaded.cashSaleExistsOptionId,
        merchantOptionId: loaded.merchantOptionId,
      });
      setSelectedFixTypeIds([]);
      setFixTypeSettingsById({});
    } else {
      setForm(emptyForm());
      setSharedPath({
        rootCauseOptionId: "",
        cashSaleExistsOptionId: "",
        merchantOptionId: "",
      });
      setSelectedFixTypeIds([]);
      setFixTypeSettingsById({});
    }
  }, [open, rule]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const timer = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open, rule?.id, selectedFixTypeIds.length]);

  if (!open) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const toggleFixType = (optionId: string) => {
    setSelectedFixTypeIds((prev) => {
      if (prev.includes(optionId)) {
        const next = prev.filter((id) => id !== optionId);
        setFixTypeSettingsById((settings) => {
          const copy = { ...settings };
          delete copy[optionId];
          return copy;
        });
        return next;
      }
      setFixTypeSettingsById((settings) => ({
        ...settings,
        [optionId]: settings[optionId] ?? defaultFixTypeSettings(),
      }));
      return [...prev, optionId];
    });
    setBatchFailures([]);
    setError("");
  };

  const updateFixTypeSettings = (optionId: string, settings: FixTypeRuleSettings) => {
    setFixTypeSettingsById((prev) => ({ ...prev, [optionId]: settings }));
  };

  const removeFixTypeFromBatch = (optionId: string) => {
    setSelectedFixTypeIds((prev) => prev.filter((id) => id !== optionId));
    setFixTypeSettingsById((prev) => {
      const copy = { ...prev };
      delete copy[optionId];
      return copy;
    });
  };

  const validateBatch = (): string | null => {
    const isCatchAll =
      !sharedPath.rootCauseOptionId && selectedFixTypeIds.length === 0;
    if (!isCatchAll && selectedFixTypeIds.length === 0) {
      return "Select at least one fix type, or leave root cause and fix types empty for a default rule.";
    }
    if (isCatchAll) return null;
    if (!sharedPath.rootCauseOptionId) {
      return "Select a root cause when adding fix-type rules.";
    }
    for (const id of selectedFixTypeIds) {
      const label = fixTypeLabelById.get(id) ?? "Fix type";
      const issue = validateFixTypeSettings(fixTypeSettingsById[id] ?? defaultFixTypeSettings(), label);
      if (issue) return issue;
    }
    return null;
  };

  const buildBatchInputs = (): RoutingRuleInput[] => {
    if (selectedFixTypeIds.length === 0) {
      return [toRoutingRuleInput(sharedPath, null, defaultFixTypeSettings())];
    }
    return selectedFixTypeIds.map((id) =>
      toRoutingRuleInput(sharedPath, id, fixTypeSettingsById[id] ?? defaultFixTypeSettings())
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    setBatchFailures([]);

    try {
      if (isEdit) {
        const editValidation = validateFixTypeSettings(form, "Rule");
        if (editValidation) {
          setError(editValidation);
          return;
        }
        await onSaveSingle(toInput(form));
        onClose();
        return;
      }

      const validationError = validateBatch();
      if (validationError) {
        setError(validationError);
        return;
      }

      const inputs = buildBatchInputs();
      const result = await onSaveBatch(inputs);

      if (result.failures.length > 0) {
        setBatchFailures(result.failures);
        if (result.successCount > 0) {
          setError(
            `Created ${result.successCount} of ${inputs.length} rules. Fix the issues below and save again for the remaining fix types.`
          );
        } else {
          setError("No rules were created. Review the errors below and try again.");
        }
        return;
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = isEdit
    ? "Save rule"
    : selectedFixTypeIds.length > 1
      ? `Save ${selectedFixTypeIds.length} rules`
      : selectedFixTypeIds.length === 1
        ? "Save rule"
        : "Save default rule";

  return (
    <div ref={panelRef} className="scroll-mt-6">
      <Card className="p-6 space-y-6 border-sky-500/30 bg-sky-500/[0.04] ring-1 ring-sky-500/20">
        <div className="flex flex-wrap justify-between items-start gap-3 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-xl font-semibold text-white">
              {isEdit ? "Edit routing rule" : "Add routing rules"}
            </h3>
            <p className="text-sm text-white/50 mt-1 max-w-2xl">
              {isEdit
                ? "Define what agents can select and where the order should go after this path."
                : "Choose a root cause and one or more fix types. Each fix type becomes its own routing rule with its own follow-up settings."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/50 hover:text-white px-2 py-1"
            aria-label="Close editor"
          >
            Close
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {batchFailures.length > 0 && (
          <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-3 space-y-2">
            <p className="font-medium">Could not create these rules:</p>
            <ul className="list-disc list-inside space-y-1">
              {batchFailures.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.fixTypeLabel}</span>: {f.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="space-y-4">
          <SectionHeading
            title={isEdit ? "A. Agent selection path" : "A. Shared agent path (all rules in this batch)"}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Root Cause">
              <select
                className={selectClass}
                value={isEdit ? form.rootCauseOptionId : sharedPath.rootCauseOptionId}
                onChange={(e) =>
                  isEdit
                    ? set("rootCauseOptionId", e.target.value)
                    : setSharedPath((p) => ({ ...p, rootCauseOptionId: e.target.value }))
                }
              >
                <option value="">— Any / default —</option>
                {optionsFor(groups, "root_cause").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cash Sale Exists?">
              <select
                className={selectClass}
                value={isEdit ? form.cashSaleExistsOptionId : sharedPath.cashSaleExistsOptionId}
                onChange={(e) =>
                  isEdit
                    ? set("cashSaleExistsOptionId", e.target.value)
                    : setSharedPath((p) => ({ ...p, cashSaleExistsOptionId: e.target.value }))
                }
              >
                <option value="">— Any —</option>
                {optionsFor(groups, "cash_sale_exists").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Merchant">
              <select
                className={selectClass}
                value={isEdit ? form.merchantOptionId : sharedPath.merchantOptionId}
                onChange={(e) =>
                  isEdit
                    ? set("merchantOptionId", e.target.value)
                    : setSharedPath((p) => ({ ...p, merchantOptionId: e.target.value }))
                }
              >
                <option value="">— Any —</option>
                {optionsFor(groups, "merchant").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {isEdit && (
              <Field label="Fix Type">
                <select
                  className={selectClass}
                  value={form.fixTypeOptionId}
                  onChange={(e) => set("fixTypeOptionId", e.target.value)}
                >
                  <option value="">— Any / default —</option>
                  {fixTypeOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </section>

        {!isEdit && (
          <section className="space-y-3 pt-2 border-t border-white/10">
            <SectionHeading title="B. Fix types to add" />
            <p className="text-sm text-white/50">
              Select every fix type that should get its own routing rule for this root cause.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto rounded-lg border border-white/10 p-3 bg-black/20">
              {fixTypeOptions.map((o) => (
                <label
                  key={o.id}
                  className={`flex items-start gap-2 text-sm rounded-md px-2 py-2 cursor-pointer hover:bg-white/5 ${
                    selectedFixTypeIds.includes(o.id) ? "bg-sky-500/15 text-white" : "text-white/80"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedFixTypeIds.includes(o.id)}
                    onChange={() => toggleFixType(o.id)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            {selectedFixTypeIds.length === 0 && (
              <p className="text-xs text-white/40">
                No fix types selected — you can save a default catch-all rule if root cause is also
                empty.
              </p>
            )}
          </section>
        )}

        {isEdit ? (
          <>
            <EditSections form={form} set={set} />
          </>
        ) : (
          selectedFixTypeIds.length > 0 && (
            <section className="space-y-4 pt-2 border-t border-white/10">
              <SectionHeading title="C. Settings per fix type" />
              <p className="text-sm text-white/50">
                Configure follow-up questions, confirmations, and routing for each fix type
                separately.
              </p>
              <div className="space-y-4">
                {selectedFixTypeIds.map((id) => (
                  <FixTypeRuleCard
                    key={id}
                    fixTypeLabel={fixTypeLabelById.get(id) ?? "Fix type"}
                    settings={fixTypeSettingsById[id] ?? defaultFixTypeSettings()}
                    onChange={(s) => updateFixTypeSettings(id, s)}
                    onRemove={() => removeFixTypeFromBatch(id)}
                  />
                ))}
              </div>
            </section>
          )
        )}

        <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
          <SmallButton
            onClick={handleSubmit}
            disabled={saving}
            className="bg-sky-600 hover:bg-sky-700 min-w-[160px]"
          >
            {saving ? "Saving…" : saveLabel}
          </SmallButton>
          <SmallButton onClick={onClose} className="bg-white/10 hover:bg-white/20 min-w-[100px]">
            Cancel
          </SmallButton>
        </div>
      </Card>
    </div>
  );
}

function EditSections({
  form,
  set,
}: {
  form: ReturnType<typeof emptyForm>;
  set: <K extends keyof ReturnType<typeof emptyForm>>(
    key: K,
    value: ReturnType<typeof emptyForm>[K]
  ) => void;
}) {
  return (
    <>
      <section className="space-y-4 pt-2 border-t border-white/10">
        <SectionHeading title="B. Follow-up questions" />
        <FollowUpQuestionsBuilder
          enabled={form.followUpQuestionsRequired}
          questions={form.followUpQuestions}
          onEnabledChange={(enabled) => set("followUpQuestionsRequired", enabled)}
          onQuestionsChange={(questions) => set("followUpQuestions", questions)}
        />
      </section>

      <section className="space-y-4 pt-2 border-t border-white/10">
        <SectionHeading title="C. Required confirmations / fields" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          <Toggle
            label="Re-trigger cash sale confirmation required?"
            checked={form.requiresRetriggerConfirmation}
            onChange={(v) => set("requiresRetriggerConfirmation", v)}
          />
          <Toggle
            label="IT escalation required?"
            checked={form.requiresItEscalation}
            onChange={(v) => set("requiresItEscalation", v)}
          />
          <Toggle
            label="Replacement order number required?"
            checked={form.requiresReplacementOrderNumber}
            onChange={(v) => set("requiresReplacementOrderNumber", v)}
          />
          <Toggle
            label="Processed reship confirmation required?"
            checked={form.requiresProcessedReship}
            onChange={(v) => set("requiresProcessedReship", v)}
          />
        </div>
        {form.requiresItEscalation && (
          <Field label="IT escalation prompt">
            <textarea
              className={textareaClass}
              rows={2}
              value={form.itEscalationPrompt}
              onChange={(e) => set("itEscalationPrompt", e.target.value)}
            />
          </Field>
        )}
      </section>

      <section className="space-y-4 pt-2 border-t border-white/10">
        <SectionHeading title="D. Routing result" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Queue after agent action">
            <select
              className={selectClass}
              value={form.targetQueue}
              onChange={(e) => set("targetQueue", e.target.value)}
            >
              {Object.keys(operationalQueueLabel).map((k) => (
                <option key={k} value={k}>
                  {labelFor(operationalQueueLabel, k)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="When dropped from both reports">
            <select
              className={selectClass}
              value={form.dropOffBehavior}
              onChange={(e) => set("dropOffBehavior", e.target.value)}
            >
              {Object.keys(dropOffBehaviorLabel).map((k) => (
                <option key={k} value={k}>
                  {labelFor(dropOffBehaviorLabel, k)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="pt-2 border-t border-white/10">
        <SectionHeading title="E. Status" />
        <label className="flex items-center gap-2 text-sm text-white/80 mt-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Rule is active
        </label>
      </section>
    </>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h4 className="text-sm font-semibold text-sky-300">{title}</h4>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/70">{label}</span>
      {children}
    </label>
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
