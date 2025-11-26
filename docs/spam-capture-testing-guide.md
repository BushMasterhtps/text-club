# Spam Capture Testing Guide

**Created:** December 2024  
**Purpose:** Comprehensive testing guide for hybrid spam capture optimization

## Pre-Deployment Checklist

### ✅ Code Quality
- [x] All linter errors resolved
- [x] TypeScript compilation successful
- [x] No breaking changes to other APIs
- [x] Self-healing wrappers integrated

### ✅ Files Changed
- [x] `src/lib/spam-detection.ts` - Added batch function
- [x] `src/app/api/manager/spam/capture/route.ts` - Fast capture
- [x] `src/app/api/manager/spam/capture-background/route.ts` - Background processing
- [x] `src/app/manager/page.tsx` - Frontend two-step flow
- [x] `docs/spam-capture-hybrid-optimization.md` - Documentation

## Testing Scenarios

### 1. **Basic Functionality Test** (Start Here)

**Goal:** Verify fast capture works correctly

**Steps:**
1. Navigate to Manager Portal > Text Club > Task Management
2. Check "Pending Text Club Messages" count (note the number)
3. Click "Preview Spam" button
   - Should show preview of spam matches
   - Note the counts (phrase, pattern, learning)
4. Click "Capture Spam" button
   - Should complete in 2-5 seconds
   - Should show: "✅ Fast capture complete! Captured X spam items (phrase rules)"
   - Should automatically start background processing
   - Should show progress: "Processing pattern + learning matches..."

**Expected Results:**
- ✅ Fast capture completes quickly (2-5 seconds)
- ✅ Background processing starts automatically
- ✅ Progress updates appear in UI
- ✅ Final message shows total captured

**What to Check:**
- [ ] Fast capture time is 2-5 seconds
- [ ] Background processing starts automatically
- [ ] Progress messages appear
- [ ] Final count matches preview (or close to it)
- [ ] "Pending Text Club Messages" count decreases

---

### 2. **Small Queue Test** (< 100 messages)

**Goal:** Verify system works with small volumes

**Steps:**
1. Ensure queue has < 100 READY messages
2. Click "Preview Spam"
3. Click "Capture Spam"
4. Monitor console logs (F12 > Console)

**Expected Results:**
- ✅ Fast capture completes in < 3 seconds
- ✅ Background processing completes in < 10 seconds
- ✅ Total time: < 15 seconds
- ✅ All spam captured

**What to Check:**
- [ ] No errors in console
- [ ] No timeout errors
- [ ] All spam items moved to spam review queue
- [ ] Counts match preview

---

### 3. **Medium Queue Test** (100-1000 messages)

**Goal:** Verify system handles medium volumes

**Steps:**
1. Ensure queue has 100-1000 READY messages
2. Click "Preview Spam"
3. Note the preview counts
4. Click "Capture Spam"
5. Monitor progress

**Expected Results:**
- ✅ Fast capture completes in 2-5 seconds
- ✅ Background processing completes in 10-20 seconds
- ✅ Total time: 12-25 seconds
- ✅ All spam captured

**What to Check:**
- [ ] No timeout errors
- [ ] Progress updates show correct counts
- [ ] Background processing completes successfully
- [ ] Final count matches preview

---

### 4. **Large Queue Test** (1000+ messages)

**Goal:** Verify system handles large volumes without timeouts

**Steps:**
1. Ensure queue has 1000+ READY messages
2. Click "Preview Spam"
3. Note the preview counts (should show ~500-600 matches)
4. Click "Capture Spam"
5. Monitor progress carefully

**Expected Results:**
- ✅ Fast capture completes in 2-5 seconds
- ✅ Background processing runs in batches (200 at a time)
- ✅ Progress updates show: "Processing X messages... Y remaining"
- ✅ Total time: 1-2 minutes (no timeouts)
- ✅ All spam captured

**What to Check:**
- [ ] No timeout errors
- [ ] Background processing shows progress
- [ ] Multiple batches process successfully
- [ ] Final count matches preview
- [ ] No "Inactivity Timeout" errors

---

### 5. **Edge Cases**

#### 5a. **No Spam in Queue**

