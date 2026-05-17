"use client";

import { SmallButton } from "@/app/_components/SmallButton";
import {
  FOLLOW_UP_QUESTION_TYPE_LABEL,
  defaultFollowUpQuestion,
  formatShowWhenLabel,
  newFollowUpOptionId,
  type FollowUpQuestion,
  type FollowUpQuestionType,
} from "@/lib/wod-ivcs/follow-up-questions";
import { inputClass, selectClass, textareaClass } from "./shared";

type Props = {
  enabled: boolean;
  questions: FollowUpQuestion[];
  onEnabledChange: (enabled: boolean) => void;
  onQuestionsChange: (questions: FollowUpQuestion[]) => void;
};

export function FollowUpQuestionsBuilder({
  enabled,
  questions,
  onEnabledChange,
  onQuestionsChange,
}: Props) {
  const updateQuestion = (index: number, next: FollowUpQuestion) => {
    const copy = [...questions];
    copy[index] = next;
    onQuestionsChange(copy);
  };

  const addQuestion = () => {
    onQuestionsChange([...questions, defaultFollowUpQuestion("single_select")]);
  };

  const removeQuestion = (index: number) => {
    onQuestionsChange(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= questions.length) return;
    const copy = [...questions];
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
    onQuestionsChange(copy);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-sky-300/90 uppercase tracking-wide">
        Follow-up questions
      </p>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const on = e.target.checked;
            onEnabledChange(on);
            if (on && questions.length === 0) {
              onQuestionsChange([defaultFollowUpQuestion("single_select")]);
            }
            if (!on) {
              onQuestionsChange([]);
            }
          }}
        />
        Follow-up questions required?
      </label>

      {enabled && (
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div
              key={q.id}
              className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3"
            >
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="text-sm font-medium text-white/90">Question {qi + 1}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-white/50 hover:text-white"
                    disabled={qi === 0}
                    onClick={() => moveQuestion(qi, "up")}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="text-xs text-white/50 hover:text-white"
                    disabled={qi === questions.length - 1}
                    onClick={() => moveQuestion(qi, "down")}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300"
                    onClick={() => removeQuestion(qi)}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm text-white/70">Question for agent</span>
                <textarea
                  className={textareaClass}
                  rows={2}
                  value={q.question}
                  onChange={(e) => updateQuestion(qi, { ...q, question: e.target.value })}
                  placeholder="e.g. What affected the order?"
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-sm text-white/70">Question type</span>
                  <select
                    className={selectClass}
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as FollowUpQuestionType;
                      const next: FollowUpQuestion = {
                        ...q,
                        type,
                        options:
                          type === "text"
                            ? []
                            : q.options.length > 0
                              ? q.options
                              : [{ id: newFollowUpOptionId(), label: "" }],
                      };
                      updateQuestion(qi, next);
                    }}
                  >
                    {(Object.keys(FOLLOW_UP_QUESTION_TYPE_LABEL) as FollowUpQuestionType[]).map(
                      (t) => (
                        <option key={t} value={t}>
                          {FOLLOW_UP_QUESTION_TYPE_LABEL[t]}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-white/80 self-end pb-2">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(qi, { ...q, required: e.target.checked })}
                  />
                  Required for agent
                </label>
              </div>

              {(q.type === "single_select" || q.type === "multi_select") && (
                <div className="space-y-2">
                  <p className="text-xs text-white/50">Answer choices</p>
                  {q.options.map((opt, oi) => (
                    <div key={opt.id} className="flex flex-wrap gap-2 items-center">
                      <input
                        className={`${inputClass} flex-1 min-w-[160px]`}
                        value={opt.label}
                        onChange={(e) => {
                          const options = [...q.options];
                          options[oi] = { ...options[oi], label: e.target.value };
                          updateQuestion(qi, { ...q, options });
                        }}
                        placeholder="Answer label"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-white/60 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={opt.requiresNotes === true}
                          onChange={(e) => {
                            const options = [...q.options];
                            options[oi] = {
                              ...options[oi],
                              requiresNotes: e.target.checked,
                            };
                            updateQuestion(qi, { ...q, options });
                          }}
                        />
                        Require notes if Other is selected
                      </label>
                      <button
                        type="button"
                        className="text-xs text-red-400 px-1"
                        onClick={() =>
                          updateQuestion(qi, {
                            ...q,
                            options: q.options.filter((_, j) => j !== oi),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <SmallButton
                    type="button"
                    className="text-xs"
                    onClick={() =>
                      updateQuestion(qi, {
                        ...q,
                        options: [...q.options, { id: newFollowUpOptionId(), label: "" }],
                      })
                    }
                  >
                    + Add answer choice
                  </SmallButton>
                </div>
              )}

              {qi > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={Boolean(q.showWhen?.questionId)}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          updateQuestion(qi, { ...q, showWhen: null });
                          return;
                        }
                        const prior = questions[qi - 1];
                        const firstAnswer = prior.options.find((o) => o.label.trim());
                        updateQuestion(qi, {
                          ...q,
                          showWhen: {
                            questionId: prior.id,
                            operator: "equals",
                            value: firstAnswer?.label.trim() ?? "",
                          },
                        });
                      }}
                    />
                    Show only when
                  </label>
                  {q.showWhen?.questionId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
                      <label className="block space-y-1">
                        <span className="text-xs text-white/50">Previous question</span>
                        <select
                          className={selectClass}
                          value={q.showWhen.questionId}
                          onChange={(e) => {
                            const prior = questions.find((x) => x.id === e.target.value);
                            const firstAnswer = prior?.options.find((o) => o.label.trim());
                            updateQuestion(qi, {
                              ...q,
                              showWhen: {
                                questionId: e.target.value,
                                operator: "equals",
                                value: firstAnswer?.label.trim() ?? "",
                              },
                            });
                          }}
                        >
                          {questions.slice(0, qi).map((pq) => (
                            <option key={pq.id} value={pq.id}>
                              {pq.question.trim() || "Untitled question"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-white/50">Equals answer</span>
                        <select
                          className={selectClass}
                          value={q.showWhen.value}
                          onChange={(e) =>
                            updateQuestion(qi, {
                              ...q,
                              showWhen: {
                                questionId: q.showWhen!.questionId,
                                operator: "equals",
                                value: e.target.value,
                              },
                            })
                          }
                        >
                          {(
                            questions
                              .find((x) => x.id === q.showWhen?.questionId)
                              ?.options.filter((o) => o.label.trim()) ?? []
                          ).map((o) => (
                            <option key={o.id} value={o.label}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {q.showWhen && (
                        <p className="md:col-span-2 text-xs text-white/40">
                          Agents will only see this when:{" "}
                          {formatShowWhenLabel(q.showWhen, questions)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <SmallButton type="button" onClick={addQuestion} className="text-xs bg-white/10 hover:bg-white/20">
            + Add follow-up question
          </SmallButton>
        </div>
      )}
    </div>
  );
}
