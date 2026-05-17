/**
 * Follow-up question config stored in routing rule metadataJson.followUpQuestions.
 * Legacy subDisposition* fields mirror the first select question for backwards compatibility.
 */

export type FollowUpQuestionType = "single_select" | "multi_select" | "text";

export type FollowUpAnswerOption = {
  id: string;
  label: string;
  requiresNotes?: boolean;
};

export type FollowUpShowWhen = {
  questionId: string;
  operator: "equals";
  value: string;
};

export type FollowUpQuestion = {
  id: string;
  question: string;
  type: FollowUpQuestionType;
  required: boolean;
  options: FollowUpAnswerOption[];
  showWhen?: FollowUpShowWhen | null;
};

export const FOLLOW_UP_QUESTION_TYPE_LABEL: Record<FollowUpQuestionType, string> = {
  single_select: "Single select",
  multi_select: "Multi select",
  text: "Text / notes",
};

export function newFollowUpQuestionId(): string {
  return `fuq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newFollowUpOptionId(): string {
  return `fuo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultFollowUpQuestion(type: FollowUpQuestionType = "single_select"): FollowUpQuestion {
  return {
    id: newFollowUpQuestionId(),
    question: "",
    type,
    required: true,
    options: type === "text" ? [] : [{ id: newFollowUpOptionId(), label: "" }],
    showWhen: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseQuestion(raw: unknown): FollowUpQuestion | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const type = raw.type as FollowUpQuestionType;
  if (type !== "single_select" && type !== "multi_select" && type !== "text") return null;

  const options: FollowUpAnswerOption[] = [];
  if (Array.isArray(raw.options)) {
    for (const opt of raw.options) {
      if (!isRecord(opt)) continue;
      const label = typeof opt.label === "string" ? opt.label : "";
      if (!label.trim()) continue;
      options.push({
        id: typeof opt.id === "string" ? opt.id : newFollowUpOptionId(),
        label,
        requiresNotes: opt.requiresNotes === true,
      });
    }
  }

  let showWhen: FollowUpShowWhen | null = null;
  if (isRecord(raw.showWhen) && typeof raw.showWhen.questionId === "string") {
    showWhen = {
      questionId: raw.showWhen.questionId,
      operator: "equals",
      value: typeof raw.showWhen.value === "string" ? raw.showWhen.value : "",
    };
  }

  return {
    id: raw.id,
    question: typeof raw.question === "string" ? raw.question : "",
    type,
    required: raw.required !== false,
    options,
    showWhen,
  };
}

export function parseFollowUpQuestionsFromMetadata(metadataJson: unknown): FollowUpQuestion[] | null {
  if (!isRecord(metadataJson) || !Array.isArray(metadataJson.followUpQuestions)) {
    return null;
  }
  const parsed: FollowUpQuestion[] = [];
  for (const item of metadataJson.followUpQuestions) {
    const q = parseQuestion(item);
    if (q) parsed.push(q);
  }
  return parsed.length > 0 ? parsed : null;
}

export function legacyToFollowUpQuestions(input: {
  subDispositionRequired: boolean;
  subDispositionQuestion: string | null;
  subDispositionOptions: Array<{ label: string; isActive?: boolean }>;
}): FollowUpQuestion[] {
  if (!input.subDispositionRequired) return [];
  return [
    {
      id: newFollowUpQuestionId(),
      question: input.subDispositionQuestion?.trim() ?? "",
      type: "single_select",
      required: true,
      options: input.subDispositionOptions
        .filter((o) => o.isActive !== false && o.label.trim())
        .map((o) => ({ id: newFollowUpOptionId(), label: o.label, requiresNotes: false })),
      showWhen: null,
    },
  ];
}

export function extractFollowUpQuestionsFromRule(input: {
  metadataJson: unknown;
  subDispositionRequired: boolean;
  subDispositionQuestion: string | null;
  subDispositionOptions: Array<{ label: string; isActive?: boolean }>;
}): FollowUpQuestion[] {
  const fromMeta = parseFollowUpQuestionsFromMetadata(input.metadataJson);
  if (fromMeta) return fromMeta;
  return legacyToFollowUpQuestions(input);
}

export function hasFollowUpQuestions(questions: FollowUpQuestion[]): boolean {
  return questions.length > 0;
}

/** Sync first single/multi select question to legacy DB fields. */
export function syncLegacySubDispositionFields(questions: FollowUpQuestion[]): {
  subDispositionRequired: boolean;
  subDispositionQuestion: string | null;
  subDispositionOptions: Array<{ label: string; isActive: boolean }>;
} {
  if (questions.length === 0) {
    return {
      subDispositionRequired: false,
      subDispositionQuestion: null,
      subDispositionOptions: [],
    };
  }

  const firstSelect = questions.find((q) => q.type === "single_select" || q.type === "multi_select");
  if (!firstSelect) {
    return {
      subDispositionRequired: true,
      subDispositionQuestion: questions[0]?.question?.trim() || null,
      subDispositionOptions: [],
    };
  }

  return {
    subDispositionRequired: true,
    subDispositionQuestion: firstSelect.question.trim() || null,
    subDispositionOptions: firstSelect.options
      .filter((o) => o.label.trim())
      .map((o) => ({ label: o.label.trim(), isActive: true })),
  };
}

export function buildFollowUpMetadata(
  questions: FollowUpQuestion[],
  existingMetadata?: Record<string, unknown>
): Record<string, unknown> {
  const meta = { ...(existingMetadata ?? {}) };
  if (questions.length > 0) {
    meta.followUpQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question.trim(),
      type: q.type,
      required: q.required,
      options: q.options
        .filter((o) => o.label.trim())
        .map((o) => ({
          id: o.id,
          label: o.label.trim(),
          ...(o.requiresNotes ? { requiresNotes: true } : {}),
        })),
      ...(q.showWhen?.questionId && q.showWhen.value
        ? {
            showWhen: {
              questionId: q.showWhen.questionId,
              operator: "equals",
              value: q.showWhen.value,
            },
          }
        : {}),
    }));
  } else {
    delete meta.followUpQuestions;
  }
  return meta;
}

