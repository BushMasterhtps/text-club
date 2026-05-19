import { getColumnValue } from "./csv";

export type AgentOrderSynopsisRow = {
  label: string;
  value: string;
};

function snapshotStrings(json: unknown): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(json as Record<string, unknown>)) {
    if (raw == null || typeof raw === "object") continue;
    const s = String(raw).trim();
    if (s) out[key] = s;
  }
  return out;
}

function formatCurrency(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

export type AgentOrderSynopsisInput = {
  documentNumber: string;
  customerName: string | null;
  customerEmail: string | null;
  netSuiteDaysOld: number | null;
  agingIsFivePlus: boolean;
  latestNetSuiteSnapshotJson: unknown;
  latestAgingSnapshotJson: unknown;
};

/**
 * Human-readable order summary for agent workflow panel (no raw JSON).
 */
export function buildAgentOrderSynopsis(input: AgentOrderSynopsisInput): AgentOrderSynopsisRow[] {
  const ns = snapshotStrings(input.latestNetSuiteSnapshotJson);
  const ag = snapshotStrings(input.latestAgingSnapshotJson);

  const customerName =
    input.customerName?.trim() ||
    getColumnValue(ns, ["Name", "Customer", "Customer Name"]) ||
    getColumnValue(ag, ["Customer", "Name"]);
  const customerEmail =
    input.customerEmail?.trim() ||
    getColumnValue(ns, ["Email", "E-mail"]) ||
    getColumnValue(ag, ["Email", "E-mail"]);
  const brand = getColumnValue(ns, ["Brand"]);
  const subsidiary = getColumnValue(ag, ["Subsidiary"]);
  const orderAmount = formatCurrency(
    getColumnValue(ns, ["Amount"]) ?? getColumnValue(ag, ["Amount", "Line Amount", "Item Amount"])
  );
  const webTotal = formatCurrency(getColumnValue(ns, ["Web Total", "Web total"]));
  const webDifference = formatCurrency(
    getColumnValue(ns, ["Web total Difference", "Web Total Difference", "Difference"])
  );
  const warehouseStatus = getColumnValue(ns, [
    "Warehouse Edge Status",
    "Warehouse Status",
    "WMS Status",
  ]);
  const orderProcessingStatus = getColumnValue(ns, ["Order Processing Status"]);
  const netSuiteDate = getColumnValue(ns, [
    "Date Ordered",
    "Date",
    "Order Date",
    "Date Created",
    "Last Modified",
  ]);
  const agingDateRange = getColumnValue(ag, ["DateRange", "Date Range"]);
  const agingDaysOld = getColumnValue(ag, [
    "Days_old_invalid_CashSale",
    "Days Old Invalid Cash Sale",
    "Days Old",
  ]);

  const rows: AgentOrderSynopsisRow[] = [
    { label: "Document #", value: input.documentNumber },
  ];

  if (customerName) rows.push({ label: "Customer", value: customerName });
  if (customerEmail) rows.push({ label: "Email", value: customerEmail });
  if (brand) rows.push({ label: "Brand", value: brand });
  if (subsidiary) rows.push({ label: "Subsidiary", value: subsidiary });
  if (orderAmount) rows.push({ label: "Order amount", value: orderAmount });
  if (webTotal) rows.push({ label: "NetSuite / web total", value: webTotal });
  if (webDifference) rows.push({ label: "Difference / discrepancy", value: webDifference });
  if (warehouseStatus) rows.push({ label: "Warehouse Edge status", value: warehouseStatus });
  if (orderProcessingStatus) {
    rows.push({ label: "Order processing status", value: orderProcessingStatus });
  }
  if (netSuiteDate) rows.push({ label: "NetSuite order date", value: netSuiteDate });
  if (agingDateRange) rows.push({ label: "Aging date range", value: agingDateRange });
  if (agingDaysOld) rows.push({ label: "Aging days (invalid cash sale)", value: agingDaysOld });
  if (input.netSuiteDaysOld != null) {
    rows.push({ label: "NetSuite days old", value: `${input.netSuiteDaysOld} day${input.netSuiteDaysOld === 1 ? "" : "s"}` });
  }
  if (input.agingIsFivePlus) {
    rows.push({ label: "Aging urgency", value: "5+ days (urgent)" });
  }

  return rows;
}
