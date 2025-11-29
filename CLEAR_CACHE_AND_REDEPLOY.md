# Clear Cache and Redeploy Instructions

## Problem
Sentry is still showing `OFFSET $2` in queries even after deployment, suggesting old code is still running.

## Solution: Force Clean Rebuild

### Step 1: Clear Netlify Build Cache (Recommended)

1. Go to **Netlify Dashboard** → Your site
2. Go to **Site settings** → **Build & deploy**
3. Scroll down to **Build settings**
4. Click **"Clear build cache"** button
5. This will force a fresh build on next deployment

### Step 2: Trigger New Deployment

I've just pushed an empty commit to trigger a new deployment. This will:
- ✅ Clear build cache (if configured)
- ✅ Run fresh Prisma generate
- ✅ Build with latest code
- ✅ Deploy new serverless functions

### Step 3: Verify Deployment

1. **Check Netlify Deploy Logs:**
   - Go to Netlify → Deploys
   - Find the new deployment
   - Verify build completed successfully
   - Check that Prisma client was regenerated

2. **Verify Code in Deployment:**
   - In Netlify deploy logs, check the build output
   - Or use Netlify CLI to inspect: `netlify functions:list`
   - Verify the deployed code doesn't have `skip` or `take`

### Step 4: Verify Migration Ran

1. **Check Railway Logs:**
   - Go to Railway → Database service
   - Check logs for: `Applied migration: 20251129133531_add_task_performance_index`
   - If not there, migration might not have run

2. **Check Index Exists:**
   - Connect to Railway database
   - Run: `SELECT indexname FROM pg_indexes WHERE tablename = 'Task' AND indexname LIKE '%status_endTime%';`
   - Should return: `Task_status_endTime_assignedToId_completedBy_idx`

### Step 5: Test After Deployment

1. **Wait 5-10 minutes** for deployment to complete
2. **Make fresh request:**
   - Open agent portal
   - Navigate to Personal Scorecard
   - Wait for it to load
3. **Check Sentry:**
   - Wait 5-10 minutes for Sentry to process
   - Look for NEW transaction (after deployment time)
   - Check if query still has `OFFSET $2`

## Expected Results

**After clean rebuild:**
- ✅ Query should NOT have `OFFSET $2`
- ✅ Query should be fast (~50-200ms)
- ✅ Index should be used (Index Scan)
- ✅ Sentry should not flag slow queries

## If Issue Persists

If after clearing cache and redeploying, Sentry STILL shows OFFSET:

1. **Check if there's a different code path:**
   - Search codebase for other calls to this endpoint
   - Check if there's middleware adding pagination

2. **Verify Prisma version:**
   - Check if Prisma client is up to date
   - Try regenerating: `npx prisma generate`

3. **Check database directly:**
   - Run EXPLAIN ANALYZE on the query
   - See what SQL is actually being executed

4. **Check Netlify function logs:**
   - Look for any errors or warnings
   - Check if old code is being cached

## Alternative: Manual Cache Clear

If automatic cache clear doesn't work:

1. **Netlify CLI:**
   ```bash
   netlify deploy --build --prod
   ```

2. **Or trigger via API:**
   - Use Netlify API to clear cache
   - Then trigger new deployment

## Timeline

- **Now:** Empty commit pushed, deployment triggered
- **5-10 min:** Deployment should complete
- **5-10 min after:** Sentry should show new data
- **Total:** ~15-20 minutes to verify fix

