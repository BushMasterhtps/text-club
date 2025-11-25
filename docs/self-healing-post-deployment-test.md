# Self-Healing: Post-Deployment Testing Checklist

**Created:** November 2025  
**Purpose:** Quick testing checklist after deployment

---

## Quick Test Checklist (5-10 minutes)

### ✅ Test 1: Spam Capture (Status Validation)

**Steps:**
1. Go to **Text Club > Task Management > Spam (Preview → Capture)**
2. Click **"Preview Spam"** button
3. Click **"Capture Spam"** button
4. Check browser console (F12 → Console tab)

**What to Look For:**
- ✅ Spam capture works normally
- ✅ Progress popup shows: "Captured 100 / X (total in queue)"
- ✅ No errors in console
- ✅ If you see: `[SELF-HEAL] Blocked invalid status transition` → Status validation is working

**Expected Result:**
- Everything works as before
- No new errors
- Status validation prevents invalid transitions (if any occur)

---

### ✅ Test 2: Assistance Requests (Most Critical)

**Steps:**
1. Go to **Manager Portal > Assistance Requests** (or any dashboard with assistance requests)
2. Verify assistance requests load
3. Open browser console (F12 → Console tab)
4. Look for `[SELF-HEAL]` messages

**What to Look For:**
- ✅ Assistance requests display correctly
- ✅ No errors in console
- ✅ If API fails temporarily, should auto-retry
- ✅ Check console for: `[SELF-HEAL]` messages

**Expected Result:**
- Requests load normally
- If connection issue occurs, system retries automatically
- No JSON parsing errors

---

### ✅ Test 3: All Dashboard Views (Regression Test)

**Steps:**
1. Navigate through all sections:
   - Overview
   - Task Management
   - Agent Management
   - Analytics
   - Team Analytics
2. Check browser console for errors

**What to Look For:**
- ✅ All sections load correctly
- ✅ No new errors in console
- ✅ Performance unchanged
- ✅ Data displays correctly

**Expected Result:**
- Everything works exactly as before
- No broken features
- No performance degradation

---

## Monitoring (After Testing)

### Check Netlify Logs:

1. Go to **Netlify Dashboard → Your Site → Functions → View logs**
2. Search for: `[SELF-HEAL]`
3. Look for:
   - Retry attempts
   - Circuit breaker activations
   - Status validation blocks
   - Any errors

**What You Should See:**
```
[SELF-HEAL] Blocked invalid status transition: PROMOTED → SPAM_REVIEW (spam capture)
[SELF-HEAL] Retry attempt 1/3 after 1000ms
[SELF-HEAL] Circuit breaker assistance-api OPENED (3 failures)
```

**If You See These:**
- ✅ Self-healing is working
- ✅ System is preventing issues
- ✅ Logging is functioning

---

## Success Criteria

### ✅ Tests Pass If:

1. **Spam Capture:**
   - Works normally
   - Progress popup shows correctly
   - No errors

2. **Assistance Requests:**
   - Load correctly
   - No JSON parsing errors
   - Auto-retry works (if needed)

3. **All Dashboards:**
   - Load correctly
   - No new errors
   - Performance unchanged

4. **Logs:**
   - `[SELF-HEAL]` messages appear (if issues occur)
   - No unexpected errors

---

## If Something Doesn't Work

### Quick Disable (Instant Rollback):

1. Go to **Netlify Dashboard → Site Settings → Environment Variables**
2. Add: `SELF_HEALING_ENABLED` = `false`
3. Redeploy (or wait for auto-deploy)

**This instantly disables all self-healing and returns to original behavior.**

---

## What's Protected Now

After this deployment, these features have self-healing:

1. ✅ **Spam Capture** - Status validation prevents invalid transitions
2. ✅ **Assistance API** - Retry + circuit breaker for connection issues
3. ✅ **Frontend Assistance Loading** - Response validation + auto-retry
4. ✅ **Frontend Spam Capture** - Response validation

---

## Expected Behavior

### Normal Operation (No Issues):
- Everything works exactly as before
- No `[SELF-HEAL]` logs (because no issues occurred)
- Same performance
- Same user experience

### When Issues Occur:
- System automatically retries
- Circuit breaker prevents cascading failures
- Status validation blocks invalid operations
- Logs show `[SELF-HEAL]` actions
- Users see graceful errors (not crashes)

---

**Document Version:** 1.0  
**Last Updated:** November 2025

