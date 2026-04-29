# Performance Scorecard × Quality Review — architecture audit

**Type:** Audit only (no implementation in this document).  
**Purpose:** Map the existing Performance Scorecard / Team Analytics productivity stack, the QA system, and a clean path to surface QA as a **separate pillar** from productivity (no blended score).

---

## 1. Executive summary

**Team Analytics** lives on **`/analytics`** (`src/app/analytics/page.tsx`). It combines overview metrics, team performance breakdowns, and a **`PerformanceScorecard`** widget that loads **two different backends**: collapsed “task/day” rankings from **`/api/manager/analytics/performance-scorecard`**, and expanded sprint / hybrid / lifetime views from **`/api/manager/analytics/sprint-rankings`**.

**Productivity math** is driven by **`Task`** completions (`status`, `endTime`, `durationSec`, `disposition`, `taskType`) plus **`TrelloCompletion`**, with weights from **`getTaskWeight`** in `src/lib/task-weights.ts`. **Hybrid 30/70** is implemented in **`sprint-rankings`** (and mirrored in **`personal-scorecard`**) as team-relative normalization, not in the manager **`performance-scorecard`** route’s primary ranking.

**QA** is centered on **`QATaskReview`** / **`QALineResult`**, with roster fields on **`User`** (`qaIsTracked`, `qaTeam`, `qaExemptReason`). Official period metrics use **`SUBMITTED` + `isCurrentVersion: true` + `submittedAt` in range**, implemented in **`loadQaAgentCoverageRows`** (`src/lib/quality-review-dashboard.ts`) via **`getAgentReportingRangeBoundsUtc`** (`src/lib/agent-reporting-day-bounds.ts`) — the **same PST “reporting day” semantics** as the performance scorecard’s date parsing.

**Important inconsistency:** **`/api/analytics/overview`** parses dates in **server local time**, while **team-performance**, **performance-scorecard**, **agent-status**, and **QA** use **PST-style UTC boundaries**. That can make “overview” disagree with the scorecard for the same calendar inputs.

**Clean integration path:** Treat **Productivity / Utilization** and **QA / Quality** as **parallel pillars** in the UI and in API responses (e.g. extend scorecard payload or add a dedicated **`scorecard-qa`** endpoint that **reuses `loadQaAgentCoverageRows`** or shares its query rules). **Do not** fold QA into `hybridScore`, `overallScore`, or productivity tiers.

---

## 2. Current Performance Scorecard map

### 2.1 Where the UI lives

| Surface | Path | Role |
|--------|------|------|
| **Team Analytics** (nav from manager layout) | `src/app/analytics/page.tsx` | Main dashboard; hosts scorecard + overview + agents tab |
| **Performance Scorecard** component | `src/app/_components/PerformanceScorecard.tsx` | Collapsed summary + **Expand Scorecard**; ranking mode tabs |
| **Team Analytics** link | `src/app/_components/DashboardLayout.tsx` | Button → `/analytics` |
| **Agent personal scorecard** (not Team Analytics, but same domain) | `src/app/agent/page.tsx` + data from `GET /api/agent/personal-scorecard` | Agent-facing rankings and trends |

### 2.2 What renders what

- **Team Analytics dashboard:** `AnalyticsPage` — overview stats, task types, agent status, team performance grid, scorecard + one-on-ones.
- **Performance Scorecard (collapsed):** Uses **`scorecardData`** from **`loadScorecardData`** → **`/api/manager/analytics/performance-scorecard`** (`task-day` mode in `PerformanceScorecard.tsx`).
- **Expand Scorecard:** Same component; fetches **`/api/manager/analytics/sprint-rankings`** with modes: current sprint, lifetime, **custom** (hybrid + task-day use `startDate`/`endDate` from parent), plus **`/api/manager/analytics/sprint-history`** for sprint picker.
- **Agent productivity analysis (detailed):** Agents tab → **`/api/analytics/team-performance`**; expanded agent row can call **`onLoadAgentDetail`** → **`performance-scorecard?agentId=`** for drill-down JSON.

### 2.3 API routes used by the scorecard / analytics page

