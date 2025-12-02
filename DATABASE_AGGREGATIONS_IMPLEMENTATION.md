# Database Aggregations Implementation Plan

## How Database Aggregations Work

### Current Approach (Fetch All Rows)
```typescript
// ❌ SLOW: Fetches potentially 100,000+ individual task rows
const allTasks = await prisma.task.findMany({
  where: { status: "COMPLETED", endTime: { gte: threeYearsAgo } },
  select: { id, assignedToId, completedBy, endTime, startTime, taskType, disposition }
});
// Then processes in memory:
// - Groups by user
// - Counts tasks
// - Sums durations
// - Calculates averages
```

**Problems**:
- Transfers 100k+ rows from database → application
- Processes everything in memory (slow)
- High memory usage
- Network overhead

### Aggregated Approach (Database Does the Work)
```typescript
// ✅ FAST: Database counts and sums directly, returns only aggregated results
const taskStats = await prisma.$queryRaw`
  SELECT 
    COALESCE("assignedToId", "completedBy") as "userId",
    "taskType"::text,
    "disposition",
    COUNT(*)::bigint as count,
    SUM(COALESCE("durationSec", 0))::bigint as "totalDurationSec",
    MIN("startTime") as "minStartTime",
    MAX("endTime") as "maxEndTime"
  FROM "Task"
  WHERE 
    "status" = 'COMPLETED'
    AND "endTime" IS NOT NULL
    AND "endTime" >= ${threeYearsAgo}
    AND ("assignedToId" IS NOT NULL OR "completedBy" IS NOT NULL)
  GROUP BY COALESCE("assignedToId", "completedBy"), "taskType", "disposition"
`;
// Returns maybe 500-1000 aggregated rows instead of 100k+ individual rows
```

**Benefits**:
- Database does counting/summing (optimized)
- Transfers only aggregated data (99% less data)
- Much faster query execution
- Lower memory usage

## Example: Before vs After

### Before (Current)
```
Database Query: 1,180ms
Data Transfer: 683ms (100k rows)
Memory Processing: 800ms
Total: ~2,664ms
```

### After (Aggregations)
```
Database Query: 200ms (database does aggregation)
Data Transfer: 5ms (1k aggregated rows)
Memory Processing: 50ms (just formatting)
Total: ~255ms (90% faster!)
```

## Implementation Plan

### Phase 1: Replace Task Query with Aggregations (2-3 hours)

**Step 1: Create aggregation query** (30 min)
- Replace `findMany` with `$queryRaw` aggregation
- Group by userId, taskType, disposition
- Get counts, sums, min/max dates

**Step 2: Refactor `buildAgentScorecard`** (1-2 hours)
- Change from processing individual tasks to processing aggregated stats
- Update calculations to use pre-aggregated counts/sums
- Handle date filtering on aggregated data

**Step 3: Handle edge cases** (30 min)
- Tasks without startTime/endTime
- Date range filtering on aggregated data
- Hourly breakdown (may need separate query or keep some individual tasks)

**Step 4: Testing** (30 min)
- Verify numbers match current implementation
- Test with different date ranges
- Test with different users

### Phase 2: Optimize Trello Query (Already Done ✅)
- Already optimized (no nested select)

### Phase 3: Handle Special Cases (1-2 hours)

**Hourly Breakdown Challenge**:
- Current: Iterates through individual tasks to get hour-by-hour breakdown
- Solution Options:
  - **Option A**: Keep a small query for hourly breakdown (only for date-filtered views)
  - **Option B**: Add hour extraction to aggregation query
  - **Option C**: Calculate from aggregated data (less precise but faster)

**Days Worked Calculation**:
- Current: Creates Set from individual task endTimes
- Solution: Use `COUNT(DISTINCT DATE("endTime"))` in aggregation

**Idle Time Calculation**:
- Current: Sorts individual tasks by time
- Solution: Use MIN/MAX from aggregation (less precise but acceptable)

### Phase 4: Testing & Validation (1 hour)
- Compare results with current implementation
- Performance testing
- Edge case testing

