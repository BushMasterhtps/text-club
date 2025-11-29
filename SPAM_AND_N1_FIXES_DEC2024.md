# Spam Preview/Capture Errors and N+1 Query Fixes - December 2024

## Issues Fixed

### 1. Spam Preview HTTP 500 Error ✅

**Problem:**
- Preview spam was calling `getImprovedSpamScore()` individually for each message (up to 200)
- Each call made a separate database query = 200+ queries
- With 1830 messages, this caused timeout or connection pool exhaustion

**Root Cause:**
```typescript
// BEFORE: N individual queries
if (hits.length === 0 && rm.text && i < 200) {
  const learningResult = await getImprovedSpamScore(rm.text, rm.brand);
  // ... individual query for each message
}
```

**Fix Applied:**
- Collect all items needing learning check first
- Use `getBatchImprovedSpamScores()` to fetch all learning data in one query
- Reduces from 200+ queries to 1 query

**Code Changes:**
```typescript
// AFTER: Batch fetch
const itemsForLearning = []; // Collect items first
// ... process phrase/pattern rules ...
// Then batch fetch all learning scores
const learningScoresMap = await getBatchImprovedSpamScores(itemsForBatch);
// Process results from map
```

**Expected Improvement:**
- 99% fewer queries (200+ → 1)
- Faster response time
- No more timeouts

---

### 2. Sentry Not Catching Errors ✅

**Problem:**
- Errors appeared in console but not in Sentry
- Self-healing wrapper caught errors but didn't report them

**Root Cause:**
- `withSelfHealing` wrapper didn't capture exceptions to Sentry
- Error handlers in spam endpoints didn't capture to Sentry

**Fix Applied:**
1. Added `Sentry.captureException()` to `withSelfHealing` wrapper
2. Added explicit Sentry capture in spam preview/capture error handlers

**Code Changes:**
```typescript
// In wrapper.ts
catch (error) {
  Sentry.captureException(error, {
    tags: { service, selfHealing: 'retry-failed' },
    extra: { useRetry: true }
  });
  throw error;
}

// In spam endpoints
catch (error: any) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureException(error, {
    tags: { endpoint: 'spam-preview', service: 'spam-detection' },
    extra: { messageCount: raws.length }
  });
  // ... return error response
}
```

**Expected Result:**
- All errors now captured in Sentry
- Better error tracking and debugging
- Error context included (message counts, service names, etc.)

---

### 3. N+1 Query - `/api/manager/analytics/sprint-history` ✅

**Problem:**
- Pattern Size: 7, 6 Repeating Spans
- Made separate `findMany` query for each sprint number
- 6 sprints = 6 separate queries

**Root Cause:**
```typescript
// BEFORE: N separate queries
const sprintHistory = await Promise.all(
  sprintNumbers.map(async (sprintNum) => {
    const rankings = await prisma.sprintRanking.findMany({
      where: { sprintNumber: sprintNum, isSenior: false }
    });
    // ... process
  })
);
```

**Fix Applied:**
- Batch fetch all sprint rankings in one query
- Group by sprint number in memory
- Process using pre-fetched data

**Code Changes:**
```typescript
// AFTER: Single batch query
const allRankings = await prisma.sprintRanking.findMany({
  where: {
    sprintNumber: { in: sprintNumbers },
    isSenior: false
  },
  orderBy: [{ sprintNumber: 'desc' }, { rankByPtsPerDay: 'asc' }]
});

// Group by sprint number
const rankingsBySprint = new Map();
for (const ranking of allRankings) {
  // ... group by sprintNumber
}

// Process using pre-fetched data (no additional queries)
const sprintHistory = sprintNumbers.map((sprintNum) => {
  const rankings = rankingsBySprint.get(sprintNum) || [];
  // ... process
});
```

**Expected Improvement:**
- 83% fewer queries (6 → 1)
- Faster response time
- Reduced database load

---

### 4. Slow DB Query - `/api/agent/personal-scorecard` ⚠️

**Problem:**
- Duration Impact: 39% (1.56s/4.01s)
- Query shows `OFFSET $2` in Sentry (unexpected)
- Fetching ALL completed tasks without limits

**Analysis:**
- The endpoint needs ALL tasks for ranking calculations (lifetime, sprint, today, weekly)
- Can't add date limits without breaking functionality
- The `OFFSET` in Sentry might be from Prisma's internal pagination or a different query

**Recommendation:**
- This might require database indexing improvements rather than code changes
- Consider adding composite indexes on `(status, endTime, assignedToId, completedBy)`
- Monitor if the issue persists after other fixes

**Note:** The query structure was already optimized in previous fix. The slow query might be due to dataset size rather than query structure.

---

## Summary of Fixes

✅ **Spam Preview:** Fixed N+1 query (200+ queries → 1 query)  
✅ **Sentry Integration:** Added error capture to wrapper and spam endpoints  
✅ **Sprint History:** Fixed N+1 query (6 queries → 1 query)  
⚠️ **Personal Scorecard:** May need database indexing (query structure already optimized)

## Expected Performance Improvements

- **Spam Preview:** 99% fewer queries, no more timeouts
- **Sprint History:** 83% fewer queries, faster response
- **Error Tracking:** All errors now visible in Sentry
- **Overall:** Better reliability and performance

## Testing Checklist

- [ ] Verify spam preview works with large message counts (1000+)
- [ ] Verify spam capture completes without timeout
- [ ] Check Sentry for error captures (should see errors now)
- [ ] Verify sprint history loads faster
- [ ] Monitor personal-scorecard performance (may need indexing)

