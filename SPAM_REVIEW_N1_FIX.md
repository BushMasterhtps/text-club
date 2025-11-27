# Spam Review N+1 Query Fix

## Problem Identified

**Endpoint:** `/api/manager/spam/review`  
**Issue:** N+1 query pattern with 100 repeating spans  
**Pattern Size:** 7

### Root Cause

The endpoint was calling `getImprovedSpamScore()` for each row individually:

```typescript
const items = await Promise.all(rows.map(async (r) => {
  const learningResult = await getImprovedSpamScore(r.text, r.brand);
  // ... process result
}));
```

Each call to `getImprovedSpamScore()` makes a separate database query to `SpamLearning`:
- If there are 100 rows, it makes 100 separate queries
- This is the classic N+1 pattern (1 query to get rows, N queries for learning data)

### The Fix

Replaced individual calls with the existing batch function `getBatchImprovedSpamScores()`:

**Before:**
- 1 query to get RawMessages
- N queries to get SpamLearning data (one per row)
- **Total: 1 + N queries**

**After:**
- 1 query to get RawMessages
- 1 batch query to get all SpamLearning data
- **Total: 2 queries** (regardless of row count)

### Code Changes

1. **Import change:**
   ```typescript
   // Before
   import { getImprovedSpamScore } from "@/lib/spam-detection";
   
   // After
   import { getBatchImprovedSpamScores } from "@/lib/spam-detection";
   ```

2. **Query optimization:**
   ```typescript
   // Before: N individual queries
   const items = await Promise.all(rows.map(async (r) => {
     const learningResult = await getImprovedSpamScore(r.text, r.brand);
     // ...
   }));
   
   // After: 1 batch query
   const itemsForBatch = rows.map(r => ({ text: r.text || '', brand: r.brand || undefined }));
   const learningScoresMap = await getBatchImprovedSpamScores(itemsForBatch);
   const items = rows.map((r) => {
     const itemKey = `${(r.text || '').substring(0, 50)}|${r.brand || ''}`;
     const learningResult = learningScoresMap.get(itemKey);
     // ... process result
   });
   ```

## Functionality Preserved

✅ **Response format:** Identical to before  
✅ **Learning scores:** Same calculation logic  
✅ **Spam source detection:** Unchanged  
✅ **Error handling:** Improved with fallback  
✅ **Performance:** Dramatically improved

## Expected Performance Improvement

- **Before:** ~100 queries for 100 rows = ~2-5 seconds
- **After:** 2 queries for any number of rows = ~100-300ms
- **Improvement:** 90-95% faster, 98% fewer queries

## Testing

1. **Verify data accuracy:**
   - Compare learning scores before/after
   - Verify spam source detection works correctly
   - Check that all items are returned

2. **Monitor Sentry:**
   - Pattern size should drop from 7 to 1-2
   - No more "Repeating Spans" for SpamLearning queries
   - Response times should improve significantly

3. **Load testing:**
   - Test with 50, 100, 200 rows
   - Verify consistent performance regardless of row count
   - Check database connection pool usage

## Rollback Plan

If issues occur:
1. Revert to `getImprovedSpamScore` import
2. Restore the `Promise.all(rows.map(...))` pattern
3. Monitor for any data discrepancies