## Detailed Implementation

### Step-by-Step Code Changes

#### 1. Replace Task Query

**Current Code:**
```typescript
const allTasks = await prisma.task.findMany({
  where: {
    status: "COMPLETED",
    endTime: { not: null, gte: threeYearsAgo },
    OR: [
      { assignedToId: { not: null } },
      { completedBy: { not: null } }
    ]
  },
  select: {
    id: true,
    assignedToId: true,
    completedBy: true,
    endTime: true,
    startTime: true,
    taskType: true,
    disposition: true
  }
});
```

**New Aggregated Code:**
```typescript
interface TaskAggregation {
  userId: string;
  taskType: string;
  disposition: string | null;
  count: number;
  totalDurationSec: number;
  minStartTime: Date | null;
  maxEndTime: Date | null;
}

const taskAggregations = await prisma.$queryRaw<TaskAggregation[]>`
  SELECT 
    COALESCE("assignedToId", "completedBy") as "userId",
    "taskType"::text as "taskType",
    "disposition",
    COUNT(*)::bigint as count,
    COALESCE(SUM("durationSec"), 0)::bigint as "totalDurationSec",
    MIN("startTime") as "minStartTime",
    MAX("endTime") as "maxEndTime"
  FROM "Task"
  WHERE 
    "status" = 'COMPLETED'
    AND "endTime" IS NOT NULL
    AND "endTime" >= ${threeYearsAgo}
    AND ("assignedToId" IS NOT NULL OR "completedBy" IS NOT NULL)
  GROUP BY COALESCE("assignedToId", "completedBy"), "taskType", "disposition"
`;

// Convert to Map for O(1) lookups
const aggregationsByUser = new Map<string, TaskAggregation[]>();
for (const agg of taskAggregations) {
  if (!aggregationsByUser.has(agg.userId)) {
    aggregationsByUser.set(agg.userId, []);
  }
  aggregationsByUser.get(agg.userId)!.push(agg);
}
```

#### 2. Refactor buildAgentScorecard

**Current Logic:**
```typescript
const buildAgentScorecard = (userId, userEmail, userName, startDate, endDate) => {
  const userTasks = tasksByUser.get(userId) || [];
  
  // Filter by date
  const tasks = startDate || endDate
    ? userTasks.filter(t => {
        if (!t.endTime) return false;
        if (startDate && t.endTime < startDate) return false;
        if (endDate && t.endTime > endDate) return false;
        return true;
      })
    : userTasks;
  
  // Count and sum in memory
  const tasksCompleted = tasks.length;
  let totalTimeSec = 0;
  for (const task of tasks) {
    if (task.startTime && task.endTime) {
      totalTimeSec += Math.floor((new Date(task.endTime).getTime() - new Date(task.startTime).getTime()) / 1000);
    }
  }
  // ...
}
```

**New Aggregated Logic:**
```typescript
const buildAgentScorecard = (userId, userEmail, userName, startDate, endDate) => {
  const userAggregations = aggregationsByUser.get(userId) || [];
  
  // Filter aggregations by date range
  const filteredAggregations = startDate || endDate
    ? userAggregations.filter(agg => {
        if (!agg.maxEndTime) return false;
        if (startDate && agg.maxEndTime < startDate) return false;
        if (endDate && agg.maxEndTime > endDate) return false;
        return true;
      })
    : userAggregations;
  
  // Sum counts and durations from aggregations
  const tasksCompleted = filteredAggregations.reduce((sum, agg) => sum + agg.count, 0);
  const totalTimeSec = filteredAggregations.reduce((sum, agg) => sum + agg.totalDurationSec, 0);
  
  // Build breakdown from aggregations
  const breakdown: Record<string, any> = {};
  for (const agg of filteredAggregations) {
    if (!breakdown[agg.taskType]) {
      breakdown[agg.taskType] = { count: 0, weightedPoints: 0, totalSec: 0 };
    }
    breakdown[agg.taskType].count += agg.count;
    breakdown[agg.taskType].totalSec += agg.totalDurationSec;
    // Calculate weighted points
    const weight = getTaskWeight(agg.taskType, agg.disposition);
    breakdown[agg.taskType].weightedPoints += agg.count * weight;
  }
  // ...
}
```

