# Self-Healing Code: Testing Guide

**Created:** November 2025  
**Purpose:** Step-by-step guide to test self-healing implementation

---

## Testing Strategy

### Phase 1: Verify Existing Functionality (Regression Testing)
**Goal:** Ensure nothing broke - all existing features work as before

### Phase 2: Test Self-Healing Features
**Goal:** Verify self-healing works when enabled

### Phase 3: Test Feature Flags
**Goal:** Verify disabling self-healing returns to original behavior

---

## Phase 1: Regression Testing (Most Important)

### Test 1: Spam Capture (Status Validation)

**Steps:**
1. Go to **Text Club > Task Management > Spam (Preview → Capture)**
2. Click **"Preview Spam"** - Should work normally
3. Click **"Capture Spam"** - Should work normally
4. Check console for any errors

**Expected Result:**
- ✅ Preview shows spam matches
- ✅ Capture processes spam items
- ✅ Progress popup shows: "Captured 100 / X (total in queue)"
- ✅ No errors in console
- ✅ Spam items move to spam review queue

**What to Look For:**
- Any new errors in console
- Slower performance (should be same speed)
- Different behavior (should be identical)

---

### Test 2: Assistance Requests

**Steps:**
1. Go to **Manager Portal > Assistance Requests**
2. Verify assistance requests load normally
3. Try responding to a request
4. Check console for errors

**Expected Result:**
- ✅ Assistance requests display correctly
- ✅ Can respond to requests
- ✅ No errors in console
- ✅ Same behavior as before

---

### Test 3: All Dashboard Views

**Steps:**
1. Navigate through all dashboard sections:
   - Overview
   - Task Management
   - Agent Management
   - Analytics
   - Team Analytics
2. Check each section loads correctly
3. Verify no console errors

**Expected Result:**
- ✅ All sections load normally
- ✅ Data displays correctly
- ✅ No new errors
- ✅ Performance unchanged

---

## Phase 2: Test Self-Healing Features

### Test 1: Status Validation (Already Integrated)

**How to Test:**
1. **Check Console Logs:**
   - Open browser DevTools → Console
   - Run spam capture
   - Look for: `[SELF-HEAL]` messages

**Expected Logs:**
```
[SELF-HEAL] Blocked invalid status transition: PROMOTED → SPAM_REVIEW (spam capture)
```

**What This Means:**
- ✅ Status validation is working
- ✅ Invalid transitions are being blocked
- ✅ System is preventing data corruption