| Route | Auth (as used) | Purpose |
|-------|----------------|---------|
| `GET /api/manager/analytics/performance-scorecard` | `requireManagerApiAuth` | Per-agent scorecard rows, targets, weight index; optional `agentId` detail |
| `GET /api/manager/analytics/sprint-rankings` | `requireStaffApiAuth` | Sprint / lifetime / custom window: competitive rankings, hybrid, breakdowns |
| `GET /api/manager/analytics/sprint-history` | (loaded by UI) | Historical sprints for dropdown |
| `GET /api/analytics/overview` | `requireManagerApiAuth` | High-level counts (date handling differs — see §2.7) |
| `GET /api/analytics/task-types` | manager | Task type stats |
| `GET /api/analytics/agent-status` | manager | Live-ish agent grid; PST today boundaries |
| `GET /api/analytics/team-performance` | manager | Per-agent, per-task-type counts and durations |
| `GET /api/manager/agents` | manager | Agent list for one-on-ones |
| `GET /api/agent/personal-scorecard` | agent email gate | Agent portal lifetime/sprint/today/weekly trend (not the manager Team Analytics page, but same scoring concepts) |

### 2.4 Helper / lib files (productivity)

| Concern | File(s) |
|--------|---------|
| **Task weights / “complexity” points** | `src/lib/task-weights.ts` — `getTaskWeight(taskType, disposition)`, `getAllWeights`, `WEIGHT_SUMMARY` |
| **Sprint calendar** | `src/lib/sprint-utils.ts` — `getCurrentSprint`, `getSprintDates`, `formatSprintPeriod`, `isSeniorAgent` |
| **Scorecard API logic** | `src/app/api/manager/analytics/performance-scorecard/route.ts` — task query, `calculateDynamicTargets`, `calculateAgentScore`, `calculateDetailedBreakdown` |
| **Sprint / hybrid rankings** | `src/app/api/manager/analytics/sprint-rankings/route.ts` |
| **Personal scorecard** | `src/app/api/agent/personal-scorecard/route.ts` — `buildAgentScorecard`, `rankAndNormalize` |
| **PST reporting day (shared with QA)** | `src/lib/agent-reporting-day-bounds.ts` |

### 2.5 Data model (productivity)

| Model | Role |
|-------|------|
| **`Task`** | Core completion record: `status`, `endTime`, `durationSec`, `disposition`, `taskType`, `assignedToId`, `completedBy` (Holds / unassigned completions), etc. |
| **`TrelloCompletion`** | Cards count per agent per `date`; folded into tasks completed and weighted points |
| **`User`** | Agent identity; `agentTypes` used to exclude **Holds-only** from manager scorecard lists; `isLive` used in sprint rankings user list |
| **`SprintRanking`** | Persisted sprint results (written when sprint ends — see sprint-rankings `saveSprintResults`) |

### 2.6 Date ranges in Team Analytics

- **UI:** `getDateRange()` in `analytics/page.tsx` — either **custom** `YYYY-MM-DD` pair or **“today”** as that calendar date string (browser-local date when formatting “today”).
- **Scorecard + team performance:** Query params passed through; server converts to **PST day** as **08:00 UTC start** through **07:59:59.999 UTC next day** end (see `performance-scorecard/route.ts` and `team-performance/route.ts`).

### 2.7 Same reporting day as QA?

- **QA dashboards** use **`getAgentReportingRangeBoundsUtc(startYmd, endYmd)`** — documented as fixed **PST (UTC−8)** half-open `[startUtc, endExclusiveUtc)`.
- **Performance scorecard** and **team-performance** use the **same UTC 8:00 / next-day 7:59:59.999** pattern for `dateStart`/`dateEnd` strings.
- **Agent status** “today” uses the same PST-via-UTC approach.
- **`/api/analytics/overview`** uses **`new Date(year, month-1, day, …)`** (interpreted in **server local timezone**), which is **not** guaranteed to match PST reporting days.

**Conclusion:** For integration, **align QA and productivity on `getAgentReportingRangeBoundsUtc`** (or identical string → boundary logic). **Do not** assume `overview` matches without fixing its date parsing.

---

## 3. Current scorecard math

### 3.1 Manager API: `performance-scorecard` (collapsed / task-day list)

**File:** `src/app/api/manager/analytics/performance-scorecard/route.ts`  
**Core function:** `calculateAgentScore(...)`

