# Text Club – Brand analytics (Completed Work)

## What was added

- **Completed by Brand** in the Manager **Analytics** section (Completed Work dashboard).
- Uses the **same date range** (and comparison period) as the rest of the dashboard.
- **Brand normalization**: different spellings of the same brand (e.g. "Gundry", "GundryMD", "Dr. Marty", "DrMarty") are grouped into one canonical name so volume is not split across variants.

## How it works

1. **By Brand section**
   - Shows total completed per brand for the selected date range.
   - Brands are listed with counts; same brand spellings are combined via `src/lib/brand-normalize.ts`.

2. **Filter by Brand**
   - Dropdown next to Agent and Disposition filters: "All Brands" or a specific brand.
   - When a brand is selected:
     - **Disposition Performance** and **Agent Performance** below show only that brand’s data.
     - A blue banner shows "Showing data for brand: **X**" with a **Clear** link.

3. **Click-to-filter**
   - In "Completed by Brand", clicking a brand button applies that brand filter (and updates disposition/agent sections). Clicking the same brand again clears the filter.

## Technical notes

- **API**: `GET /api/manager/dashboard/completed-work` now accepts `brandFilter` (canonical name) and returns `analytics.brandBreakdown` (always for the same date/agent/disposition filters but without brand filter, so the list of brands and counts is stable).
- **Normalization**: `src/lib/brand-normalize.ts` defines canonical names and aliases. Add new brands or spellings there (and keep in sync with import alias logic if you centralize it later).

## Future analytics ideas (data analyst style)

- **Volume by brand over time**: Line or bar chart of completed tasks per brand by day/week for the selected range.
- **Comparison period for brand**: When "Compare periods" is on, show brand-level comparison (e.g. GundryMD this period vs same period last month).
- **Busiest brand** highlight: Automatically highlight the top 1–2 brands by volume in the By Brand section (e.g. badge "Highest volume").
- **Export by brand**: CSV export that includes a brand column, or separate sheets/files per brand.
- **New imports**: Prefer canonical brand names at import (e.g. in `brandFromFilename`) so the DB stores one spelling and normalization is mainly for legacy data.
