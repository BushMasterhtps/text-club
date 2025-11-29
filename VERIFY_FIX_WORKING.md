# How to Verify the Index Fix is Working

## ✅ Good Signs (What You're Seeing)

1. **No new slow query issues in Sentry** ← This is excellent!
2. **Multiple requests made** (actioned task, completed task)
3. **Sentry not catching slow queries** ← Means queries are fast now

## Why You Might Not See Logs

**Sentry only flags queries that are SLOW.**

- **Before:** Query took ~1.29s → Sentry flagged it as "Slow DB Query"
- **After:** Query takes ~50-200ms → Sentry doesn't flag it (it's fast!)

**This is actually GOOD news!** It means the fix is working.

---

## How to Verify the Fix is Working

### Method 1: Check Sentry Performance Metrics (Best)

1. Go to **Sentry → Performance → Transactions**
2. Filter by: `GET /api/agent/personal-scorecard`
3. Look at recent transactions (after 1:43 PM PST)
4. Check the **p50** and **p95** times:
   - **Before:** p95 ~4000-5000ms
   - **After:** p95 ~1000-2000ms (should be 60-75% faster)

5. Click on a recent transaction
6. Look at the **span details**:
   - **Before:** Database query span ~1.29s
   - **After:** Database query span ~50-200ms

**If you see faster times, the fix is working!**

---

### Method 2: Check Transaction Duration

1. Go to **Sentry → Performance → Transactions**
2. Find recent `/api/agent/personal-scorecard` transactions
3. Check the **total duration**:
   - **Before:** ~4-5 seconds total
   - **After:** ~1-2 seconds total

**If transactions are faster, the fix is working!**

---

### Method 3: Run Test Script (Optional)

If you want to verify the index exists and is being used:

```bash
node scripts/test-index-performance.js
```

This will tell you:
- ✅ Index exists
- ✅ Index is being used
- ✅ Query is fast

---

### Method 4: Check Browser Performance

1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Navigate to Personal Scorecard
4. Find: `GET /api/agent/personal-scorecard`
5. Check the **Time** column:
   - **Before:** ~4000-5000ms
   - **After:** ~1000-2000ms

**If it loads faster, the fix is working!**

---

## What to Look For in 15 Minutes

### ✅ Success Indicators:

1. **No new "Slow DB Query" issues** in Sentry
2. **Transaction times are lower** in Performance → Transactions
3. **Query spans are faster** (< 200ms instead of ~1.29s)
4. **Page loads faster** in browser

### ⚠️ If You Still See Issues:

1. Check transaction timestamp (must be after 1:43 PM PST)
2. Verify migration ran (check Railway logs)
3. Run test script to verify index exists
4. Check if there are OTHER slow queries in the same endpoint

---

## Expected Timeline

**Immediate (0-5 min):**
- ✅ Migration runs on deployment
- ✅ Index created in database

**Short-term (5-15 min):**
- ✅ New requests use the index
- ✅ Performance improvement visible
- ✅ Sentry stops flagging slow queries

**Long-term (24-48 hours):**
- ✅ Sentry trends show sustained improvement
- ✅ No slow query issues
- ✅ Performance metrics stabilize

---

## Summary

**What you're seeing:**
- ✅ No new slow query issues
- ✅ Multiple requests made
- ✅ Sentry not catching problems

**This means:**
- ✅ The fix is likely working!
- ✅ Queries are now fast
- ✅ Sentry doesn't flag fast queries

**Next steps:**
1. Wait 15 minutes as planned
2. Check Sentry Performance → Transactions for faster times
3. Verify in browser that page loads faster
4. If everything looks good, the fix is confirmed working!

---

## Quick Checklist

- [ ] No new "Slow DB Query" issues (✅ You're seeing this)
- [ ] Transaction times are lower in Sentry Performance
- [ ] Page loads faster in browser
- [ ] Query spans show < 200ms (instead of ~1.29s)

If all checked, **the fix is working!** 🎉