| Metric | Function / location | Source fields | Formula (plain English) |
|--------|---------------------|---------------|-------------------------|
| **Days worked** | `calculateAgentScore` | `Task.endTime` dates; `TrelloCompletion` dates with **cards ≥ 15** | Distinct calendar dates (UTC date string of `endTime`) from portal tasks **plus** qualifying Trello days |
| **Tasks completed** | same | Portal task count + Trello `cardsCount` sum | Portal rows + Trello cards as task equivalents |
| **Daily average (tasks/day)** | same | Derived | `tasksCompleted / daysWorked` |
| **Weighted points (“complexity” mass)** | same | `taskType`, `disposition` per task; Trello via `getTaskWeight("TRELLO")` | Sum of `getTaskWeight(taskType, disposition)` per task + Trello |
| **Weighted daily avg (pts/day)** | same | Derived | `totalWeightedPoints / daysWorked` |
| **Volume score (field)** | same | `dailyAvg` | **Rounded `dailyAvg`** (integer-ish); used as `volumeScore` and **`overallScore`** |
| **Speed score** | same | `durationSec` vs `calculateDynamicTargets` | Weighted average of `(targetSec/typeAvgSec)*100` by task count; cap 150; **informational** |
| **Overall score (ranking key)** | same | — | **`overallScore = round(volumeScore)`** — i.e. **100% volume** for API ranking in this route |
| **Ranking / tiers** | `GET` handler | Eligible if `tasksCompleted >= 20` | Sort by **`overallScore` desc**; percentile from position; tiers (Elite / High Performer / On Track / Needs Support / Insufficient Data) |
| **Dynamic targets** | `calculateDynamicTargets` | All completed tasks in period | Per task type: “daily tasks” from workload distribution; handle-time target from **fast quartile** of agent averages |
| **Breakdown by type** | `calculateAgentScore` | Per-type tasks | Count, avg duration, total seconds, weighted points |
| **Drill-down** | `calculateDetailedBreakdown` | Tasks for agent | Work schedule, daily task counts, PST hourly/daily peaks, handle-time buckets |

**Note:** The UI subtitle may mention hybrid in places, but **this API’s primary sort is tasks/day (`overallScore`)**, not hybrid. Hybrid lives in **`sprint-rankings`** / expanded modes.

### 3.2 Sprint rankings API: volume, complexity, hybrid, lifetime label

**File:** `src/app/api/manager/analytics/sprint-rankings/route.ts`  
**Loop:** per-agent task + Trello aggregation, then competitive ranking block.

| Metric | Function / block | Source fields | Formula |
|--------|------------------|---------------|--------|
| **Weighted points** | Main loop | `Task` with `assignedToId`, `status COMPLETED`, `disposition` & `durationSec` not null; `getTaskWeight` | Sum weights; disposition-level breakdown |
| **Tasks per day** | Derived | Portal count + Trello count; `daysWorked` | `(portalTasks + trello) / daysWorked` |
| **Weighted daily avg** | Derived | Total weighted points / days worked | **“Complexity rate”** for hybrid |
| **Hybrid 30/70** | ~lines 407–417 | Competitive set only | `volumeScore = (tasksPerDay/maxTasksPerDay)*100`, `complexityScore = (weightedDailyAvg/maxPtsPerDay)*100`, **`hybrid = 0.3*volume + 0.7*complexity`** |
| **Rankings** | Multiple sorts | — | **By pts/day**, **by tasks/day**, **by pts/hour**, **by hybrid**; sprint mode requires **≥3 days worked**; custom mode **≥1 task**; lifetime **≥20 tasks** |
| **Lifetime mode** | `mode=lifetime` | Wide date range | `lifetimeRank` is set equal to **`rankByPtsPerDay`** (not a separate long-horizon hybrid rank in code) |

### 3.3 Personal scorecard (agent portal)

**File:** `src/app/api/agent/personal-scorecard/route.ts`  
**Functions:** `buildAgentScorecard`, `rankAndNormalize`

