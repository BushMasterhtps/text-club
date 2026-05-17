import { getColumnValue } from "./csv";

export function isAgingFivePlusFromRow(row: Record<string, string>): {
  isFivePlus: boolean;
  dateRange: string | null;
  daysOld: number | null;
} {
  const dateRange =
    getColumnValue(row, ["DateRange", "Date Range", "date_range"]) ?? null;
  const daysRaw = getColumnValue(row, [
    "Days_old_invalid_CashSale",
    "Days Old Invalid Cash Sale",
    "days_old_invalid_cashsale",
  ]);
  let daysOld: number | null = null;
  if (daysRaw != null) {
    const n = parseInt(String(daysRaw).replace(/[^\d-]/g, ""), 10);
    if (!isNaN(n)) daysOld = n;
  }

  const rangeFivePlus =
    dateRange != null && dateRange.trim().toLowerCase().replace(/\s+/g, " ") === "5+ days";
  const daysFivePlus = daysOld != null && daysOld >= 5;

  return {
    isFivePlus: rangeFivePlus || daysFivePlus,
    dateRange,
    daysOld,
  };
}
