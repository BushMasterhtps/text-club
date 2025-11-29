# Fix Build Error & Run Migration

## Understanding Your Setup
- **Netlify** = Deployments (where your code runs)
- **Railway** = Database only (PostgreSQL)
- Railway deployment failures are cosmetic - ignore them

## Part 1: Run Migration on Railway (Database)

Since Railway is just your database, you need to run the migration manually:

### Step 1: Get Railway Database URL

**Option A: Railway Dashboard**
1. Go to Railway dashboard
2. Click on your database service
3. Go to "Variables" tab
4. Copy the `DATABASE_URL` value

**Option B: Railway CLI**
```bash
railway variables
```

### Step 2: Run Migration Locally (Pointing to Railway)

1. **Set DATABASE_URL**:
   ```bash
   export DATABASE_URL="your-railway-database-url-here"
   ```

2. **Run migration**:
   ```bash
   npx prisma migrate deploy
   ```

   This will:
   - Connect to Railway database
   - Run pending migrations
   - Create the index: `Task_status_endTime_assignedToId_completedBy_idx`

3. **Verify it worked**:
   ```bash
   npx prisma migrate status
   ```

   Should show: `20251129133531_add_task_performance_index` as "Applied"

### Step 3: Verify Index Exists

```bash
npx prisma db execute --stdin
```

Then paste:
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

Should return: `Task_status_endTime_assignedToId_completedBy_idx`

---

## Part 2: Fix Netlify Build Error

The build is failing on `/api/auth/me`. This is likely a Prisma client issue.

### Quick Fix: Force Prisma Regeneration

The build script should already do this, but let's verify:

1. **Check `package.json` build script**:
   ```json
   "build": "rm -rf node_modules/.prisma && npx prisma generate && next build --turbopack"
   ```

2. **If build still fails, try**:
   - Clear Netlify build cache
   - Trigger new deployment

### Alternative: Check Build Logs

1. Go to Netlify → Deploys
2. Click on the failed deployment
3. Check the build logs for the exact error
4. Look for Prisma-related errors

---

## Part 3: Test After Fixes

1. **Wait for Netlify deployment** to complete
2. **Make a request** to Personal Scorecard
3. **Check Sentry** - should see:
   - ✅ No `OFFSET $2` in query
   - ✅ Fast query time (~50-200ms)
   - ✅ Index scan instead of sequential scan

---

## Quick Commands Reference

**Run migration:**
```bash
export DATABASE_URL="your-railway-url"
npx prisma migrate deploy
```

**Check migration status:**
```bash
npx prisma migrate status
```

**Verify index:**
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

**Clear Netlify cache:**
- Netlify Dashboard → Site Settings → Build & Deploy → Clear build cache

---

## Expected Timeline

1. **Run migration** (2 minutes)
2. **Fix Netlify build** (5-10 minutes)
3. **Wait for deployment** (5-10 minutes)
4. **Test** (2 minutes)
5. **Check Sentry** (5-10 minutes wait for data)

**Total: ~20-30 minutes**