- **Lifetime window in practice:** Tasks loaded **from last 3 months** (comment: performance tradeoff), not literally all-time.
- **Hybrid:** Same normalization as sprint-rankings: max-normalize tasks/day and pts/day in competitive set, then **30/70**.
- **Weekly “trend”:** Compares **this week vs last week** windows (PST-derived UTC bounds) for `tasksPerDay`, `weightedDailyAvg`, handle time.

### 3.4 Task-type / disposition breakdowns

- **`sprint-rankings`:** Rich per-type + per-disposition breakdown on each agent card.
- **`performance-scorecard`:** Per-type in `breakdown`; disposition detail via **`weightIndex`** (`getAllWeights`) at response level, not full per-agent disposition list in the main list.

---

## 4. Current QA system map

### 4.1 UI / routes

| Area | Path |
|------|------|
| QA hub | `src/app/manager/quality-review/page.tsx` |
| QA dashboard | `src/app/manager/quality-review/dashboard/page.tsx` |
| Roster | `src/app/manager/quality-review/roster/page.tsx` |
| Templates | `src/app/manager/quality-review/templates/...` |
| Regrade flow | `src/app/manager/quality-review/regrade/[reviewId]/page.tsx` |

### 4.2 API routes (representative)

| Route | Role |
|-------|------|
| `GET .../dashboard/coverage` | Table rows via **`loadQaAgentCoverageRows`** |
| `GET .../dashboard/summary` | Aggregates + needs-attention / smart queue via **`loadQaDashboardSummary`** |
| `GET .../dashboard/agents/[agentId]/reviews` | **Review history** for a subject agent (tasks touched in window; loads all review versions for those tasks for UI) |
| `GET .../eligibility` | Eligible tasks for sampling |
| Batches / submit / regrade | `batches/*`, `task-reviews/[id]/submit`, `task-reviews/[id]/regrade` |

### 4.3 Lib modules

| File | Role |
|------|------|
| `src/lib/quality-review-dashboard.ts` | Coverage rows, summary, URL builders, **`SUBMITTED` + `isCurrentVersion` + `submittedAt`** aggregations |
| `src/lib/quality-review-scoring.ts` | **`computeQualityReviewScores`** → `finalScore`, caps on critical fails |
| `src/lib/quality-review-submit.ts` | **`submitQATaskReviewInTransaction`** — writes line results, sets **`isCurrentVersion`** |
| `src/lib/quality-review-eligibility.ts` | Which tasks can be reviewed |
| `src/lib/quality-review-sprint.ts` | Default QA sprint YMD bounds from **`getAgentReportingTodayYmd`** / **`getAgentReportingRangeBoundsUtc`** |
| `src/lib/quality-review-constants.ts` | Coverage targets, sprint length, limits |

### 4.4 Models

- **`QATaskReview`:** `status`, `submittedAt`, `finalScore`, `weightedScore`, `isCurrentVersion`, `parentReviewId`, `subjectAgentId`, `taskId`, `templateVersionId`, etc.
- **`QALineResult`:** Per-line `response`, `comment`, snapshots of weight/label/critical.
- **`User`:** `qaIsTracked`, `qaTeam`, `qaExemptReason`.

### 4.5 Official QA score

- Computed on submit by **`computeQualityReviewScores`** in `quality-review-scoring.ts`: weighted % from PASS vs applicable lines, **critical FAIL cap** (70 / 50 / 30), stored as **`finalScore`** (and related fields).

### 4.6 Regrades

- **`POST .../task-reviews/[id]/regrade`:** Requires parent **`SUBMITTED`** and **`isCurrentVersion: true`**; creates new row with **`status: PENDING`**, **`isCurrentVersion: false`**, **`parentReviewId`**, optional **latest template**.
- On submit, **`submitQATaskReviewInTransaction`** sets **all other reviews for that task** to **`isCurrentVersion: false`**, then the new one to **`true`**.

### 4.7 `isCurrentVersion`

- Schema default **`true`**; **only one** should be current per task after submit.
- **Dashboard official counts** use **`isCurrentVersion: true`** so superseded regrades do not double-count.

### 4.8 Date / reporting windows

- Query params **`startDate` / `endDate`** as **`YYYY-MM-DD`**.
- Converted with **`getAgentReportingRangeBoundsUtc`** — **half-open** `[startUtc, endExclusiveUtc)`, **fixed PST (UTC−8)** semantics, aligned with agent stats docs in `agent-reporting-day-bounds.ts`.

