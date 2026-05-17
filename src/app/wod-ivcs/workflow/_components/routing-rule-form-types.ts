import type { RoutingRuleInput } from "@/lib/wod-ivcs/routing-matrix-service";
import type { RoutingRule } from "@/lib/wod-ivcs/routing-matrix-api-client";
import {
  buildFollowUpMetadata,
  extractFollowUpQuestionsFromRule,
  syncLegacySubDispositionFields,
  validateFollowUpQuestions,
  type FollowUpQuestion,
} from "@/lib/wod-ivcs/follow-up-questions";

export type SharedPathForm = {
  rootCauseOptionId: string;
  cashSaleExistsOptionId: string;
  merchantOptionId: string;
};

export type FixTypeRuleSettings = {
  followUpQuestionsRequired: boolean;
  followUpQuestions: FollowUpQuestion[];
  requiresRetriggerConfirmation: boolean;
  requiresItEscalation: boolean;
  requiresReplacementOrderNumber: boolean;
  requiresProcessedReship: boolean;
  itEscalationPrompt: string;
  targetQueue: string;
  dropOffBehavior: string;
  isActive: boolean;
};

export type RuleFormState = SharedPathForm & {
  fixTypeOptionId: string;
  preservedMetadata?: Record<string, unknown>;
} & FixTypeRuleSettings;

export type BatchSaveFailure = {
  fixTypeLabel: string;
  message: string;
};

export type BatchSaveResult = {
  successCount: number;
  failures: BatchSaveFailure[];
};

export function defaultFixTypeSettings(): FixTypeRuleSettings {
  return {
    followUpQuestionsRequired: false,
    followUpQuestions: [],
    requiresRetriggerConfirmation: false,
    requiresItEscalation: false,
    requiresReplacementOrderNumber: false,
    requiresProcessedReship: false,
    itEscalationPrompt: "",
    targetQueue: "NEEDS_ACTION",
    dropOffBehavior: "NO_AUTOMATIC_CHANGE",
    isActive: true,
  };
}

export function emptyForm(): RuleFormState {
  return {
    rootCauseOptionId: "",
    cashSaleExistsOptionId: "",
    merchantOptionId: "",
    fixTypeOptionId: "",
    ...defaultFixTypeSettings(),
  };
}

function preservedMetadataFromRule(rule: RoutingRule): Record<string, unknown> | undefined {
  if (!rule.metadataJson || typeof rule.metadataJson !== "object" || Array.isArray(rule.metadataJson)) {
    return undefined;
  }
  const copy = { ...(rule.metadataJson as Record<string, unknown>) };
  delete copy.followUpQuestions;
  return Object.keys(copy).length > 0 ? copy : undefined;
}

export function fromRule(rule: RoutingRule | null): RuleFormState {
  if (!rule) return emptyForm();

  const followUpQuestions = extractFollowUpQuestionsFromRule({
    metadataJson: rule.metadataJson,
    subDispositionRequired: rule.subDispositionRequired,
    subDispositionQuestion: rule.subDispositionQuestion,
    subDispositionOptions: rule.subDispositionOptions.map((o) => ({
      label: o.label,
      isActive: o.isActive,
    })),
  });

  return {
    rootCauseOptionId: rule.rootCauseOptionId ?? "",
    cashSaleExistsOptionId: rule.cashSaleExistsOptionId ?? "",
    merchantOptionId: rule.merchantOptionId ?? "",
    fixTypeOptionId: rule.fixTypeOptionId ?? "",
    preservedMetadata: preservedMetadataFromRule(rule),
    followUpQuestionsRequired:
      rule.subDispositionRequired || followUpQuestions.length > 0,
    followUpQuestions,
    requiresRetriggerConfirmation: rule.requiresRetriggerConfirmation,
    requiresItEscalation: rule.requiresItEscalation,
    requiresReplacementOrderNumber: rule.requiresReplacementOrderNumber,
    requiresProcessedReship: rule.requiresProcessedReship,
    itEscalationPrompt: rule.itEscalationPrompt ?? "",
    targetQueue: rule.targetQueue,
    dropOffBehavior: rule.dropOffBehavior,
    isActive: rule.isActive,
  };
}

export function toRoutingRuleInput(
  shared: SharedPathForm,
  fixTypeOptionId: string | null,
  settings: FixTypeRuleSettings,
  preservedMetadata?: Record<string, unknown>
): RoutingRuleInput {
  const isCatchAll = !shared.rootCauseOptionId && !fixTypeOptionId;
  const questions = settings.followUpQuestionsRequired ? settings.followUpQuestions : [];
  const legacy = syncLegacySubDispositionFields(questions);

  const baseMeta: Record<string, unknown> = { ...(preservedMetadata ?? {}) };
  if (isCatchAll) {
    baseMeta.isCatchAll = true;
  }

  const metadataJson = buildFollowUpMetadata(questions, baseMeta);
  const hasMetadata = Object.keys(metadataJson).length > 0;

  return {
    rootCauseOptionId: shared.rootCauseOptionId || null,
    cashSaleExistsOptionId: shared.cashSaleExistsOptionId || null,
    merchantOptionId: shared.merchantOptionId || null,
    fixTypeOptionId,
    subDispositionRequired: legacy.subDispositionRequired,
    subDispositionQuestion: legacy.subDispositionQuestion,
    subDispositionOptions: legacy.subDispositionOptions,
    requiresRetriggerConfirmation: settings.requiresRetriggerConfirmation,
    requiresItEscalation: settings.requiresItEscalation,
    requiresReplacementOrderNumber: settings.requiresReplacementOrderNumber,
    requiresProcessedReship: settings.requiresProcessedReship,
    itEscalationPrompt: settings.requiresItEscalation ? settings.itEscalationPrompt : null,
    targetQueue: settings.targetQueue as RoutingRuleInput["targetQueue"],
    dropOffBehavior: settings.dropOffBehavior as RoutingRuleInput["dropOffBehavior"],
    isActive: settings.isActive,
    metadataJson: hasMetadata ? metadataJson : undefined,
  };
}

export function toInput(form: RuleFormState): RoutingRuleInput {
  const {
    rootCauseOptionId,
    cashSaleExistsOptionId,
    merchantOptionId,
    fixTypeOptionId,
    preservedMetadata,
    ...settings
  } = form;
  return toRoutingRuleInput(
    { rootCauseOptionId, cashSaleExistsOptionId, merchantOptionId },
    fixTypeOptionId || null,
    settings,
    preservedMetadata
  );
}

export function validateFixTypeSettings(
  settings: FixTypeRuleSettings,
  fixTypeLabel: string
): string | null {
  if (!settings.followUpQuestionsRequired) return null;
  if (settings.followUpQuestions.length === 0) {
    return `${fixTypeLabel}: add at least one follow-up question.`;
  }
  return validateFollowUpQuestions(settings.followUpQuestions, fixTypeLabel);
}