#### 3. Handle Hourly Breakdown

**Option A: Separate Query for Hourly (Recommended)**
```typescript
// Only fetch individual tasks when we need hourly breakdown (today view)
if (startDate && endDate && isTodayView) {
  const hourlyTasks = await prisma.task.findMany({
    where: {
      status: "COMPLETED",
      endTime: { gte: startDate, lte: endDate },
      OR: [
        { assignedToId: userId },
        { completedBy: userId }
      ]
    },
    select: { endTime: true, taskType: true, disposition: true },
    take: 1000 // Limit to prevent huge queries
  });
  // Calculate hourly breakdown from these
}
```

**Option B: Add Hour to Aggregation**
```typescript
// Add hour extraction to aggregation query
SELECT 
  ...,
  EXTRACT(HOUR FROM "endTime") as hour
GROUP BY ..., EXTRACT(HOUR FROM "endTime")
```

#### 4. Handle Days Worked

**Current:**
```typescript
const portalWorkedDates = new Set(tasks.map(t => t.endTime!.toISOString().split('T')[0]));
const daysWorked = portalWorkedDates.size;
```

**New (in aggregation query):**
```typescript
SELECT 
  ...,
  COUNT(DISTINCT DATE("endTime")) as "daysWorked"
```

## Time Estimate

### Total Implementation Time: **4-6 hours**

**Breakdown:**
- **Phase 1 (Core Aggregations)**: 2-3 hours
  - Query replacement: 30 min
  - Refactor buildAgentScorecard: 1-2 hours
  - Edge cases: 30 min
  - Testing: 30 min

- **Phase 2 (Trello)**: ✅ Already done

- **Phase 3 (Special Cases)**: 1-2 hours
  - Hourly breakdown: 30-60 min
  - Days worked: 15 min
  - Idle time: 15-30 min
  - Testing: 30 min

- **Phase 4 (Final Testing)**: 1 hour
  - Compare results: 30 min
  - Performance testing: 15 min
  - Edge cases: 15 min

## Performance Impact

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Query Time | 1,180ms | ~200ms | **83% faster** |
| Data Transfer | 683ms | ~5ms | **99% less data** |
| Memory Usage | High (100k rows) | Low (1k rows) | **99% less** |
| Total Response | 2,664ms | ~255ms | **90% faster** |

### Cache Impact

With caching (5 min TTL):
- **First request**: ~255ms (aggregated) vs ~2,664ms (current)
- **Cached requests**: <10ms (instant)

## Risks & Considerations

### Potential Issues

1. **Hourly Breakdown**: May need separate query or different approach
   - **Risk**: Low - can keep small individual query for this
   - **Impact**: Minimal - only affects today view

2. **Date Filtering**: Aggregations are pre-grouped, filtering happens after
   - **Risk**: Low - filtering on aggregated data is still fast
   - **Impact**: Minimal - we're filtering ~1k rows instead of 100k

3. **Precision Loss**: Using MIN/MAX for dates instead of individual task times
   - **Risk**: Low - acceptable for most calculations
   - **Impact**: Minimal - idle time calculation might be less precise

4. **Testing**: Need to verify numbers match exactly
   - **Risk**: Medium - requires careful testing
   - **Mitigation**: Compare side-by-side before deploying

## Recommendation

**Implement in phases:**

1. **Week 1**: Phase 1 (Core aggregations) - 2-3 hours
   - Biggest performance gain
   - Lowest risk
   - Can test thoroughly

2. **Week 2**: Phase 3 (Special cases) - 1-2 hours
   - Handle edge cases
   - Optimize remaining calculations

**Total Timeline: 1-2 weeks** (with testing and validation)

**Alternative: Do it all at once** - 4-6 hours in one session if you have a focused block of time.

