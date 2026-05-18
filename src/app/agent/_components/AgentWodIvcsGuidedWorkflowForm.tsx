"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentWodIvcsApiError,
  formatAgentWorkflowSubmitError,
  previewAgentWodIvcsWorkflow,
  submitAgentWodIvcsWorkflow,
  type AgentWorkflowPreviewResult,
  type AgentWorkflowSubmitResult,
} from "@/lib/wod-ivcs/agent-api-client";
import {
  buildPreviewAnswersPayload,
  canSubmitAgentWorkflow,
  CORE_STEP_ORDER,
  filterFixTypeCatalogOptions,
  findMatchingAgentRoutingRule,
  followUpAnswerKey,
  followUpNotesKey,
  getCoreSteps,
  getStepOptions,
  isFollowUpQuestionVisible,
  pruneAnswersAfterCoreChange,
  pruneAnswersAfterRuleChange,
  selectedOptionRequiresNotes,
  type AgentActiveWorkflow,
  type AgentCatalogOption,
  type AgentWorkflowStep,
  type WorkflowAnswersState,
} from "@/lib/wod-ivcs/agent-workflow-form-utils";
import {
  formatShowWhenLabel,
  type FollowUpQuestion,
} from "@/lib/wod-ivcs/follow-up-questions";
import {
  agentFlowStepLabel,
  labelFor,
  operationalQueueLabel,
} from "@/lib/wod-ivcs/routing-matrix-labels";
const PREVIEW_DEBOUNCE_MS = 450;

type Props = {
  orderId: string;
  active: AgentActiveWorkflow;
  onSubmitSuccess: (result: AgentWorkflowSubmitResult) => void;
  /** Called when submit fails due to stale assignment/queue state. */
  onSubmitStale?: () => void;
};

function stepDisplayLabel(step: AgentWorkflowStep): string {
  return step.label?.trim() || labelFor(agentFlowStepLabel, step.slug);
}