**How to Verify It's Working:**
1. Check spam review queue
2. Verify no PROMOTED messages appear (they shouldn't)
3. Only READY messages should be in spam review

---

### Test 2: Simulate Error Scenario (Optional - Advanced)

**Note:** This requires temporarily breaking something to test recovery

**Option A: Test Retry Logic (Future Integration)**
1. Temporarily add a delay to an API endpoint
2. Make a request
3. Verify retry happens automatically
4. Check logs for: `[SELF-HEAL] Retry attempt 1/3`

**Option B: Test Circuit Breaker (Future Integration)**
1. Temporarily cause an endpoint to fail
2. Make multiple requests
3. Verify circuit breaker opens after threshold
4. Check logs for: `[SELF-HEAL] Circuit breaker opened`

**⚠️ Warning:** Only do this in a test environment or with feature flags disabled

---

## Phase 3: Test Feature Flags

### Test 1: Disable Self-Healing Globally

**Steps:**
1. Go to **Netlify Dashboard → Site Settings → Environment Variables**
2. Add: `SELF_HEALING_ENABLED` = `false`
3. Redeploy (or wait for auto-deploy)
4. Test spam capture again

**Expected Result:**
- ✅ Everything works exactly as before
- ✅ No `[SELF-HEAL]` logs in console
- ✅ Status validation disabled (allows all transitions)
- ✅ Original behavior restored

**How to Verify:**
- Check console - should see NO `[SELF-HEAL]` messages
- Spam capture should work identically to before

---

### Test 2: Disable Individual Features

**Steps:**
1. In Netlify, set: `SELF_HEALING_STATUS_VALIDATION` = `false`
2. Redeploy
3. Test spam capture

**Expected Result:**
- ✅ Status validation disabled
- ✅ Other self-healing features still work
- ✅ No validation errors logged

---

## Production Testing Checklist

### Before Deployment:
- [ ] All regression tests pass
- [ ] No console errors
- [ ] Performance unchanged
- [ ] Feature flags work

### After Deployment:
- [ ] Monitor Netlify logs for `[SELF-HEAL]` entries
- [ ] Verify spam capture works
- [ ] Check assistance requests load
- [ ] Verify no user-reported issues

---

## How to View Logs

### Netlify Logs:
1. Go to **Netlify Dashboard**
2. Select your site
3. Click **"Functions"** tab
4. Click **"View logs"** for any function
5. Search for: `[SELF-HEAL]`

### Browser Console:
1. Open your application
2. Press **F12** (or right-click → Inspect)
3. Go to **Console** tab
4. Look for messages starting with `[SELF-HEAL]`

### Example Logs You Should See:
```
[SELF-HEAL] Blocked invalid status transition: PROMOTED → SPAM_REVIEW (spam capture)
```

---

## Quick Test Script

### Test Status Validation:

1. **Open Browser Console** (F12)
2. **Navigate to:** Text Club > Task Management > Spam
3. **Click:** "Capture Spam"
4. **Check Console** for:
   ```
   [SELF-HEAL] Blocked invalid status transition...
   ```
5. **Verify:** Spam capture still works normally

**If you see the log:** ✅ Status validation is working  
**If you don't see the log:** Either no invalid transitions occurred, or validation is disabled

---

## Testing Status Validation Specifically

### How to Verify It's Blocking Invalid Transitions:

**Current Implementation:**
- Only scans `READY` messages (already fixed)
- Validates before updating (new self-healing feature)

**Test:**
1. Run spam capture
2. Check console for any `[SELF-HEAL]` messages about blocked transitions
3. If you see: `[SELF-HEAL] Skipping message X: Invalid status transition`
   - ✅ Validation is working
   - ✅ Invalid transitions are being blocked

**Note:** You might not see these logs if:
- All messages are already `READY` (good - no invalid transitions to block)
- Status validation is disabled via feature flag

---

## Monitoring After Deployment

### What to Monitor:

1. **Console Logs:**
   - Look for `[SELF-HEAL]` entries
   - Check for any errors
   - Verify actions are logged

2. **User Reports:**
   - Any new issues?
   - Any performance degradation?
   - Any broken features?

3. **System Behavior:**
   - Spam capture working?
   - Assistance requests loading?
   - No new errors?

---

## Troubleshooting

### If Something Doesn't Work:

**Step 1: Check Feature Flags**
- Verify `SELF_HEALING_ENABLED` is not set to `false`
- Check Netlify environment variables

**Step 2: Check Logs**
- Look for `[SELF-HEAL]` messages
- Check for any errors
- Verify self-healing is active

**Step 3: Disable Self-Healing**
- Set `SELF_HEALING_ENABLED=false` in Netlify
- Redeploy
- Test if issue persists

**Step 4: Check Code**
- Verify imports are correct
- Check for TypeScript errors
- Verify files exist in `src/lib/self-healing/`

---

## Success Criteria

### ✅ Tests Pass If:

1. **Regression Tests:**
   - All existing features work
   - No new errors
   - Performance unchanged

2. **Self-Healing Tests:**
   - Status validation logs appear (if invalid transitions occur)
   - No data corruption
   - System prevents invalid operations

3. **Feature Flag Tests:**
   - Disabling self-healing returns to original behavior
   - No errors when disabled
   - System works normally

---

## Next Steps After Testing

### If All Tests Pass:
1. ✅ Deploy to production
2. ✅ Monitor logs for 24 hours
3. ✅ Integrate next route (assistance API)
4. ✅ Continue gradual rollout

### If Issues Found:
1. ⚠️ Disable self-healing (`SELF_HEALING_ENABLED=false`)
2. ⚠️ Report issue
3. ⚠️ Fix and retest
4. ⚠️ Re-enable when fixed

---

**Document Version:** 1.0  
**Last Updated:** November 2025

