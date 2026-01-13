# Holds Reporting & Metrics - Requirements & Questions

## 📊 Overview
This document outlines the questions and requirements needed to build comprehensive reporting and metrics for the Holds system. Use this as a guide when discussing reporting needs with supervisors.

---

## 1. 📈 Business Metrics & KPIs

### Core Metrics Questions:
- **What are the top 3-5 metrics supervisors check daily?**
  - Total tasks in system?
  - Completion rate?
  - Average handle time?
  - Financial impact (saved vs lost)?
  - Queue distribution?

- **What are the key performance indicators (KPIs) for Holds?**
  - Target completion rate? (e.g., 80% within 5 days)
  - Target average handle time? (e.g., under 10 minutes)
  - Target financial impact? (e.g., save 70% of order value)

- **What metrics indicate a "healthy" Holds queue?**
  - Maximum number of tasks in each queue?
  - Maximum aging threshold before escalation?
  - Minimum completion rate?

### Current Data Available:
✅ Total tasks by status (PENDING, IN_PROGRESS, COMPLETED)  
✅ Tasks by queue (Agent Research, Customer Contact, Escalated Call 4+ Day, Duplicates, Completed)  
✅ Tasks by priority (1-2: White Glove, 4-5: Normal)  
✅ Completion tracking (completedBy, completedAt)  
✅ Financial impact (holdsOrderAmount, disposition impact)  
✅ Queue history timeline (holdsQueueHistory JSON)

---

## 2. ⏰ Time Periods & Filtering

### Date Range Questions:
- **What time periods are most useful?**
  - Daily reports?
  - Weekly summaries?
  - Monthly rollups?
  - Custom date ranges?
  - Real-time dashboards?

- **What date should be used for filtering?**
  - Order date (`holdsOrderDate`)? - When order was placed
  - Task creation date (`createdAt`)? - When task entered system
  - Completion date (`endTime` or `completedAt`)? - When task was completed
  - Queue entry date (from `holdsQueueHistory`)? - When task entered specific queue

- **Should reports show:**
  - Tasks completed in the period? (completed date in range)
  - Tasks created in the period? (created date in range)
  - Tasks active in the period? (any activity in range)
  - All tasks with order dates in the period? (order date in range)

### Filtering Questions:
- **What filters are essential?**
  - By agent (assignedTo or completedBy)?
  - By queue (holdsStatus)?
  - By priority (holdsPriority)?
  - By disposition?
  - By financial impact (saved/lost/neutral)?
  - By aging bucket (0-2 days, 3-4 days, 5+ days)?
  - By order amount range?
  - By brand (if applicable)?

- **Should filters be:**
  - Single-select (one value)?
  - Multi-select (multiple values)?
  - Range-based (e.g., order amount $50-$200)?

---

## 3. 👤 Agent Performance Metrics

### Performance Questions:
- **What agent metrics are most important?**
  - Tasks completed per day/week/month?
  - Average handle time (durationSec)?
  - Completion rate (completed / assigned)?
  - Quality metrics (disposition accuracy)?
  - Financial impact per agent (saved vs lost)?

- **How should agent performance be calculated?**
  - Only tasks they completed (`completedBy`)?
  - Only tasks assigned to them (`assignedTo`)?
  - Both (with distinction)?
  - Include unassigned completions? (e.g., "Unable to Resolve" that were unassigned)

- **What comparisons are useful?**
  - Agent vs team average?
  - Agent vs top performer?
  - Agent vs previous period (week/month)?
  - Agent ranking/percentile?

### Handle Time Questions:
- **How should handle time be calculated?**
  - Include assistance time? (currently excluded via `assistancePausedDurationSec`)
  - Include time in queue before starting?
  - Only active work time (`durationSec`)?
  - Average, median, or both?

- **What are target handle times?**
  - By queue? (e.g., Agent Research: 5 min, Customer Contact: 10 min)
  - By priority? (e.g., White Glove: 3 min, Normal: 8 min)
  - By disposition? (e.g., Resolved: 5 min, Unable to Resolve: 15 min)

### Disposition Analysis Questions:
- **What disposition insights are needed?**
  - Most common dispositions per agent?
  - Disposition distribution (saved/lost/neutral)?
  - Disposition trends over time?
  - Dispositions that lead to rework (queue movements)?

---

## 4. 💰 Financial Impact Metrics

### Financial Questions:
- **How should financial impact be calculated?**
  - Sum of `holdsOrderAmount` for "saved" dispositions?
  - Sum of `holdsOrderAmount` for "lost" dispositions?
  - Net impact (saved - lost)?
  - Percentage saved (saved / total order value)?