### 4.9 QA team / roster

- **`qaIsTracked`:** exempt vs tracked.
- **`qaTeam`:** string label; filter **`__any__`**, **`__unassigned__`**, or exact team.
- Coverage row **`coverageStatus`:** exempt, no_eligible_work, complete, below, none — driven by eligible task count vs **`QA_COVERAGE_TARGET_REVIEWS_PER_AGENT`**.

### 4.10 “Line-level trends”

- **Per review:** `lineResults` returned on agent review history API.
- **No dedicated team-wide “top failing lines over time” API** found; would require new aggregation (e.g. group `QALineResult` joined to current official reviews in range).

### 4.11 Best API to reuse for scorecard integration

- **Strongest reuse:** **`loadQaAgentCoverageRows`** (and optionally **`loadQaDashboardSummary`** for team-level snapshots). It already applies the **official rules**: **`status: SUBMITTED`**, **`isCurrentVersion: true`**, **`submittedAt` in window**.
- **`GET .../dashboard/agents/[agentId]/reviews`** is optimized for **history UI**, not for **official counts** (first query does not require `isCurrentVersion`; then loads all versions for tasks in window).

---

## 5. Integration architecture recommendation

1. **UI placement**  
   - In **`PerformanceScorecard`**, present two stacked sections: **“Productivity / Utilization”** (existing) and **“QA / Quality”** (new), **same agent list** joined by `user.id`.  
   - Alternatively, **tabs** within the expanded scorecard: **Productivity | QA** so hybrid rankings stay visually separate from QA averages.  
   - Keep **one date range control** on Team Analytics feeding **both** APIs with the **same `start`/`end` strings**.

2. **New vs extended API**  
   - **Preferred:** **`GET /api/manager/analytics/performance-qa`** (or **`scorecard-qa`**) that accepts **`dateStart`/`dateEnd`** (mirror scorecard param names) and internally calls **`getAgentReportingRangeBoundsUtc`** + the same Prisma filters as **`loadQaAgentCoverageRows`**, returning **`Map<agentId, QaSummary>`** only for agents needed (or full list).  
   - **Avoid** overloading **`performance-scorecard`** with QA logic in one giant handler unless you strictly separate **JSON sections** (`productivity`, `qa`) to keep caching and mental model clean.  
   - **Reuse logic, not necessarily the HTTP path:** import **`loadQaAgentCoverageRows`** from `quality-review-dashboard.ts`.

3. **Data shape (suggested)**  
   Per agent (official rules):  
   `agentId`, `qaAvgScore`, `qaReviewCount`, `coverageStatus`, `coverageTarget`, `eligibleTaskCount`, `lastReviewedAt`, `qaIsTracked`, `qaTeam`, link to QA dashboard with pre-filled query string (**`buildQaDashboardUrl`** already exists).

4. **Date alignment**  
   - Pass **identical `YYYY-MM-DD`** from Team Analytics to productivity and QA.  
   - Implement productivity boundary helper **once** (ideally **`getAgentReportingRangeBoundsUtc`** everywhere) and **fix `overview`** later if you want pixel-perfect consistency.

5. **Agent with productivity but no QA**  
   - Show QA as **null** or **“—”** with **coverage row** if tracked (**below/none**) or **exempt**.

6. **Agent with QA but no productivity**  
   - Possible if excluded from scorecard (e.g. **Holds-only** filtered out of productivity but still in QA roster). **Show QA pillar anyway** or explicitly **“Not in productivity scorecard”** to avoid confusion.

7. **QA average, count, trend, coverage, coaching**  
   - **Average / count:** From **`groupBy`** pattern in **`loadQaAgentCoverageRows`**.  
   - **Trend:** Not built-in; **Phase 1** = omit or **two-window delta** (two API calls with previous period).  
   - **Coverage:** Reuse **`coverageStatus`** + **`reviewsCompleted` vs target**.  
   - **Coaching:** **Phase 1** = link **“Open in QA dashboard”** with `agentId` filter; **Phase 3** = top failing **line labels** via new SQL.

8. **Line-level coaching in scorecard**  
   - **Recommend link-out first** (dashboard + agent history). Inline line coaching implies **new aggregates** and dense UI.

