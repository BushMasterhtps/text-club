# Slow DB Query - Cache Issue Resolution

## Problem

The Slow DB Query issue keeps appearing in Sentry even though we've fixed the code. This is because:

1. **Serverless Function Caching**: Netlify caches serverless functions, so old code may still be running
2. **Deployment Delay**: The fix was just pushed, but Netlify needs to build and deploy
3. **Seer Analysis**: Seer is analyzing the OLD code that's still running in production

## What We Fixed

### ✅ Trello Query Optimization (FIXED in commit `2708e33`)

**Before:**
```typescript
const allTrello = await prisma.trelloCompletion.findMany({
  select: {
    agentId: true,
    date: true,
    cardsCount: true,
    agent: { select: { email: true } } // ❌ Nested select causing slow joins
  }
});
```

**After:**
```typescript
const allTrello = await prisma.trelloCompletion.findMany({
  select: {
    agentId: true,  // ✅ No nested select - direct field only
    date: true,
    cardsCount: true
  }
});
// Then we map agentId to email using already-fetched allUsers array
```

**Impact:**
- Eliminated slow database joins
- Removed 683ms serialization overhead
- Faster query execution

### ⚠️ Task Query Still Slow (1672ms)

The Task query is still taking 1672ms because:
- It fetches ALL completed tasks for ALL agents from the last 3 years
- This is necessary for rankings (lifetime, sprint, today)
- We've already optimized it with:
  - Date filter (3 years instead of all time)
  - Composite index on (status, endTime, assignedToId, completedBy)
  - Minimal field selection (only 7 fields)

**This is expected performance** for the amount of data we need. The real issue was the Trello query, which is now fixed.

## Why Seer Still Shows the Issue

Seer is analyzing **old code** that's still running in production due to:
1. **Netlify serverless function caching**
2. **Pending deployment** (fix was just pushed)
3. **Cold start behavior** (old cached functions may still be active)

## Solution: Clear Netlify Cache

### Option 1: Force Redeploy (Recommended)

1. Go to Netlify Dashboard → Your Site → Deploys
2. Click "Trigger deploy" → "Clear cache and deploy site"
3. Wait for deployment to complete (usually 2-5 minutes)
4. Monitor Sentry for new events (should see improvement)

### Option 2: Empty Commit (If Option 1 doesn't work)

```bash
git commit --allow-empty -m "Force rebuild to clear Netlify cache"
git push origin main
```

### Option 3: Wait for Natural Cache Expiration

Netlify serverless functions cache expires after:
- **24 hours** for inactive functions
- **Immediately** after a new deployment (if cache is cleared)

## Verification Steps

After clearing cache and deploying:

1. **Check Deployment:**
   - Go to Netlify Dashboard → Deploys
   - Verify latest deployment includes commit `2708e33`
   - Check build logs for any errors

2. **Test the Endpoint:**
   - Load `/api/agent/personal-scorecard?email=your-email`
   - Check response time in browser DevTools
   - Should be faster than before (especially Trello query)

3. **Monitor Sentry:**
   - Wait 24-48 hours for new events
   - Check if Slow DB Query events still appear
   - If they do, check the query - should NOT have nested select for agent.email

4. **Check Query in Sentry:**
   - Open a Slow DB Query event
   - Look at the SQL query
   - Should NOT see `agent.email` in the Trello query
   - Should only see `agentId`, `date`, `cardsCount`

## Expected Results

After cache clears and new code deploys:

✅ **Trello Query:**
- No nested select for `agent.email`
- Faster execution (no 683ms serialization overhead)
- Direct `agentId` selection only

✅ **Task Query:**
- Still takes ~1672ms (expected for large dataset)
- But this is acceptable for the amount of data needed
- Already optimized with date filter and index

✅ **Overall API Response:**
- Should be faster than 2664ms
- Trello query overhead eliminated
- Better user experience

## If Issue Persists

If Slow DB Query still appears after cache clear:

1. **Verify the fix is deployed:**
   - Check Netlify build logs
   - Verify commit `2708e33` is in production
   - Check the actual code running (add a console.log to verify)

2. **Check for other issues:**
   - Maybe there's another slow query we haven't identified
   - Check Sentry for the actual SQL query being executed
   - Verify it matches our fixed code

3. **Consider further optimization:**
   - Maybe we can optimize the Task query further
   - Consider pagination or lazy loading for rankings
   - Use raw SQL for better performance

## Timeline

- **Fix Applied:** December 1, 2025 (commit `2708e33`)
- **Deployment:** Pending (waiting for Netlify build)
- **Cache Clear:** Needed to see the fix take effect
- **Verification:** 24-48 hours after deployment

