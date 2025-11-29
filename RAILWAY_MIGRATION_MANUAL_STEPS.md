# How to Run Migration Manually on Railway

## Context
- **Netlify** = Your deployment platform (where code runs)
- **Railway** = Your database only (PostgreSQL)
- Railway deployment failures are cosmetic - they don't affect your app
- But migrations need to be run on Railway since that's where your database lives

## Step 1: Connect to Railway Database

### Option A: Using Railway CLI (Recommended)

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Link to your project**:
   ```bash
   railway link
   ```
   (Select your text-club project)

4. **Get database connection string**:
   ```bash
   railway variables
   ```
   Look for `DATABASE_URL` - copy this value

### Option B: Get Connection String from Railway Dashboard

1. Go to Railway dashboard
2. Click on your database service
3. Go to "Variables" tab
4. Copy the `DATABASE_URL` value

## Step 2: Run Migration Locally (Pointing to Railway)

1. **Set DATABASE_URL to Railway**:
   ```bash
   export DATABASE_URL="your-railway-database-url-here"
   ```

2. **Run the migration**:
   ```bash
   npx prisma migrate deploy
   ```

   This will:
   - Connect to Railway database
   - Run pending migrations
   - Create the index: `Task_status_endTime_assignedToId_completedBy_idx`

3. **Verify migration ran**:
   ```bash
   npx prisma migrate status
   ```

   Should show all migrations as "Applied"

## Step 3: Verify Index Was Created

### Option A: Using Prisma Studio
```bash
npx prisma studio
```
Then check the Task table indexes

### Option B: Using SQL Query
Connect to Railway database and run:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

**Expected result:**
```
Task_status_endTime_assignedToId_completedBy_idx
CREATE INDEX ... ON "public"."Task"("status", "endTime", "assignedToId", "completedBy")
```

## Step 4: Test the Fix

1. **Wait for Netlify deployment** (after we fix the build error)
2. **Make a request** to Personal Scorecard
3. **Check Sentry** - should see:
   - ✅ No `OFFSET $2` in query
   - ✅ Fast query time (~50-200ms)
   - ✅ Index scan instead of sequential scan

## Troubleshooting

### If `prisma migrate deploy` fails:

1. **Check connection**:
   ```bash
   npx prisma db pull
   ```
   If this works, connection is good

2. **Check migration files exist**:
   ```bash
   ls -la prisma/migrations/
   ```
   Should see: `20251129133531_add_task_performance_index/`

3. **Check if migration already ran**:
   ```bash
   npx prisma migrate status
   ```

### If index doesn't exist after migration:

1. **Check migration SQL**:
   ```bash
   cat prisma/migrations/20251129133531_add_task_performance_index/migration.sql
   ```

2. **Run SQL manually** (if needed):
   ```sql
   CREATE INDEX "Task_status_endTime_assignedToId_completedBy_idx" 
   ON "public"."Task"("status", "endTime", "assignedToId", "completedBy");
   ```

## Quick Reference

**Run migration:**
```bash
export DATABASE_URL="your-railway-url"
npx prisma migrate deploy
```

**Check migration status:**
```bash
npx prisma migrate status
```

**Verify index exists:**
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'Task' 
AND indexname LIKE '%status_endTime%';
```