- **What financial metrics are most important?**
  - Total saved per day/week/month?
  - Total lost per day/week/month?
  - Net impact (saved - lost)?
  - Average order value saved/lost?
  - Financial impact per agent?
  - Financial impact by disposition?

- **Should financial reports show:**
  - Only completed tasks (status = COMPLETED)?
  - All tasks with dispositions (including queue movements)?
  - Breakdown by queue?
  - Breakdown by priority?

### Disposition Impact Questions:
- **Are all dispositions correctly categorized?**
  - Review `src/lib/holds-disposition-impact.ts`
  - Confirm "saved" vs "lost" vs "neutral" classifications
  - Are there edge cases or special dispositions?

- **Should queue movement dispositions have financial impact?**
  - Currently marked as "neutral" (no impact until final completion)
  - Is this correct, or should they have partial impact?

---

## 5. 📋 Queue Management Metrics

### Queue Questions:
- **What queue metrics are needed?**
  - Tasks in each queue (current count)?
  - Tasks entering each queue (per day/week)?
  - Tasks exiting each queue (per day/week)?
  - Average time in each queue?
  - Queue throughput (tasks completed per day from each queue)?

- **What queue health indicators?**
  - Maximum tasks before queue is "overloaded"?
  - Average queue time before escalation?
  - Bottleneck identification (which queue slows down flow)?

### Queue Flow Questions:
- **How should queue movements be tracked?**
  - Time spent in each queue (from `holdsQueueHistory`)?
  - Most common queue paths (e.g., Agent Research → Customer Contact → Completed)?
  - Queue bounce rate (tasks that return to previous queue)?
  - Queue efficiency (tasks that complete without queue changes)?

- **What queue analytics are useful?**
  - Queue entry/exit rates?
  - Queue conversion rates (e.g., % of Agent Research that go to Completed)?
  - Queue bottlenecks (where tasks get stuck)?

---

## 6. ⏳ Aging & SLA Metrics

### Aging Questions:
- **What aging thresholds are important?**
  - Current: 3 days = "approaching", 5 days = "aging"
  - Are these correct?
  - Should there be more granular buckets? (e.g., 0-1, 2-3, 4-5, 6-7, 8+ days)

- **How should aging be calculated?**
  - From order date (`holdsOrderDate`)?
  - From task creation date (`createdAt`)?
  - From queue entry date (from `holdsQueueHistory`)?
  - From when task was assigned?

- **What SLA targets exist?**
  - Target completion time? (e.g., 80% within 5 days)
  - Target by priority? (e.g., White Glove: 2 days, Normal: 5 days)
  - Target by queue? (e.g., Agent Research: 1 day, Customer Contact: 3 days)

### Escalation Questions:
- **What triggers escalation?**
  - Age threshold? (e.g., 4+ days → Escalated Call queue)
  - Priority? (e.g., White Glove → faster escalation)
  - Queue time? (e.g., 2 days in Customer Contact → escalate)

- **How should escalation metrics be tracked?**
  - Escalation rate (% of tasks that escalate)?
  - Average time before escalation?
  - Escalation by agent (who escalates most)?
  - Escalation by queue (which queue escalates most)?

---

## 7. 📊 Disposition Analysis

### Disposition Questions:
- **What disposition insights are needed?**
  - Most common dispositions overall?
  - Most common dispositions per agent?
  - Disposition trends over time?
  - Disposition by queue?
  - Disposition by priority?
  - Disposition by aging bucket?

- **What disposition patterns indicate issues?**
  - High "Unable to Resolve" rate?
  - High "Duplicate" rate?
  - Low "Resolved" rate?
  - Disposition changes (agent changes disposition)?

### Quality Questions:
- **How should quality be measured?**
  - Disposition accuracy (manager review)?
  - Reopening rate (tasks that come back)?
  - Customer satisfaction (if tracked)?
  - First-time resolution rate?

---

## 8. 📄 Reporting Format & Display

### Display Questions:
- **How should reports be displayed?**
  - Dashboard with charts/graphs?
  - Tables with sortable columns?
  - Summary cards (key metrics at top)?
  - Drill-down capability (summary → details)?

- **What visualizations are most useful?**
  - Line charts (trends over time)?
  - Bar charts (comparisons)?
  - Pie charts (distribution)?
  - Heatmaps (queue × time)?
  - Tables (detailed data)?

### Export Questions:
- **What export formats are needed?**
  - CSV (for Excel)?
  - PDF (for sharing)?
  - JSON (for integration)?
  - Email reports (scheduled)?

