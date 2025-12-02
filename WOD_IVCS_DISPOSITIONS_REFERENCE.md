# WOD/IVCS Dispositions Reference

This document provides a comprehensive reference for all WOD/IVCS dispositions, their financial impact classification, and implementation details.

## Overview

WOD/IVCS (Web Order Discrepancies / Invalid Cash Sales) tasks are imported from three different NetSuite reports and help agents fix order discrepancies before they cause shipping errors or customer issues.

**Financial Impact Categories:**
- **Saved (Positive)**: Order was successfully fixed/completed
- **Lost (Negative)**: Unable to complete or high risk of shipping errors/refunds
- **Neutral**: No financial impact

**Important Note**: "Lost" dispositions don't necessarily mean direct financial loss, but indicate orders with higher risk of not shipping or erroring out if a refund is requested, which negatively impacts customer experience.

---

## Disposition Details

### ✅ SAVED MONEY (Positive Impact)

These dispositions indicate the order was successfully fixed and can proceed to fulfillment.

#### 1. Completed - Fixed Amounts
- **Impact**: Saved
- **Description**: Order amounts were successfully fixed
- **Financial Calculation**: Full order amount counted as "saved"

#### 2. Completed - Added PayPal Payment info
- **Impact**: Saved
- **Description**: PayPal payment information was successfully added
- **Financial Calculation**: Full order amount counted as "saved"

---

### ❌ LOST MONEY (Negative Impact / High Risk)

These dispositions indicate inability to complete the task or high risk of shipping errors and customer issues.

#### 3. Completed - Cannot edit CS
- **Impact**: Lost
- **Description**: Unable to edit Cash Sale, high risk of shipping errors
- **Financial Calculation**: Full order amount counted as "lost"

#### 4. Reviewed / Unable to Complete - Canadian Order / Unable to Edit Sales Order
- **Impact**: Lost
- **Description**: Canadian order could not be edited, unable to complete
- **Financial Calculation**: Full order amount counted as "lost"

#### 5. Reviewed / Unable to Complete - Unable to Edit Cash Sale
- **Impact**: Lost
- **Description**: Cash Sale could not be edited, unable to complete
- **Financial Calculation**: Full order amount counted as "lost"

#### 6. Reviewed / Unable to Complete - Invalid Cash Sale / Not Able to Fix
- **Impact**: Lost
- **Description**: Invalid Cash Sale that could not be fixed
- **Financial Calculation**: Full order amount counted as "lost"

#### 7. Reviewed / Unable to Complete - Unable to Edit Sales Order
- **Impact**: Lost
- **Description**: Sales Order could not be edited, unable to complete
- **Financial Calculation**: Full order amount counted as "lost"

#### 8. Completed - Fixed Amounts - Completed SO only - CS line location error
- **Impact**: Lost
- **Description**: Only Sales Order completed due to Cash Sale line location error
- **Financial Calculation**: Full order amount counted as "lost"

#### 9. Completed - Completed SO only - CS line location error
- **Impact**: Lost
- **Description**: Only Sales Order completed due to Cash Sale line location error
- **Financial Calculation**: Full order amount counted as "lost"

#### 10. Completed - Fixed Amounts - Unable to fix amounts (everything is matching)
- **Impact**: Lost
- **Description**: Amounts appear matching but couldn't be fixed, potential discrepancy
- **Financial Calculation**: Full order amount counted as "lost"

#### 11. Unable to Complete - Not Completed - Meta
- **Impact**: Lost
- **Description**: Meta-related order could not be completed
- **Financial Calculation**: Full order amount counted as "lost"

---

### ⚪ NEUTRAL (No Financial Impact)

These dispositions have no financial impact on the company.

#### 12. Unable to Complete - Not Completed - Locked (CS was able to be edited)
- **Impact**: Neutral
- **Description**: Order locked but Cash Sale was editable, no financial impact
- **Financial Calculation**: $0 saved, $0 lost

#### 13. Completed - Unable to fix amounts (everything is matching)
- **Impact**: Neutral
- **Description**: Amounts already matching, no fix needed
- **Financial Calculation**: $0 saved, $0 lost

#### 14. Unable to Complete - Not Completed - Canada Lock
- **Impact**: Neutral
- **Description**: Canadian order locked, no financial impact
- **Financial Calculation**: $0 saved, $0 lost

---

## Additional Sub-Dispositions (Agent View)

When agents complete WOD/IVCS tasks, they select from these sub-dispositions:

### For "Completed" Main Disposition:
- ✅ Fixed Amounts
- ✅ Unable to fix amounts (everything is matching)
- 💳 Added PayPal Payment info
- 📝 Cannot edit CS
- 🔧 Completed SO only - CS line location error