export function formatShowWhenLabel(
  showWhen: FollowUpShowWhen,
  allQuestions: FollowUpQuestion[]
): string {
  const prior = allQuestions.find((q) => q.id === showWhen.questionId);
  const priorLabel = prior?.question?.trim() || "Previous question";
  return `${priorLabel} = ${showWhen.value}`;
}

export function validateFollowUpQuestions(
  questions: FollowUpQuestion[],
  contextLabel: string
): string | null {
  if (questions.length === 0) return null;

  const ids = new Set(questions.map((q) => q.id));

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prefix = `${contextLabel}: Question ${i + 1}`;

    if (!q.question.trim()) {
      return `${prefix} needs question text.`;
    }

    if (q.type === "single_select" || q.type === "multi_select") {
      const opts = q.options.filter((o) => o.label.trim());
      if (opts.length === 0) {
        return `${prefix} needs at least one answer choice.`;
      }
    }

    if (q.showWhen?.questionId) {
      if (!ids.has(q.showWhen.questionId)) {
        return `${prefix} references a question that no longer exists.`;
      }
      const priorIndex = questions.findIndex((x) => x.id === q.showWhen.questionId);
      if (priorIndex < 0 || priorIndex >= i) {
        return `${prefix} can only depend on a question listed above it.`;
      }
      const prior = questions[priorIndex];
      const priorOpts = prior.options.map((o) => o.label.trim());
      if (!priorOpts.includes(q.showWhen.value)) {
        return `${prefix} references an answer that is not in the prior question's choices.`;
      }
    }
  }

  return null;
}

export function ruleHasFollowUpQuestions(input: {
  subDispositionRequired: boolean;
  metadataJson: unknown;
  subDispositionQuestion: string | null;
  subDispositionOptions: Array<{ label: string; isActive?: boolean }>;
}): boolean {
  return getFollowUpQuestionsForRule(input).length > 0;
}

export function getFollowUpQuestionsForRule(input: {
  metadataJson: unknown;
  subDispositionRequired: boolean;
  subDispositionQuestion: string | null;
  subDispositionOptions: Array<{ label: string; isActive?: boolean }>;
}): FollowUpQuestion[] {
  return extractFollowUpQuestionsFromRule(input);
}

export type RoutingRuleFollowUpSource = Parameters<typeof getFollowUpQuestionsForRule>[0];

export function followUpQuestionsSummary(questions: FollowUpQuestion[]): string {
  if (questions.length === 0) return "—";
  if (questions.length === 1) {
    const q = questions[0].question.trim();
    return q ? `${q.slice(0, 36)}${q.length > 36 ? "…" : ""}` : "1 question";
  }
  return `${questions.length} follow-up questions`;
}
