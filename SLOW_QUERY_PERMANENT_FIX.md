# Permanent Fix for Slow DB Query in Personal Scorecard

## Why This Keeps Happening

### Root Causes

1. **Large Dataset**: The query fetches ALL completed tasks from the last 3 years (potentially 100k+ rows)
   - Even with indexes, scanning and transferring this much data is slow
   - The composite index helps, but can't eliminate the fundamental issue

2. **The `OFFSET $3` Mystery**
   - **Not in our code**: We don't use `skip` or `take` in the query
   - **Possible causes**:
     - Prisma internally adding pagination for large result sets
     - Old cached query plan from before our fixes
     - Database query planner adding OFFSET for optimization
     - Sentry showing a different query than what's actually running

3. **Serverless Function Caching**
   - Netlify caches serverless functions
   - Old code with slow queries can persist even after fixes
   - Requires explicit cache clearing or new deployments

4. **No Response Caching**
   - Every request hits the database
   - Multiple users requesting scorecards = multiple slow queries
   - No protection against repeated expensive operations

## Fixes Applied

### ✅ 1. Response Caching (Just Added)
- **What**: In-memory cache with 5-minute TTL
- **Impact**: Prevents repeated slow queries for the same user
- **Benefit**: First request is slow, subsequent requests are instant (for 5 min)

### ✅ 2. Optimized Trello Query (Already Fixed)
- Removed nested `select` for `agent.email`
- Uses `agentId` directly with Map lookups
- Eliminates slow database joins

### ✅ 3. Composite Index (Already Applied)
- Index on `(status, endTime, assignedToId, completedBy)`
- Helps PostgreSQL optimize the query

## Additional Permanent Solutions

### Option 1: Use Database Aggregations (Recommended for Long-term)

Instead of fetching all tasks, use SQL `GROUP BY` to aggregate at the database level:

```typescript
// Instead of: fetch all tasks, then count in memory
// Use: database counts directly
const taskStats = await prisma.$queryRaw`
  SELECT 
    COALESCE("assignedToId", "completedBy") as "userId",
    "taskType",
    COUNT(*) as count,
    SUM("durationSec") as totalDuration
  FROM "Task"
  WHERE status = 'COMPLETED' AND "endTime" >= ${threeYearsAgo}
  GROUP BY COALESCE("assignedToId", "completedBy"), "taskType"
`;
```

**Benefits**:
- Database does the work (much faster)
- Transfers only aggregated data (not all rows)
- No OFFSET needed (small result set)

**Trade-off**: Requires refactoring `buildAgentScorecard` to work with aggregated data

### Option 2: Materialized Views (Best Performance)

Pre-compute aggregations in the database:

```sql
CREATE MATERIALIZED VIEW task_stats_by_agent AS
SELECT 
  COALESCE("assignedToId", "completedBy") as "userId",
  "taskType",
  COUNT(*) as count,
  SUM("durationSec") as totalDuration,
  MIN("startTime") as minStartTime,
  MAX("endTime") as maxEndTime
FROM "Task"
WHERE status = 'COMPLETED'
GROUP BY COALESCE("assignedToId", "completedBy"), "taskType";

-- Refresh periodically (e.g., every 15 minutes)
REFRESH MATERIALIZED VIEW task_stats_by_agent;
```

**Benefits**:
- Pre-computed = instant queries
- Can refresh on schedule or trigger
- Best performance for read-heavy workloads

**Trade-off**: Data is slightly stale (15 min refresh interval)

### Option 3: Background Job + Cache

Pre-compute scorecards in a background job:

```typescript
// Background job (runs every 15 minutes)
async function precomputeScorecards() {
  // Run the expensive query once
  // Store results in cache/database
  // All API requests serve from cache
}
```

**Benefits**:
- API responses are instant
- Database load is predictable
- Can use longer cache TTLs (15-30 min)

**Trade-off**: Requires job scheduler (e.g., cron, Vercel Cron, etc.)

### Option 4: Reduce Date Range

Instead of 3 years, use a shorter window:

- **Lifetime**: Last 1 year (instead of 3)
- **Sprint**: Current sprint only
- **Today**: Today only

**Benefits**:
- Smaller dataset = faster queries
- Most recent data is most relevant anyway

**Trade-off**: Loses historical context beyond 1 year

## Recommended Approach

**Short-term (Now)**:
1. ✅ Response caching (5 min TTL) - **DONE**
2. ✅ Optimized Trello query - **DONE**
3. ✅ Composite index - **DONE**

**Medium-term (Next Sprint)**:
1. Implement database aggregations (Option 1)
2. Increase cache TTL to 15 minutes
3. Add cache invalidation on task completion

**Long-term (Future)**:
1. Consider materialized views (Option 2) if data grows
2. Or background job pre-computation (Option 3)

## Why OFFSET Appears

The `OFFSET $3` in Sentry is likely:
1. **Prisma internal behavior**: Prisma may add OFFSET for very large result sets to prevent memory issues
2. **Old cached query**: Sentry might be showing an old query from before our fixes
3. **Database query planner**: PostgreSQL might add OFFSET as an optimization

**To verify**: Check the actual query in production logs, not just Sentry. Sentry might be showing a different query than what's actually running.

## Testing the Fix

1. **Clear Netlify cache**: "Clear cache and deploy site"
2. **Test the endpoint**: First request should be slow (expected), second request within 5 min should be instant
3. **Monitor Sentry**: Should see fewer slow query events (cached responses don't hit the database)

## If Issues Persist

1. **Check actual query logs**: Verify what query is actually running
2. **Increase cache TTL**: Change from 5 min to 15 min
3. **Implement aggregations**: Move to Option 1 (database aggregations)
4. **Consider database upgrade**: If dataset continues growing, may need more resources