**Steps:**
1. Ensure queue has READY messages but no spam matches
2. Click "Preview Spam" (should show 0 matches)
3. Click "Capture Spam"

**Expected Results:**
- ✅ Fast capture completes quickly (< 2 seconds)
- ✅ Shows "Captured 0 spam items"
- ✅ Background processing may not start (or completes quickly)
- ✅ No errors

#### 5b. **All Messages Are Spam**

**Steps:**
1. Ensure queue has many READY messages, all matching spam rules
2. Click "Preview Spam" (should show high match count)
3. Click "Capture Spam"

**Expected Results:**
- ✅ Fast capture catches phrase rule matches
- ✅ Background processing catches pattern + learning matches
- ✅ All spam captured
- ✅ Queue count decreases significantly

#### 5c. **Empty Queue**

**Steps:**
1. Ensure queue has 0 READY messages
2. Click "Capture Spam"

**Expected Results:**
- ✅ Fast capture completes immediately
- ✅ Shows "Captured 0 spam items"
- ✅ No errors
- ✅ Background processing doesn't start

---

### 6. **Error Handling Test**

#### 6a. **Network Error Simulation**

**Steps:**
1. Open DevTools > Network tab
2. Set throttling to "Offline"
3. Click "Capture Spam"
4. Restore network

**Expected Results:**
- ✅ Error message displayed
- ✅ Self-healing retries (if enabled)
- ✅ User can retry manually

#### 6b. **Partial Failure**

**Steps:**
1. Monitor console during capture
2. Look for any error messages
3. Check if partial results are saved

**Expected Results:**
- ✅ Partial results saved (if any captured)
- ✅ Error message displayed
- ✅ User can retry

---

### 7. **Performance Monitoring**

**Goal:** Verify performance improvements

**Steps:**
1. Open DevTools > Network tab
2. Click "Capture Spam"
3. Monitor request times:
   - Fast capture: Should be 2-5 seconds
   - Background processing: Should be 10-20 seconds per batch

**Expected Results:**
- ✅ Fast capture: < 5 seconds
- ✅ Background processing: < 20 seconds per batch
- ✅ No timeouts (26+ seconds)

**Metrics to Record:**
- Fast capture time: _____ seconds
- Background processing time: _____ seconds
- Total messages processed: _____
- Total spam captured: _____
- Time per message: _____ ms

---

### 8. **API Endpoint Testing**

#### 8a. **Fast Capture Endpoint**

**Test:** `POST /api/manager/spam/capture`

**Expected Response:**
```json
{
  "success": true,
  "updatedCount": 123,
  "totalInQueue": 1000,
  "remainingInQueue": 877,
  "processed": 1000,
  "phraseMatchedCount": 123,
  "needsBackground": true,
  "elapsed": 2345
}
```

**What to Check:**
- [ ] `success: true`
- [ ] `updatedCount` > 0 (if spam exists)
- [ ] `needsBackground: true` (if messages remain)
- [ ] `elapsed` < 5000ms

#### 8b. **Background Processing Endpoint**

**Test:** `POST /api/manager/spam/capture-background`

**Request Body:**
```json
{
  "skip": 0,
  "take": 200
}
```

**Expected Response:**
```json
{
  "success": true,
  "updatedCount": 45,
  "processed": 200,
  "remaining": 155,
  "complete": false,
  "patternMatchedCount": 30,
  "learningMatchedCount": 15,
  "elapsed": 1234,
  "nextSkip": 200
}
```

**What to Check:**
- [ ] `success: true`
- [ ] `processed` matches `take` (or less if complete)
- [ ] `complete: true` when done
- [ ] `nextSkip` increments correctly

---

### 9. **Console Log Monitoring**

**What to Look For:**

**Good Logs:**
```
[SPAM CAPTURE FAST] Processing 1000 messages (phrase rules only)
[SPAM CAPTURE FAST] Found 123 phrase rule matches
[SPAM CAPTURE FAST] Updated 123 messages to SPAM_REVIEW status
[SPAM CAPTURE FAST] Completed in 2345ms
[SPAM CAPTURE BACKGROUND] Processing 200 messages (skip: 0, take: 200)
[SPAM CAPTURE BACKGROUND] Found 45 matches (30 pattern, 15 learning)
```