- **What data should be exportable?**
  - All task details?
  - Summary metrics only?
  - Agent performance data?
  - Financial impact data?

### Real-time vs Historical:
- **What needs to be real-time?**
  - Current queue counts?
  - Active tasks?
  - Today's completions?

- **What can be historical/batched?**
  - Weekly summaries?
  - Monthly rollups?
  - Trend analysis?

---

## 9. 🔄 Comparative Analysis

### Comparison Questions:
- **What comparisons are useful?**
  - Current period vs previous period (week/month)?
  - Current period vs same period last year?
  - Agent vs agent?
  - Queue vs queue?
  - Day vs day (e.g., Monday vs Tuesday)?

- **What benchmarks exist?**
  - Historical averages?
  - Target goals?
  - Industry standards?

---

## 10. 🎯 Priority & White Glove Metrics

### Priority Questions:
- **How should priority be used in reporting?**
  - Separate metrics for White Glove (1-2) vs Normal (4-5)?
  - Priority-based SLA targets?
  - Priority-based handle time expectations?

- **What priority metrics are important?**
  - Completion rate by priority?
  - Handle time by priority?
  - Aging by priority?
  - Financial impact by priority?

---

## 11. 🔍 Search & Drill-Down

### Search Questions:
- **What search capabilities are needed?**
  - Search by order number (`holdsOrderNumber`)?
  - Search by customer email (`holdsCustomerEmail`)?
  - Search by agent name?
  - Search by disposition?
  - Full-text search in notes (`holdsNotes`)?

### Drill-Down Questions:
- **What drill-down paths are useful?**
  - Summary → Agent details → Task details?
  - Summary → Queue details → Task details?
  - Summary → Disposition details → Task details?
  - Financial summary → Agent breakdown → Task details?

---

## 12. 📧 Notifications & Alerts

### Alert Questions:
- **What alerts are needed?**
  - Queue overload (too many tasks in queue)?
  - Aging tasks (tasks approaching/over threshold)?
  - Low completion rate?
  - High escalation rate?
  - Financial impact threshold (e.g., lost > $X)?

- **How should alerts be delivered?**
  - In-app notifications?
  - Email?
  - Slack/Teams?
  - Dashboard badges?

---

## 13. ✅ Current Reporting Capabilities

### Already Available:
✅ **Overview Analytics** (`/api/holds/analytics?type=overview`)
  - Total tasks, aging tasks, completion rate
  - Queue distribution, priority distribution
  - Aging breakdown (0-2, 3-4, 5+ days)

✅ **Aging Report** (`/api/holds/analytics?type=aging`)
  - Tasks by aging status
  - Order details, priority, assignment

✅ **Agent Performance** (`/api/holds/analytics?type=agent-performance`)
  - Tasks completed, pending, aging per agent
  - Completion rate, average handle time
  - Uses `completedBy` for accurate attribution

✅ **Queue Stats** (`/api/holds/analytics?type=queue-stats`)
  - Tasks per queue (assigned/unassigned)
  - Aging breakdown per queue

✅ **Resolved Report** (`/api/holds/resolved-report`)
  - All completed tasks with details
  - Filterable by date, agent, disposition
  - Exportable to CSV

### Data Available but Not Yet Reported:
- Financial impact (saved/lost/neutral by disposition)
- Queue flow/timeline (from `holdsQueueHistory`)
- Disposition trends over time
- Priority-based metrics
- SLA compliance (target vs actual)
- Escalation metrics
- Disposition quality metrics

---

## 📝 Next Steps

1. **Review this document** with supervisors
2. **Answer the questions** in each section
3. **Prioritize** which reports/metrics are most important
4. **Define** target values/KPIs for key metrics
5. **Confirm** data accuracy (disposition impact, aging thresholds, etc.)
6. **Design** report layouts and visualizations
7. **Build** reporting endpoints and UI components

---

## 💡 Recommendations

Based on the data available, here are some high-value reports that could be built:

1. **Financial Impact Dashboard**
   - Total saved/lost per period
   - Breakdown by agent, disposition, queue
   - Trends over time

2. **Queue Flow Analysis**
   - Time in each queue
   - Common queue paths
   - Bottleneck identification

3. **Agent Performance Scorecard**
   - Tasks completed, handle time, completion rate
   - Financial impact per agent
   - Quality metrics (disposition distribution)

4. **SLA Compliance Report**
   - Target vs actual completion times
   - Aging breakdown
   - Priority-based SLA performance

5. **Disposition Analytics**
   - Most common dispositions
   - Disposition trends
   - Disposition by agent/queue/priority



