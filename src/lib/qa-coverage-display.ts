/** Human-readable labels for `QaCoverageDisplayStatus` in Team Analytics / scorecard UI. */

export const QA_COVERAGE_STATUS_LABEL: Record<string, string> = {
  exempt: "Exempt",
  no_eligible_work: "No eligible work",
  complete: "At target",
  below: "Below target",
  none: "No reviews",
};

export function formatQaCoverageStatus(s: string | null | undefined): string {
  if (s == null || s === "") return "—";
  return QA_COVERAGE_STATUS_LABEL[s] ?? s;
}
