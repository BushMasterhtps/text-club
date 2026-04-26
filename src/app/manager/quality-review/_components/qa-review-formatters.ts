/** Must match API / eligibility filter for null/empty disposition. */
export const DISPOSITION_NONE = "__NONE__";

export const NO_DISPOSITION_LABEL = "No disposition";

export function formatDispositionDisplay(value: string | null | undefined): string {
  if (value == null || value === "") return NO_DISPOSITION_LABEL;
  if (value === DISPOSITION_NONE) return NO_DISPOSITION_LABEL;
  return value;
}

export function formatCompletedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

/**
 * Different task workflows stamp completion on different columns; QA should show the best
 * available timestamp without guessing timezone semantics beyond ISO parsing.
 */
export function resolveTaskCompletedAtIso(task: Record<string, unknown>): string | null {
  for (const key of ["endTime", "completedAt", "completionTime"] as const) {
    const v = task[key];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}
