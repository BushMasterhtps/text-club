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
