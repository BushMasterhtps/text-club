# Database Index Testing Checklist

## Quick Testing Steps

### ✅ Step 1: Verify Migration Ran (2 minutes)

**Option A: Check Railway Logs**
1. Go to Railway dashboard → Your database service
2. Check "Deployments" or "Logs" tab
3. Look for: `Applied migration: 20251129133531_add_task_performance_index`

**Option B: Run Test Script**
```bash
node scripts/test-index-performance.js
```
This will:
- Check if index exists
- Test query performance
- Show if index is being used

**Expected:** Script shows "✅ Index found" and "✅ Index is being used!"

---

### ✅ Step 2: Test in Browser (1 minute)

1. Open your app: `https://your-app.netlify.app`
2. Log in as an agent
3. Navigate to **Personal Scorecard**
4. **Time the page load:**
   - **Before:** ~4-5 seconds
   - **After:** ~1-2 seconds (should be 60-75% faster)

**Expected:** Page loads noticeably faster

---

### ✅ Step 3: Check Network Tab (2 minutes)

1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Navigate to Personal Scorecard
4. Find request: `GET /api/agent/personal-scorecard`
5. Check the **Time** column:
   - **Before:** ~4000-5000ms
   - **After:** ~1000-2000ms

**Expected:** API response time is 60-75% faster

---

### ✅ Step 4: Check Sentry (5 minutes)

1. Go to Sentry dashboard
2. Navigate to **Performance** → **Issues**
3. Look for "Slow DB Query" in `/api/agent/personal-scorecard`
4. **Check if it's still appearing:**
   - **Before:** Appears frequently
   - **After:** Should stop appearing (or appear much less)

5. Go to **Performance** → **Transactions**
6. Filter by: `GET /api/agent/personal-scorecard`
7. Check **p95** (95th percentile) time:
   - **Before:** ~4000-5000ms
   - **After:** ~1000-2000ms

**Expected:** Slow query issue disappears, transaction times improve

**Note:** Wait 10-15 minutes after deployment for new Sentry data

---

## Success Indicators

✅ **Migration Applied:**
- Index exists in database
- No errors in Railway logs

✅ **Performance Improved:**
- Personal scorecard loads 60-75% faster
- API response < 2 seconds (was ~4-5 seconds)

✅ **Sentry Shows Improvement:**
- Slow DB Query issue stops appearing
- Transaction p95 time drops significantly
- Query duration shows ~50-200ms (was ~1750ms)

✅ **No Functionality Broken:**
- All data loads correctly
- Rankings are accurate
- No new errors

---

## Troubleshooting

### Index Not Found?
- Check Railway logs for migration errors
- Verify migration file exists: `prisma/migrations/20251129133531_add_task_performance_index/migration.sql`
- May need to run manually: `npx prisma migrate deploy`

### Performance Didn't Improve?
- Run test script to verify index exists and is being used
- Check EXPLAIN ANALYZE output (see detailed guide)
- Look for other bottlenecks in Sentry

### Sentry Still Shows Slow Query?
- Wait 10-15 minutes for new data
- Make several new requests to generate fresh transactions
- Check transaction timestamp (must be after migration)

---

## Quick Reference

**Test Script:**
```bash
node scripts/test-index-performance.js
```

**Check Index Exists (SQL):**
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

**Expected Index Name:**
```
Task_status_endTime_assignedToId_completedBy_idx
```

**Expected Performance:**
- Query time: < 500ms (was ~1750ms)
- Page load: 1-2 seconds (was 4-5 seconds)
- Sentry: No slow query issues