9. **DB / schema**  
   - **Likely none** for read-only integration if current fields suffice.  
   - Optional later: **materialized** QA rollups for speed, or indexes on **`(subjectAgentId, status, isCurrentVersion, submittedAt)`** (partial index patterns depend on DB).

10. **Risks**  
    - **Different agent universes:** `isLive` vs `isActive`, Holds-only exclusions.  
    - **Overview vs PST** mismatch confusing stakeholders.  
    - **`dashboard/agents/.../reviews`** vs **official counts** — must not mix for KPIs.  
    - **Performance:** `loadQaAgentCoverageRows` does **eligible task counts per tracked agent** (chunked) — heavy for huge rosters; may need batching or caching for scorecard.

---

## 6. Proposed data shape (scorecard QA summary)

```ts
// Illustrative — not implemented
type ScorecardQaRow = {
  agentId: string;
  qaIsTracked: boolean;
  qaTeam: string | null;
  reviewsOfficialCount: number;  // SUBMITTED + isCurrentVersion + submittedAt in range
  avgFinalScore: number | null;   // avg(finalScore) over those reviews
  coverageStatus: "exempt" | "no_eligible_work" | "complete" | "below" | "none";
  coverageTarget: number;
  eligibleTaskCount: number;
  lastReviewedAt: string | null;
  deepLink: string;               // buildQaDashboardUrl(...)
};
```

Team-level optional: `needsAttentionTopN` from **`loadQaDashboardSummary`**.

---

## 7. Proposed UI placement

- **Collapsed scorecard:** Optional **single-line QA team snapshot** (“Avg QA: X • Reviews: N • Below target: K”) linking to QA dashboard — **no per-agent QA** until expanded.  
- **Expanded scorecard:** **Second column** or **sub-table** under each agent: **QA avg, # reviews, coverage badge**.  
- **Clear headings:** “**Productivity**” vs “**QA**” — never one combined rank column.

---

## 8. Phased implementation plan

| Phase | Scope | Likely files | Expected behavior | Test plan | Risk |
|-------|--------|--------------|-------------------|-----------|------|
| **1 — Data/API** | QA summary endpoint + shared date helper usage | New route under `api/manager/analytics/`, reuse `quality-review-dashboard.ts`, optionally refactor PST parsing | Same official rules as dashboard; returns per-agent QA metrics for date range | Unit/integration: counts match dashboard for same range + agent | **Low–medium** (perf on large roster) |
| **2 — Scorecard UI summary** | Read-only QA block | `PerformanceScorecard.tsx`, `analytics/page.tsx` | Parallel pillar; no blend | Visual + compare to QA dashboard rows | **Low** |
| **3 — Agent detail / coaching** | Deep link + optional failing-line rollup | New lib query or extend agent reviews API | Drill-down from scorecard | Spot-check regraded tasks show current version only in KPIs | **Medium** (scope creep) |
| **4 — Polish** | Loading, empty states, copy, optional trend | Same + design | Clear when agent excluded from productivity | Cross-browser date range; Holds-only edge cases | **Low** |

---

## 9. Risks / open questions

- Should **Team Analytics** use **tracked-only** QA roster or **all agents**? (Coverage lib defaults differ from sprint-rankings’ `isLive` agent list.)  
- Should QA on the scorecard respect **qaTeam** filters when managers use Team Analytics globally?  
- Is **“lifetime”** on the agent portal (3-month task window) acceptable to document as “lifetime” for stakeholders?  
- Do you want to **normalize overview** to PST in a separate project?

---

## 10. Things NOT to do

- **Do not** merge QA into **`hybridScore`**, **`overallScore`**, or productivity **tiers**.  
- **Do not** use **`/api/analytics/overview`** as the **source of truth** for aligning productivity and QA day boundaries until its date logic matches PST reporting.  
- **Do not** count QA reviews without **`isCurrentVersion: true`** for official KPIs.  
- **Do not** treat **`dashboard/agents/.../reviews`** as authoritative **counts** without filtering to official rows.  
- **Do not** implement schema changes until product confirms **trend** and **coaching** requirements.

---

*Audit compiled from repository inspection. This markdown file is documentation only.*
