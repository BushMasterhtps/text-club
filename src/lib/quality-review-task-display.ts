/**
 * Ordered Task scalar fields for Quality Review context (manager UI).
 * Excludes id / taskType / endTime / disposition / text (shown in primary blocks).
 */
export const QUALITY_REVIEW_TASK_METADATA_ORDER: string[] = [
  "status",
  "brand",
  "phone",
  "email",
  "customerName",
  "sfOrderNumber",
  "sfCaseNumber",
  "salesforceCaseNumber",
  "documentNumber",
  "wodIvcsSource",
  "warehouseEdgeStatus",
  "webOrder",
  "webOrderSubtotal",
  "webOrderTotal",
  "webOrderDifference",
  "webTotal",
  "netSuiteTotal",
  "nsVsWebDiscrepancy",
  "webVsNsDifference",
  "amount",
  "purchaseDate",
  "shippingCountry",
  "shippingState",
  "startTime",
  "durationSec",
  "assistancePausedDurationSec",
  "assistanceNotes",
  "managerResponse",
  "assistanceRequestedAt",
  "sentBackDisposition",
  "sentBackAt",
  "completedAt",
  "completionTime",
  "emailRequestFor",
  "details",
  "timestamp",
  "customerNameNumber",
  "salesOrderId",
  "orderDate",
  "amountToBeRefunded",
  "verifiedRefund",
  "paymentMethod",
  "refundReason",
  "productSku",
  "quantity",
  "refundAmount",
  "holdsOrderDate",
  "holdsOrderNumber",
  "holdsCustomerEmail",
  "holdsPriority",
  "holdsDaysInSystem",
  "holdsStatus",
  "holdsPhoneNumber",
  "holdsOrderAmount",
  "holdsNotes",
  "yotpoDateSubmitted",
  "yotpoPrOrYotpo",
  "yotpoCustomerName",
  "yotpoEmail",
  "yotpoOrderDate",
  "yotpoProduct",
  "yotpoIssueTopic",
  "yotpoReviewDate",
  "yotpoReview",
  "yotpoSfOrderLink",
  "yotpoImportSource",
  "yotpoSubmittedBy",
  "createdAt",
  "updatedAt",
];

const NESTED_KEYS = new Set([
  "rawMessage",
  "assignedTo",
  "completedByUser",
  "qaSampleBatchTasks",
  "qaTaskReviews",
  "history",
  "labels",
  "assistance",
]);

const PRIMARY_KEYS = new Set([
  "id",
  "taskType",
  "endTime",
  "disposition",
  "text",
  "rawMessage",
  "assignedTo",
  "completedByUser",
]);

export function humanizeFieldKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return spaced.replace(/^\w/, (c) => c.toUpperCase()).trim();
}

export function formatTaskScalarForDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();
  return "";
}

export function buildOrderedMetadataRows(
  task: Record<string, unknown>,
  skipKeys?: ReadonlySet<string>
): Array<{ key: string; label: string; value: string }> {
  const rows: Array<{ key: string; label: string; value: string }> = [];
  const seen = new Set<string>();

  for (const key of QUALITY_REVIEW_TASK_METADATA_ORDER) {
    if (skipKeys?.has(key)) continue;
    if (!(key in task)) continue;
    const raw = task[key];
    const str = formatTaskScalarForDisplay(raw);
    if (!str) continue;
    rows.push({ key, label: humanizeFieldKey(key), value: str });
    seen.add(key);
  }

  const restKeys = Object.keys(task)
    .filter(
      (k) =>
        !seen.has(k) &&
        !skipKeys?.has(k) &&
        !PRIMARY_KEYS.has(k) &&
        !NESTED_KEYS.has(k) &&
        k !== "lines" &&
        k !== "review"
    )
    .sort((a, b) => a.localeCompare(b));

  for (const key of restKeys) {
    if (skipKeys?.has(key)) continue;
    const raw = task[key];
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "object") continue;
    const str = formatTaskScalarForDisplay(raw);
    if (!str) continue;
    rows.push({ key, label: humanizeFieldKey(key), value: str });
  }

  return rows;
}
