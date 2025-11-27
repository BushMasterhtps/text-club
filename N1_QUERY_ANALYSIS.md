# N+1 Query Analysis & Fixes

## Issues Found by Sentry

### 1. `/api/analytics/overview` - Pattern Size: 7
**Problem:** Multiple `prisma.task.count()` calls are being executed sequentially, causing connection pool overhead.

**Current Code:**
- Lines 34-48: One count query
- Lines 51-62: Another count query  
- Lines 65-84: Aggregate query
- Lines 111-158: Multiple count queries in Promise.all (good, but could be optimized)

**Fix:** Combine related count queries using a single query with conditional aggregation.

### 2. `/api/analytics/daily-trends` - Pattern Size: 7-8
**Problem:** Loop iterating over task types, making separate queries for each type (4 queries total).

**Current Code (Lines 56-75):**
```typescript
for (const taskType of taskTypes) {
  const tasks = await prisma.task.findMany({
    where: { taskType, ... },
    select: { endTime: true }
  });
  // Process tasks...
}
```

**Fix:** Fetch all task types in a single query, then group in memory.

### 3. `/api/manager/dashboard/wod-ivcs-detailed-analytics` - Pattern Size: 8
**Problem:** While batch fetching is implemented, the `assignedTo` relation might still cause N+1 if Prisma doesn't batch the relation queries properly.

**Current Code (Lines 55-76):**
- Batch fetching tasks is good
- But `assignedTo` relation might not be batched efficiently

**Fix:** Ensure Prisma batches the relation queries, or fetch users separately in a batch.

## Testing Strategy

1. **Before Fix:**
   - Check Sentry for N+1 query counts
   - Note response times
   - Check database query logs

2. **After Fix:**
   - Verify no N+1 queries in Sentry
   - Compare response times (should be faster)
   - Check that data returned is identical
   - Test with various date ranges

3. **Load Testing:**
   - Test with large date ranges (30+ days)
   - Test with high task counts
   - Monitor database connection pool usage

