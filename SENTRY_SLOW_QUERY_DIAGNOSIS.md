# Sentry Slow Query Still Appearing - Diagnosis Guide

## Issue
Sentry is still catching the slow DB query in `/api/agent/personal-scorecard` even after adding the database index.

## Possible Causes

### 1. Migration Hasn't Run Yet (Most Likely)
**Check:**
- Railway logs for migration execution
- Database directly to verify index exists

**Fix:**
- Wait for deployment to complete
- Or manually run: `npx prisma migrate deploy` on Railway

### 2. Code Hasn't Been Deployed Yet
**Check:**
- The Sentry trace timestamp - is it from BEFORE or AFTER the deployment?
- Look at the transaction timestamp in Sentry

**Fix:**
- Wait for code deployment to complete
- Make a new request after deployment to generate fresh Sentry data

### 3. Query Still Has OFFSET (Suspicious)
**Issue:**
- Sentry shows `OFFSET $2` in the query
- But our code explicitly removed OFFSET (line 118 comment says "FIXED: Removed OFFSET")

**Possible Reasons:**
- Old code still running (deployment hasn't completed)
- Prisma is adding OFFSET automatically (unlikely but possible)
- Different code path being used

**Check:**
- Verify the deployed code doesn't have `skip` or `take` in the query
- Check if there's a different endpoint being called

### 4. Index Not Being Used
**Check:**
- Run `EXPLAIN ANALYZE` on the query
- Verify PostgreSQL is using the index

**Possible Reasons:**
- Index doesn't exist (migration didn't run)
- Query planner chose sequential scan (rare with proper index)
- Dataset too small for index to be beneficial

### 5. Wrong Index or Index Order
**Check:**
- Index column order matches query filter order
- Index includes all columns used in WHERE clause

**Our Index:**
```prisma
@@index([status, endTime, assignedToId, completedBy])
```

**Query Filters:**
- `status = 'COMPLETED'`
- `endTime IS NOT NULL`
- `assignedToId IS NOT NULL OR completedBy IS NOT NULL`

**Analysis:**
- ✅ Index order is correct (status first, then endTime)
- ✅ All filter columns are in the index
- ✅ Should work perfectly

---

## Diagnostic Steps

### Step 1: Check Migration Status
```bash
# On Railway, check if migration ran:
# Look for: "Applied migration: 20251129133531_add_task_performance_index"
```

### Step 2: Verify Index Exists
```sql
-- Connect to Railway database and run:
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

**Expected:**
```
Task_status_endTime_assignedToId_completedBy_idx
```

### Step 3: Check Query Execution Plan
```sql
EXPLAIN ANALYZE
SELECT "Task"."id", "Task"."assignedToId", "Task"."completedBy", 
       "Task"."endTime", "Task"."startTime", "Task"."taskType", 
       "Task"."disposition"
FROM "Task"
WHERE (
  "Task"."status" = 'COMPLETED' 
  AND "Task"."endTime" IS NOT NULL 
  AND ("Task"."assignedToId" IS NOT NULL OR "Task"."completedBy" IS NOT NULL)
);
```

**Look for:**
- ✅ "Index Scan using Task_status_endTime_assignedToId_completedBy_idx"
- ❌ "Seq Scan on Task" (means index not being used)

### Step 4: Check Sentry Transaction Timestamp
1. Go to Sentry → Performance → Transactions
2. Find the slow transaction
3. Check the timestamp
4. **Is it from BEFORE or AFTER the deployment?**

### Step 5: Verify Deployed Code
1. Check the deployed code on Netlify/Railway
2. Verify line 118-139 in `/api/agent/personal-scorecard/route.ts`
3. Should NOT have `skip` or `take` parameters
4. Should have comment: "FIXED: Removed OFFSET"

---

## Most Likely Scenario

**The migration and/or code deployment hasn't completed yet.**

**What to do:**
1. Wait 5-10 minutes for deployment to complete
2. Check Railway logs for migration execution
3. Make a fresh request to `/api/agent/personal-scorecard`
4. Check Sentry again (wait 10-15 minutes for new data)

---

## If Issue Persists After Deployment

### Check 1: Is Index Being Used?
Run the test script:
```bash
node scripts/test-index-performance.js
```

### Check 2: Are There Other Slow Queries?
Look at the full Sentry trace - are there OTHER slow queries in the same endpoint?

### Check 3: Is the Query Structure Correct?
Verify the actual query being executed matches our code (no OFFSET).

---

## Expected Timeline

**Immediate (0-5 min):**
- Migration runs on deployment
- Index created in database

**Short-term (5-15 min):**
- New requests use the index
- Performance improvement visible
- Sentry starts showing new data

**If Still Slow After 15 Minutes:**
- Migration may not have run
- Index may not exist
- Query may not be using index
- Need to investigate further

---

## Quick Fix Checklist

- [ ] Check Railway logs - migration ran?
- [ ] Check database - index exists?
- [ ] Check Sentry timestamp - is it old data?
- [ ] Make fresh request - generate new Sentry data
- [ ] Wait 10-15 minutes - let Sentry update
- [ ] Run test script - verify index is working
- [ ] Check EXPLAIN ANALYZE - is index being used?

