# Database Index Performance Testing Guide

## How to Verify the Index Fix Worked

### Step 1: Verify Migration Ran Successfully

**Check Railway Logs:**
1. Go to your Railway dashboard
2. Navigate to your database service
3. Check the "Deployments" or "Logs" tab
4. Look for the migration execution:
   ```
   Running migration: 20251129133531_add_task_performance_index
   Applied migration: 20251129133531_add_task_performance_index
   ```

**Or Check Database Directly:**
```sql
-- Connect to your Railway database and run:
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

**Expected Result:**
You should see:
```
Task_status_endTime_assignedToId_completedBy_idx
CREATE INDEX ... ON "public"."Task"("status", "endTime", "assignedToId", "completedBy")
```

---

### Step 2: Test the Personal Scorecard Endpoint

**Method 1: Browser Test (Easiest)**
1. Open your app in browser
2. Navigate to the Personal Scorecard (agent portal)
3. **Before Index:** Page loads in ~4-5 seconds
4. **After Index:** Page should load in ~1-2 seconds

**Method 2: Network Tab (More Detailed)**
1. Open browser DevTools (F12)
2. Go to "Network" tab
3. Navigate to Personal Scorecard
4. Find the request to `/api/agent/personal-scorecard`
5. Check the "Time" column:
   - **Before:** ~4000-5000ms
   - **After:** ~1000-2000ms (should be 60-75% faster)

**Method 3: Direct API Test**
```bash
# Replace with your actual email and domain
curl -X GET "https://your-app.netlify.app/api/agent/personal-scorecard?email=your-email@goldencustomercare.com" \
  -H "Cookie: your-session-cookie" \
  --time-total
```

**Expected Result:**
- Response time should be significantly faster
- No timeout errors
- Data loads correctly

---

### Step 3: Check Sentry Dashboard

**What to Look For:**

1. **Slow DB Query Issue Should Disappear:**
   - Go to Sentry → Performance → Issues
   - Look for "Slow DB Query" in `/api/agent/personal-scorecard`
   - **Before:** Issue appears frequently
   - **After:** Issue should stop appearing (or appear much less)

2. **Transaction Performance:**
   - Go to Sentry → Performance → Transactions
   - Filter by: `GET /api/agent/personal-scorecard`
   - Check the "p50" (median) and "p95" (95th percentile) times:
     - **Before:** p95 ~4000-5000ms
     - **After:** p95 ~1000-2000ms

3. **Span Evidence:**
   - Click on a transaction
   - Look at "Span Evidence"
   - **Before:** Shows "Slow DB Query" with 1.75s duration
   - **After:** Should show much faster query time (~50-200ms)

**Timeline:**
- Wait 10-15 minutes after deployment for new data
- Check Sentry after you've made a few requests to the endpoint

---

### Step 4: Verify Index Is Being Used

**Check Query Execution Plan (Advanced):**

If you have direct database access, you can verify PostgreSQL is using the index:

```sql
-- Connect to Railway database and run:
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

**What to Look For:**

**Before (Without Index):**
```
Seq Scan on Task  (cost=0.00..50000.00 rows=100000 width=100)
  Filter: ((status = 'COMPLETED') AND (endTime IS NOT NULL) AND ...)
  Rows Removed by Filter: 500000
  Planning Time: 0.123 ms
  Execution Time: 1750.456 ms  ← SLOW
```

**After (With Index):**
```
Index Scan using Task_status_endTime_assignedToId_completedBy_idx
  (cost=0.42..5000.00 rows=100000 width=100)
  Index Cond: ((status = 'COMPLETED') AND (endTime IS NOT NULL) AND ...)
  Planning Time: 0.234 ms
  Execution Time: 150.234 ms  ← FAST
```

**Key Indicators:**
- ✅ "Index Scan" instead of "Seq Scan"
- ✅ Index name appears in the plan
- ✅ Execution Time is much lower

---

### Step 5: Monitor Over Time

**Daily Check (First Week):**
1. Check Sentry Performance dashboard
2. Look for any new slow queries
3. Verify response times stay fast

**Weekly Check:**
1. Review Sentry trends
2. Confirm no regression
3. Check database performance metrics in Railway

---

## Success Criteria

✅ **Migration Applied:**
- Index exists in database
- No migration errors in logs

✅ **Performance Improved:**
- Personal scorecard loads 60-75% faster
- API response time < 2 seconds (was ~4-5 seconds)

✅ **Sentry Shows Improvement:**
- Slow DB Query issue stops appearing
- Transaction p95 time drops significantly
- Query duration in spans shows ~50-200ms (was ~1750ms)

✅ **No Functionality Broken:**
- All data still loads correctly
- Rankings still accurate
- No new errors

---

## Troubleshooting

### If Migration Didn't Run

**Check Railway:**
- Look for deployment errors
- Check if `prisma migrate deploy` runs automatically
- May need to run manually: `npx prisma migrate deploy`

### If Performance Didn't Improve

**Possible Causes:**
1. **Index not created:** Check database for index existence
2. **Query not using index:** Check EXPLAIN ANALYZE output
3. **Other bottleneck:** Check for other slow queries in the endpoint
4. **Small dataset:** If you have < 10,000 tasks, improvement may be less noticeable

**Debug Steps:**
1. Verify index exists: `SELECT * FROM pg_indexes WHERE tablename = 'Task';`
2. Check query plan: Run EXPLAIN ANALYZE
3. Check Sentry for other slow queries in the same endpoint

### If Sentry Still Shows Slow Query

**Wait Time:**
- Sentry may show old data for 10-15 minutes
- Make several new requests to generate fresh data
- Check that you're looking at new transactions (not cached)

**Verify:**
- Check transaction timestamp in Sentry
- Make sure it's after the migration ran
- Look at the actual query duration in span details

---

## Quick Test Checklist

- [ ] Migration appears in Railway logs
- [ ] Index exists in database (check with SQL query)
- [ ] Personal scorecard loads faster in browser
- [ ] Network tab shows faster API response
- [ ] Sentry shows improved transaction times
- [ ] Slow DB Query issue stops appearing
- [ ] All functionality still works correctly

---

## Expected Timeline

**Immediate (0-5 minutes):**
- Migration runs on deployment
- Index created in database

**Short-term (5-15 minutes):**
- New requests use the index
- Performance improvement visible
- Sentry starts showing new data

**Long-term (24-48 hours):**
- Sentry trends show sustained improvement
- Slow query issue completely resolved
- Performance metrics stabilize

---

## What Success Looks Like

**Before:**
- Personal scorecard: 4-5 seconds to load
- Sentry: Slow DB Query (1.75s) appearing frequently
- User experience: Noticeable delay

**After:**
- Personal scorecard: 1-2 seconds to load
- Sentry: No slow query issues, fast query times
- User experience: Snappy, responsive

---

## Need Help?

If the index doesn't seem to be working:
1. Check Railway logs for migration errors
2. Verify index exists in database
3. Check EXPLAIN ANALYZE to see if index is used
4. Look at Sentry for other bottlenecks
5. Check if there are other slow queries in the same endpoint

