import type { OrderMutationSkip } from "./wod-ivcs-queue-config";

export type SelectedOrderLabel = {
  documentNumber: string;
  customerName: string | null;
};

export const BULK_SKIPPED_LIST_MAX_VISIBLE = 10;

export function buildSelectedOrderLabelMap(
  orders: Array<{ id: string; documentNumber: string; customerName: string | null }>,
  selectedIds: Set<string>
): Map<string, SelectedOrderLabel> {
  const map = new Map<string, SelectedOrderLabel>();
  for (const order of orders) {
    if (selectedIds.has(order.id)) {
      map.set(order.id, {
        documentNumber: order.documentNumber,
        customerName: order.customerName,
      });
    }
  }
  return map;
}

function orderWord(count: number): string {
  return count === 1 ? "order" : "orders";
}

export function formatBulkMutationMessage(input: {
  verb: "Assigned" | "Unassigned" | "Moved";
  succeeded: number;
  selectedTotal: number;
  skippedCount: number;
  detail?: string;
}): { text: string; tone: "success" | "info" } {
  const { verb, succeeded, selectedTotal, skippedCount, detail } = input;
  const detailSuffix = detail ? ` ${detail}` : "";
  let text = `${verb} ${succeeded} of ${selectedTotal} selected ${orderWord(selectedTotal)}${detailSuffix}.`;
  if (skippedCount > 0) {
    text += ` ${skippedCount} were skipped.`;
  }
  return { text, tone: skippedCount > 0 ? "info" : "success" };
}

export function formatBulkMutationError(action: "assignment" | "unassignment" | "move", message: string): string {
  const label =
    action === "assignment" ? "Bulk assignment" : action === "unassignment" ? "Bulk unassignment" : "Bulk move";
  return `${label} failed: ${message}`;
}

export function skippedOrderDisplayLabel(
  skip: OrderMutationSkip,
  labelByOrderId: Map<string, SelectedOrderLabel>
): string {
  const meta = labelByOrderId.get(skip.orderId);
  const doc = meta?.documentNumber?.trim();
  if (doc) return doc;
  return skip.orderId;
}