### For "Unable to Complete" Main Disposition:
- 🇨🇦 Not Completed - Canada Lock
- 📱 Not Completed - Meta
- 🔄 Not Completed - No edit button
- 🔒 Not Completed - Locked (CS was able to be edited)
- 📦 Not Completed - Reship

---

## Implementation Details

### Configuration File
Location: `src/lib/wod-ivcs-disposition-impact.ts`

This file contains:
- `DispositionConfig` interface defining disposition properties
- `ALL_WOD_IVCS_DISPOSITIONS` array with all 14+ dispositions
- `getDispositionImpact()` function to look up impact by disposition name
- `calculateFinancialImpact()` function to calculate saved/lost/net amounts

### API Endpoints

#### 1. Analytics API
**Endpoint**: `/api/manager/dashboard/wod-ivcs-analytics`

Returns:
- Summary metrics with `totalSaved`, `totalLost`, `netAmount`
- Disposition breakdown with financial metrics per disposition
- Agent breakdown with financial metrics per agent and disposition
- Brand breakdown with financial metrics per brand
- Source breakdown with financial metrics per source

#### 2. CSV Export API
**Endpoint**: `/api/manager/dashboard/wod-ivcs-analytics/export`

Exports CSV with columns:
- Task ID, Completed Date, Duration, Disposition, Agent
- Source, Brand, Document Number, Web Order, Customer
- Amount, **Amount Saved**, **Amount Lost**, **Net Amount**
- Difference, Order Date

### Frontend Component
Location: `src/app/wod-ivcs/_components/AnalyticsSection.tsx`

Displays:
1. **Financial Impact Summary** - Total Saved, Total Lost, Net Amount (3 cards)
2. **Disposition Breakdown** - Table with saved/lost/net columns
3. **Agent Performance** - Cards with financial metrics and expandable disposition details
4. **Brand Breakdown** - Table showing which brands have most issues
5. **Source Breakdown** - Table showing which import source brings most loss vs win

---

## Data Sources

WOD/IVCS tasks are imported from three NetSuite reports:

1. **SO_VS_WEB_DIFFERENCE** - Sales Order vs Web Order differences
2. **ORDERS_NOT_DOWNLOADING** - Orders that failed to download
3. **INVALID_CASH_SALE** - Cash Sales with validation issues

Each source is tracked separately in the analytics to identify which report brings the most problematic orders.

---

## Usage Examples

### Example 1: Calculating Financial Impact
```typescript
import { calculateFinancialImpact } from '@/lib/wod-ivcs-disposition-impact';

const disposition = "Completed - Fixed Amounts";
const orderAmount = 150.00;

const { savedAmount, lostAmount, netAmount } = calculateFinancialImpact(disposition, orderAmount);
// Result: { savedAmount: 150.00, lostAmount: 0, netAmount: 150.00 }
```

### Example 2: Checking Disposition Impact
```typescript
import { getDispositionImpact } from '@/lib/wod-ivcs-disposition-impact';

const impact = getDispositionImpact("Unable to Complete - Not Completed - Meta");
// Result: "lost"
```

---

## Metrics Displayed

### Summary Cards
- 💚 Total Amount Saved (green)
- 💔 Total Amount Lost (red)
- 📊 Net Amount (green if positive, red if negative)

### Per-Disposition Metrics
- Count of tasks
- Average duration
- Total amount saved
- Total amount lost
- Net amount (saved - lost)

### Per-Agent Metrics
- Total tasks completed
- Average duration
- Total amount saved
- Total amount lost
- Net amount
- Breakdown by disposition (expandable)

### Per-Brand Metrics
- Task count
- Total amount saved
- Total amount lost
- Net amount

### Per-Source Metrics
- Task count
- Total amount saved
- Total amount lost
- Net amount

---

## Color Coding

- **Green** (💚): Saved money / Positive impact
- **Red** (💔): Lost money / Negative impact / High risk
- **White/Gray** (⚪): Neutral / No impact

---

## Future Enhancements

Potential improvements for this feature:

1. **Trend Analysis**: Track financial impact over time (daily/weekly/monthly)
2. **Agent Rankings**: Leaderboard based on net amount saved
3. **Brand Alerts**: Automatic notifications for brands with high loss rates
4. **Source Optimization**: Recommendations to improve problematic import sources
5. **Predictive Analytics**: ML model to predict which orders are likely to be "lost"

---

## Related Documentation

- [Holds Dispositions Reference](./HOLDS_DISPOSITIONS_REFERENCE.md) - Similar implementation for Holds tasks
- [WOD/IVCS Task Management](./src/app/wod-ivcs/) - Main WOD/IVCS dashboard
- [Analytics API Documentation](./src/app/api/manager/dashboard/wod-ivcs-analytics/) - API endpoint details

---

**Last Updated**: December 2, 2025
**Version**: 1.0

