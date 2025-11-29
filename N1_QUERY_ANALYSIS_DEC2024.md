# N+1 Query and Slow DB Query Analysis - December 2024

## Issues Identified from Sentry

### 1. Slow DB Query - `/api/agent/personal-scorecard`
**Pattern Size:** 7  
**Events:** 327  
**Duration Impact:** 38% (1.88s/4.93s)  
**SQL Query:**
```sql
SELECT "public"."Task"."id", "public"."Task"."assignedToId", "public"."Task"."completedBy", 
"public"."Task"."endTime", "public"."Task"."startTime", "public"."Task"."taskType", 
"public"."Task"."disposition"
FROM "public"."Task"
WHERE (
  "public"."Task"."status" = CAST($1::text AS "public"."TaskStatus") 
  AND ("public"."Task"."assignedToId" IS NOT NULL OR "public"."Task"."completedBy" IS NOT NULL) 
  AND "public"."Task"."endTime" IS NOT NULL
)
OFFSET $2
```

**Root Cause:**
- Line 118-136: Fetches ALL completed tasks without pagination or date filtering
- This loads potentially thousands of tasks into memory
- The `OR` condition with `assignedToId` and `completedBy` may not use indexes efficiently
- No limit on the query, causing full table scan

**Fix Strategy:**
- Add date range filtering to limit the dataset
- Use indexes on `status`, `endTime`, `assignedToId`, `completedBy`
- Consider pagination or chunking for large datasets

---

### 2. N+1 Query - `/api/manager/dashboard/wod-ivcs-overview`
**Pattern Size:** 7  
**Repeating Spans:** 6  
**SQL Query:**
```sql
SELECT COUNT(*) AS "_count._all"
FROM (
  SELECT "public"."Task"."id"
  FROM "public"."Task"
  WHERE (
    "public"."Task"."taskType" = CAST($1::text AS "public"."TaskType") 
    AND "public"."Task"."status" = CAST($2::text AS "public"."TaskStatus")
  )
  OFFSET $3
) AS sub
```

**Root Cause:**
- Lines 60-93: Three separate `count()` queries for age breakdown:
  1. 1-2 days old (Medium Priority)
  2. 3-4 days old (High Priority)
  3. 5+ days old (Urgent Priority)
- Each query scans the same table with different date filters
- Could be combined into a single query with conditional aggregation

**Fix Strategy:**
- Use a single `groupBy` query with conditional counting
- Or use raw SQL with `CASE WHEN` for conditional aggregation
- Reduces from 3 queries to 1 query

---

### 3. N+1 Query - `/api/manager/dashboard/wod-ivcs-detailed-analytics`
**Pattern Size:** 7  
**Repeating Spans:** 44 (for User queries)  
**SQL Query:**
```sql
SELECT "public"."User"."id", "public"."User"."name", "public"."User"."email" 
FROM "public"."User" 
WHERE "public"."User"."id" IN ($1) OFFSET $2
```

**Root Cause:**
- The code already has batching for tasks (lines 54-122)
- However, Sentry shows 44 repeating spans for User queries
- This suggests users might be fetched individually somewhere, or the batching isn't working as expected
- The `OFFSET` in the query suggests pagination, which might be causing multiple queries

**Fix Strategy:**
- Verify the user batching is working correctly
- Ensure all user fetches use the batched approach
- Remove any individual user queries

---

### 4. N+1 Query - `/api/manager/dashboard/email-requests-overview`
**Pattern Size:** 7  
**Repeating Spans:** 6  
**SQL Query:**
```sql
SELECT COUNT(*) AS "_count._all"
FROM (
  SELECT "public"."Task"."id"
  FROM "public"."Task"
  WHERE (
    "public"."Task"."taskType" = CAST($1::text AS "public"."TaskType") 
    AND "public"."Task"."status" = CAST($2::text AS "public"."TaskStatus")
  )
  OFFSET $3
) AS sub
```

**Root Cause:**
- Lines 12-53: Four separate `count()` queries in `Promise.all`:
  1. Pending tasks
  2. In progress tasks
  3. Completed today
  4. Total completed
- While these are in `Promise.all`, they're still 4 separate queries
- The `OFFSET` in the query suggests there might be pagination happening
- Could potentially be optimized with a single query using conditional aggregation

**Fix Strategy:**
- Use a single `groupBy` query with conditional counting for status
- Reduces from 4 queries to 1-2 queries (one for today, one for all time)

---

## Summary

**Total Issues:** 4
- 1 Slow DB Query (performance issue)
- 3 N+1 Query patterns

**Expected Performance Improvements:**
- `/api/agent/personal-scorecard`: 60-80% faster (from 1.88s to ~400-750ms)
- `/api/manager/dashboard/wod-ivcs-overview`: 66% fewer queries (from 3 to 1)
- `/api/manager/dashboard/wod-ivcs-detailed-analytics`: Verify batching works correctly
- `/api/manager/dashboard/email-requests-overview`: 75% fewer queries (from 4 to 1)