function SelectField({
  label,
  helpText,
  value,
  options,
  onChange,
}: {
  label: string;
  helpText?: string | null;
  value: string;
  options: AgentCatalogOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-white">{label}</span>
      {helpText && <span className="text-xs text-white/50 -mt-0.5">{helpText}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-neutral-800 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NotesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-amber-200/90">{label}</span>
      <textarea
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-neutral-800 border border-amber-500/25 px-3 py-2 text-sm text-white resize-y min-h-[64px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        placeholder="Add required notes…"
      />
    </label>
  );
}

function FollowUpQuestionField({
  question,
  allQuestions,
  answers,
  onAnswerChange,
}: {
  question: FollowUpQuestion;
  allQuestions: FollowUpQuestion[];
  answers: WorkflowAnswersState;
  onAnswerChange: (key: string, value: string | string[] | boolean) => void;
}) {
  const answerKey = followUpAnswerKey(question.id);
  const notesKey = followUpNotesKey(question.id);
  const raw = answers[answerKey];
  const selectedSingle = typeof raw === "string" ? raw : "";
  const selectedMulti = Array.isArray(raw) ? raw : [];
  const notesValue = typeof answers[notesKey] === "string" ? answers[notesKey] : "";
  const showNotes = selectedOptionRequiresNotes(
    question,
    question.type === "multi_select" ? selectedMulti : selectedSingle
  );

  if (question.type === "text") {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white">
          {question.question}
          {question.required && <span className="text-rose-300/90"> *</span>}
        </span>
        <textarea
          value={selectedSingle}
          rows={3}
          onChange={(e) => onAnswerChange(answerKey, e.target.value)}
          className="rounded-lg bg-neutral-800 border border-white/15 px-3 py-2 text-sm text-white resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          placeholder="Enter your answer…"
        />
      </label>
    );
  }

  if (question.type === "multi_select") {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-white mb-1">
          {question.question}
          {question.required && <span className="text-rose-300/90"> *</span>}
        </legend>
        <div className="space-y-2">
          {question.options.map((opt) => {
            const checked = selectedMulti.includes(opt.label);
            return (
              <label
                key={opt.id}
                className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-neutral-950/60 px-3 py-2 cursor-pointer hover:border-white/20"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selectedMulti.filter((l) => l !== opt.label)
                      : [...selectedMulti, opt.label];
                    onAnswerChange(answerKey, next);
                  }}
                  className="mt-0.5 rounded border-white/30"
                />
                <span className="text-sm text-white/90">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {showNotes && (
          <NotesField
            label="Notes (required for selected option)"
            value={notesValue}
            onChange={(v) => onAnswerChange(notesKey, v)}
          />
        )}
      </fieldset>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white">
          {question.question}
          {question.required && <span className="text-rose-300/90"> *</span>}
        </span>
        {question.showWhen?.questionId && question.showWhen.value && (
          <span className="text-xs text-white/45">
            Shown when: {formatShowWhenLabel(question.showWhen, allQuestions)}
          </span>
        )}
        <select
          value={selectedSingle}
          onChange={(e) => onAnswerChange(answerKey, e.target.value)}
          className="rounded-lg bg-neutral-800 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        >
          <option value="">Select…</option>
          {question.options.map((o) => (
            <option key={o.id} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {showNotes && (
        <NotesField
          label="Notes (required for selected option)"
          value={notesValue}
          onChange={(v) => onAnswerChange(notesKey, v)}
        />
      )}
    </div>
  );
}

export function AgentWodIvcsGuidedWorkflowForm({
  orderId,
  active,
  onSubmitSuccess,
  onSubmitStale,
}: Props) {
  const [answers, setAnswers] = useState<WorkflowAnswersState>({});
  const [preview, setPreview] = useState<AgentWorkflowPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const lastMatchedRuleId = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);

  const coreSteps = useMemo(() => getCoreSteps(active), [active]);

  const runPreview = useCallback(
    async (nextAnswers: WorkflowAnswersState) => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const result = await previewAgentWodIvcsWorkflow(
          orderId,
          buildPreviewAnswersPayload(nextAnswers, { routingRules: active.routingRules })
        );
        setPreview(result);
      } catch (e) {
        setPreview(null);
        setPreviewError(
          e instanceof AgentWodIvcsApiError ? e.message : "Could not preview this workflow path."
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [orderId, active.routingRules]
  );

  const schedulePreview = useCallback(
    (nextAnswers: WorkflowAnswersState) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runPreview(nextAnswers);
      }, PREVIEW_DEBOUNCE_MS);
    },
    [runPreview]
  );

  useEffect(() => {
    lastMatchedRuleId.current = null;
    setAnswers({});
    setPreview(null);
    setPreviewError("");
    setSubmitError("");
    setSubmitting(false);
  }, [orderId]);

  useEffect(() => {
    const ruleId = preview?.matchedRoutingRule?.id ?? null;
    if (lastMatchedRuleId.current !== null && lastMatchedRuleId.current !== ruleId) {
      setAnswers((prev) => pruneAnswersAfterRuleChange(prev));
    }
    lastMatchedRuleId.current = ruleId;
  }, [preview?.matchedRoutingRule?.id]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setCoreAnswer = (slug: (typeof CORE_STEP_ORDER)[number], value: string) => {
    setAnswers((prev) => {
      const pruned = pruneAnswersAfterCoreChange(slug, {
        ...prev,
        [slug]: value || undefined,
      });
      schedulePreview(pruned);
      return pruned;
    });
  };

  const setAnswer = (key: string, value: string | string[] | boolean) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      schedulePreview(next);
      return next;
    });
  };

  const clientMatchedRule = useMemo(
    () => findMatchingAgentRoutingRule(active.routingRules, answers),
    [active.routingRules, answers]
  );

  const followUpQuestions =
    clientMatchedRule?.followUpQuestions?.length
      ? clientMatchedRule.followUpQuestions
      : preview?.matchedRoutingRule?.followUpQuestions ?? [];

  const visibleFollowUps = followUpQuestions.filter((q) => isFollowUpQuestionVisible(q, answers));

  const visibleSteps = new Set(preview?.visibleSteps ?? []);
  const req = preview?.requiredConfirmations;

  const showRetrigger =
    visibleSteps.has("retrigger_confirmation") || req?.requiresRetriggerConfirmation;
  const showReplacement =
    visibleSteps.has("replacement_order_number") || req?.requiresReplacementOrderNumber;
  const showReship =
    visibleSteps.has("processed_reship_confirmation") || req?.requiresProcessedReship;
  const showItNote = visibleSteps.has("it_escalation_note") || req?.requiresItEscalation;

  const itPrompt =
    preview?.matchedRoutingRule && req?.requiresItEscalation
      ? active.routingRules.find((r) => r.id === preview.matchedRoutingRule?.id)?.itEscalationPrompt
      : null;

  const submitReady = canSubmitAgentWorkflow({
    answers,
    preview,
    previewLoading,
    previewError,
    followUpQuestions,
  });

  const handleSubmit = async () => {
    if (submitting || previewLoading) return;

    if (!submitReady) {
      setSubmitError("Complete all required answers and wait for a valid routing preview.");
      previewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = buildPreviewAnswersPayload(answers, {
        routingRules: active.routingRules,
      });
      const result = await submitAgentWodIvcsWorkflow(orderId, payload);
      onSubmitSuccess(result);
    } catch (e) {
      setSubmitError(formatAgentWorkflowSubmitError(e));
      if (
        e instanceof AgentWodIvcsApiError &&
        ["INVALID_QUEUE_FOR_SUBMIT", "NOT_ASSIGNED_TO_ACTOR", "ORDER_NOT_FOUND"].includes(
          e.code ?? ""
        )
      ) {
        onSubmitStale?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-5 space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-white">Guided routing workflow</h4>
        <p className="text-xs text-white/50 mt-1">
          Answer the questions below. Options come from the published Routing Matrix (v
          {active.version.version}
          {active.version.publishedAt
            ? ` · published ${new Date(active.version.publishedAt).toLocaleDateString()}`
            : ""}
          ).
        </p>
      </div>

      <div className="space-y-4">
        {coreSteps.map((step) => {
          const options =
            step.slug === "fix_type"
              ? filterFixTypeCatalogOptions(
                  getStepOptions(step),
                  active.routingRules,
                  answers
                )
              : getStepOptions(step);

          const value = typeof answers[step.slug] === "string" ? answers[step.slug] : "";

          return (
            <SelectField
              key={step.id}
              label={stepDisplayLabel(step)}
              helpText={step.helpText}
              value={value}
              options={options}
              onChange={(v) =>
                setCoreAnswer(step.slug as (typeof CORE_STEP_ORDER)[number], v)
              }
            />
          );
        })}
      </div>

      {(previewLoading || preview || previewError) && (
        <div
          ref={previewPanelRef}
          className="rounded-lg border border-white/10 bg-neutral-900/80 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-white/45">
              Routing preview
            </span>
            {previewLoading && (
              <span className="text-xs text-sky-300/90 animate-pulse">Updating…</span>
            )}
          </div>

          {previewError && <p className="text-sm text-rose-200/90">{previewError}</p>}

          {preview && !previewError && (
            <>
              {preview.matchedRoutingRule ? (
                <div className="space-y-1">
                  <p className="text-sm text-white/85">
                    <span className="text-white/50">Matched path: </span>
                    {preview.matchedRoutingRule.label?.trim() || "Routing rule"}
                  </p>
                  <p className="text-sm text-white/85">
                    <span className="text-white/50">Predicted queue: </span>
                    <span className="font-medium text-sky-200">
                      {labelFor(operationalQueueLabel, preview.predictedTargetQueue)}
                    </span>
                  </p>
                  {preview.matchedOutcome.name && (
                    <p className="text-xs text-white/45">
                      Outcome: {preview.matchedOutcome.name}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-amber-200/90">
                  No matching routing path found yet. Check the selected answers.
                </p>
              )}

              {preview.validation.errors.length > 0 && (
                <ul className="text-sm text-amber-200/90 space-y-1 list-disc pl-4">
                  {preview.validation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}

              {preview.validation.valid && preview.matchedRoutingRule && (
                <p className="text-xs text-emerald-300/90">Path looks complete for preview.</p>
              )}
            </>
          )}
        </div>
      )}

      {visibleFollowUps.length > 0 && (
        <div className="space-y-4 border-t border-white/10 pt-5">
          <h5 className="text-sm font-medium text-white">Follow-up questions</h5>
          {visibleFollowUps.map((q) => (
            <FollowUpQuestionField
              key={q.id}
              question={q}
              allQuestions={followUpQuestions}
              answers={answers}
              onAnswerChange={setAnswer}
            />
          ))}
        </div>
      )}

      {(showRetrigger || showReplacement || showReship || showItNote) && (
        <div className="space-y-4 border-t border-white/10 pt-5">
          <h5 className="text-sm font-medium text-white">Required confirmations</h5>

          {showRetrigger && (
            <label className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-neutral-950/60 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={answers.retrigger_confirmation === true}
                onChange={(e) => setAnswer("retrigger_confirmation", e.target.checked)}
                className="mt-0.5 rounded border-white/30"
              />
              <span className="text-sm text-white/90">
                {labelFor(agentFlowStepLabel, "retrigger_confirmation")}
                <span className="block text-xs text-white/45 mt-0.5">
                  Confirm you have re-triggered the cash sale as required for this fix type.
                </span>
              </span>
            </label>
          )}

          {showReplacement && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-white">
                {labelFor(agentFlowStepLabel, "replacement_order_number")}
              </span>
              <input
                type="text"
                value={
                  typeof answers.replacement_order_number === "string"
                    ? answers.replacement_order_number
                    : ""
                }
                onChange={(e) => setAnswer("replacement_order_number", e.target.value)}
                className="rounded-lg bg-neutral-800 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                placeholder="Enter replacement order number…"
              />
            </label>
          )}

          {showReship && (
            <label className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-neutral-950/60 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={answers.processed_reship_confirmation === true}
                onChange={(e) => setAnswer("processed_reship_confirmation", e.target.checked)}
                className="mt-0.5 rounded border-white/30"
              />
              <span className="text-sm text-white/90">
                {labelFor(agentFlowStepLabel, "processed_reship_confirmation")}
                <span className="block text-xs text-white/45 mt-0.5">
                  Confirm the processed reship step is complete.
                </span>
              </span>
            </label>
          )}

          {showItNote && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-white">
                {labelFor(agentFlowStepLabel, "it_escalation_note")}
              </span>
              {itPrompt && <span className="text-xs text-white/50">{itPrompt}</span>}
              <textarea
                value={
                  typeof answers.it_escalation_note === "string" ? answers.it_escalation_note : ""
                }
                rows={3}
                onChange={(e) => setAnswer("it_escalation_note", e.target.value)}
                className="rounded-lg bg-neutral-800 border border-white/15 px-3 py-2 text-sm text-white resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                placeholder="Describe the IT escalation…"
              />
            </label>
          )}
        </div>
      )}

      <div className="border-t border-white/10 pt-4 space-y-3">
        {submitError && (
          <p className="text-sm text-rose-200/90 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}

        <button
          type="button"
          disabled={!submitReady || submitting || previewLoading}
          onClick={() => void handleSubmit()}
          className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
            submitReady && !submitting && !previewLoading
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/30"
              : "bg-neutral-800 text-white/40 ring-1 ring-white/10 cursor-not-allowed"
          }`}
        >
          {submitting ? "Submitting…" : "Complete and route order"}
        </button>

        {!submitReady && !submitting && (
          <p className="text-xs text-white/45 text-center">
            Complete all required answers and resolve preview validation to enable submit.
          </p>
        )}
      </div>
    </div>
  );
}