**Bad Logs (Watch For):**
```
❌ Error: Inactivity Timeout
❌ Error: Too many database connections
❌ Error: Failed to capture spam
❌ [SELF-HEAL] Skipping message...
```

---

### 10. **Regression Testing**

**Goal:** Ensure other features still work

**Test These Features:**
- [ ] Preview Spam button (should still work)
- [ ] Spam Review Queue (should show captured spam)
- [ ] Apply Spam Reviewer Decisions (should work)
- [ ] Spam Rules management (should work)
- [ ] Other task types (Text Club, WOD/IVCS, etc.)

---

## Success Criteria

### ✅ Must Pass
- [ ] Fast capture completes in 2-5 seconds
- [ ] Background processing completes without timeouts
- [ ] All spam captured (matches preview count)
- [ ] No errors in console
- [ ] Progress updates display correctly
- [ ] Other APIs still work

### ✅ Performance Targets
- [ ] 1000 messages: < 20 seconds total
- [ ] 9000 messages: < 2 minutes total
- [ ] No timeouts (26+ seconds)

### ✅ User Experience
- [ ] Clear progress messages
- [ ] Automatic background processing
- [ ] Final success message
- [ ] Counts refresh automatically

---

## Troubleshooting

### Issue: Fast capture takes too long (> 5 seconds)
**Possible Causes:**
- Too many phrase rules
- Database connection issues
- Large message queue

**Solutions:**
- Check database connection
- Review phrase rules count
- Check Netlify logs

### Issue: Background processing doesn't start
**Possible Causes:**
- `needsBackground` not set to `true`
- Frontend error
- Network issue

**Solutions:**
- Check browser console for errors
- Verify API response includes `needsBackground: true`
- Check network tab for failed requests

### Issue: Background processing times out
**Possible Causes:**
- Batch size too large
- Database connection pool exhausted
- Too many messages

**Solutions:**
- Reduce batch size (currently 200)
- Check database connection pool
- Process in smaller chunks

### Issue: Not all spam captured
**Possible Causes:**
- Background processing incomplete
- Threshold too high
- Pattern/learning not matching

**Solutions:**
- Check if background processing completed
- Review threshold settings (50% pattern, 60% learning)
- Check preview spam counts vs. captured counts

---

## Post-Deployment Monitoring

### Metrics to Track
1. **Fast capture execution time** (should be 2-5s)
2. **Background processing execution time** (should be 10-20s per batch)
3. **Total spam captured per run**
4. **Error rates**
5. **Timeout occurrences** (should be 0)

### Logs to Monitor
- Netlify function logs
- Browser console logs
- Database connection logs

### Alerts to Set Up
- Timeout errors
- 500 errors
- Database connection errors
- High execution times (> 20s)

---

## Rollback Plan

If issues occur:

1. **Immediate Rollback:**
   ```bash
   git revert HEAD
   git push
   ```

2. **Disable Background Processing:**
   - Comment out `processBackgroundCapture()` call in frontend
   - Fast capture will still work (phrase rules only)

3. **Monitor:**
   - Check Netlify deployment logs
   - Monitor error rates
   - Check user reports

---

## Test Report Template

**Date:** _____________  
**Tester:** _____________  
**Environment:** Production / Staging

### Test Results

| Test Scenario | Status | Notes |
|--------------|--------|-------|
| Basic Functionality | ✅ / ❌ | |
| Small Queue (< 100) | ✅ / ❌ | |
| Medium Queue (100-1000) | ✅ / ❌ | |
| Large Queue (1000+) | ✅ / ❌ | |
| No Spam | ✅ / ❌ | |
| All Spam | ✅ / ❌ | |
| Error Handling | ✅ / ❌ | |
| Performance | ✅ / ❌ | |

### Performance Metrics

- Fast capture time: _____ seconds
- Background processing time: _____ seconds
- Total messages processed: _____
- Total spam captured: _____
- Errors encountered: _____

### Issues Found

1. _____________
2. _____________
3. _____________

### Recommendations

1. _____________
2. _____________
3. _____________

---

**Ready to test!** Start with Test #1 (Basic Functionality) and work through the scenarios.

